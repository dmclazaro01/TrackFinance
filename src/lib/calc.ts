import type { Quote } from "./finance";

// ── Input shapes (mirror Prisma models, but plain & serializable) ──

export type HoldingInput = {
  id: string;
  type: string;
  name: string;
  symbol: string;
  isin: string | null;
  currency: string;
  quantity: number;
  avgBuyPrice: number;
  dcaAmount: number;
  dcaStartDate: string | null;
};

/** A holding whose DCA plan has already been resolved server-side. */
export type HoldingWithDca = HoldingInput & {
  effectiveQuantity: number;
  effectiveAvgBuyPrice: number;
  dcaInvested: number;
  dcaContributions: number;
  dcaNextDate: string | null;
};

export type PropertyInput = {
  id: string;
  name: string;
  currentValue: number;
  purchaseValue: number;
  purchaseDate: string | null;
  hasMortgage: boolean;
  mortgageBalance: number;
  mortgageTin: number;
  mortgageMonths: number;
  mortgageStartDate: string | null; // desde qué mes se cobra la cuota (null = siempre)
  mortgageAccountId: string | null;
  // Online appraisal (Catastro × zonal €/m²)
  cadastralRef: string | null;
  address: string | null;
  province: string | null;
  surfaceM2: number | null;
  autoValuation: boolean;
  appraisedValue: number | null;
  appraisedAt: string | null;
};

/** Effective value: the online appraisal when enabled, else the manual value. */
export function propertyValue(p: PropertyInput): number {
  if (p.autoValuation && p.appraisedValue != null) return p.appraisedValue;
  return p.currentValue;
}

export type CashInput = {
  id: string;
  name: string;
  balance: number;
  currency: string;
  apr: number; // annual nominal rate; capitalised monthly
  cashbackPercent: number; // % cashback on card spending
  updatedAt: string; // anchor for interest accrual (resets when you edit it)
};

export const TX_KINDS = [
  "Ingresos",
  "Gastos fijos",
  "Gastos variables",
  "Inversiones",
] as const;

/** Aportación a inversiones (fondos, ETFs, etc.) — no es un gasto.
 *  Cualquier fila de gasto (`type === "EXPENSE"`) que NO sea una inversión
 *  se considera gasto por defecto (catch-all), igual que el comportamiento
 *  original: nunca se descarta silenciosamente un importe por tener un
 *  `kind` legacy/inesperado (p. ej. `null`). */
export function isInvestmentKind(kind: string | null): boolean {
  return kind === "Inversiones";
}

/**
 * "YYYY-MM-DD" en el calendario LOCAL de una fecha (Date o ISO string).
 * Úsalo para prellenar `<input type="date">`, claves de fecha y meses —
 * nunca `date.toISOString().slice(0, N)`. Los `DateTime` de Prisma se
 * guardan/leen como timestamp naive; el driver escribe con los componentes
 * UTC y lee reinterpretándolos como locales, así que sólo los componentes
 * *locales* del `Date` resultante coinciden con la fecha que introdujo el
 * usuario. `.toISOString()` (siempre UTC) puede mostrar el día anterior en
 * zonas horarias adelantadas a UTC (España, CET/CEST) — ese fue justo el bug:
 * una hipoteca con inicio "01/09" se contaba desde agosto por este motivo.
 */
export function localDateKey(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" (calendario local) de una fecha ISO. Compartido entre
 *  MonthlyView e HistoryOverview para agrupar transacciones por mes. */
export function monthKey(iso: string): string {
  return localDateKey(iso).slice(0, 7);
}

/** Importe de costes fijos recurrentes (seguros + hipotecas + deudas) que toca
 *  pagar en un mes concreto. Se omite un recurrente si ese mes ya existe un
 *  movimiento que lo refleje (por descripción/categoría o por importe), para
 *  no contarlo dos veces si el usuario lo apunta también a mano. */
export function recurringDueForMonth(args: {
  month: string;
  transactions: TransactionInput[];
  insurances: InsuranceInput[];
  properties: PropertyInput[];
  debts?: DebtInput[];
  /** Si se indica, sólo cuenta los recurrentes cuya cuenta de pago sea ésta
   *  (uso: proyectar el efecto de un recurrente en el saldo de su cuenta). */
  accountId?: string;
}): number {
  const { month, transactions, insurances, properties, debts = [], accountId } = args;

  const monthTxs = transactions.filter((t) => monthKey(t.date) === month);
  // Sólo los gastos pueden tapar un recurrente: un ingreso con el mismo
  // importe nunca debe anular el cargo previsto.
  const matches = (keywords: string[], amount: number) =>
    monthTxs.some((t) => {
      if (t.type !== "EXPENSE") return false;
      const hay = `${t.category ?? ""} ${t.description ?? ""}`.toLowerCase();
      if (keywords.some((k) => k && hay.includes(k.toLowerCase()))) return true;
      return Math.abs(t.amount - amount) < 0.01;
    });

  const curM = Number(month.slice(5, 7));
  const activeFrom = (startDate: string | null) => startDate == null || month >= monthKey(startDate);
  let total = 0;

  for (const ins of insurances) {
    if (accountId !== undefined && ins.accountId !== accountId) continue;
    const due = ins.premium;
    if (due <= 0) continue;
    let isDue = false;
    if (ins.frequency === "MONTHLY") {
      isDue = activeFrom(ins.startDate);
    } else if (ins.renewalDate) {
      const renewM = new Date(ins.renewalDate).getMonth() + 1;
      if (ins.frequency === "ANNUAL") isDue = curM === renewM && activeFrom(ins.startDate);
      else if (ins.frequency === "QUARTERLY") isDue = (curM - renewM) % 3 === 0 && activeFrom(ins.startDate);
    }
    if (!isDue) continue;
    if (matches([ins.name, ins.provider ?? ""], due)) continue;
    total += due;
  }

  for (const prop of properties) {
    if (accountId !== undefined && prop.mortgageAccountId !== accountId) continue;
    if (!prop.hasMortgage || prop.mortgageBalance <= 0 || prop.mortgageMonths <= 0) continue;
    if (!activeFrom(prop.mortgageStartDate)) continue;
    // La hipoteca deja de cargarse cuando se agotan las cuotas.
    if (prop.mortgageStartDate) {
      const elapsed = paymentsElapsed(monthKey(prop.mortgageStartDate), month);
      if (prop.mortgageMonths - elapsed <= 0) continue;
    }
    const due = monthlyPayment(prop.mortgageBalance, prop.mortgageTin, prop.mortgageMonths);
    if (due <= 0) continue;
    if (matches(["hipoteca", "mortgage", prop.name], due)) continue;
    total += due;
  }

  for (const d of debts) {
    if (accountId !== undefined && d.accountId !== accountId) continue;
    if (d.balance <= 0 || d.months <= 0) continue;
    if (d.startDate) {
      if (month < monthKey(d.startDate)) continue; // aún no arranca
      const elapsed = paymentsElapsed(monthKey(d.startDate), month);
      if (d.months - elapsed <= 0) continue; // ya amortizada
    }
    const due = monthlyPayment(d.balance, d.tin, d.months);
    if (due <= 0) continue;
    if (matches([d.name], due)) continue;
    total += due;
  }

  return total;
}

/** "YYYY-MM" desde `from` hasta `to`, ambos incluidos (orden cronológico). */
function monthsInRange(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Recurrentes por mes, para todos los meses presentes en las transacciones. */
export function recurringByMonth(args: {
  transactions: TransactionInput[];
  insurances: InsuranceInput[];
  properties: PropertyInput[];
  debts?: DebtInput[];
}): Map<string, number> {
  const { transactions, insurances, properties, debts } = args;
  const months = new Set(transactions.map((t) => monthKey(t.date)));
  const out = new Map<string, number>();
  for (const m of months) {
    out.set(m, recurringDueForMonth({ month: m, transactions, insurances, properties, debts }));
  }
  return out;
}

export type ImportResult = { imported: number; skipped: number; error?: string };

export type TransactionInput = {
  id: string;
  type: string; // INCOME | EXPENSE
  kind: string | null; // Ingresos | Gastos fijos | Gastos variables | Inversiones
  amount: number;
  currency: string;
  date: string;
  category: string | null;
  description: string | null;
  accountId: string | null;
  cashback: number;
};

/** Whole months elapsed since an ISO date. */
export function completedMonths(fromISO: string): number {
  const from = new Date(fromISO);
  if (Number.isNaN(from.getTime())) return 0;
  const now = new Date();
  let m =
    (now.getFullYear() - from.getFullYear()) * 12 +
    (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) m -= 1; // month not yet completed
  return Math.max(0, m);
}

/**
 * Net effect of logged transactions on an account since its balance was last
 * set (`updatedAt`): + income + cashback − expenses. Transactions dated before
 * the anchor are assumed already reflected in the entered balance.
 */
export function accountTxDelta(
  account: CashInput,
  transactions: TransactionInput[],
  insurances: InsuranceInput[] = [],
  properties: PropertyInput[] = [],
  debts: DebtInput[] = [],
): number {
  const anchor = new Date(account.updatedAt);
  anchor.setHours(0, 0, 0, 0);
  let delta = 0;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    if (new Date(t.date) < anchor) continue;
    delta += (t.type === "INCOME" ? t.amount : -t.amount) + (t.cashback || 0);
  }

  // Seguros, deudas e hipotecas con esta cuenta como "se paga desde" también
  // descuentan el saldo proyectado, mes a mes — igual que si el usuario los
  // hubiera registrado a mano (recurringDueForMonth ya evita duplicar si sí
  // los registró). Se cobran el día 1 de cada mes: si el saldo se fijó ese
  // día o después, el cargo de ese mes ya va incluido y no se vuelve a restar.
  const anchorDay = localDateKey(account.updatedAt); // YYYY-MM-DD local
  const anchorMonth = anchorDay.slice(0, 7);
  const nowMonth = monthKey(new Date().toISOString());
  for (const m of monthsInRange(anchorMonth, nowMonth)) {
    const dueDay = `${m}-01`;
    if (dueDay <= anchorDay) continue;
    delta -= recurringDueForMonth({
      month: m,
      transactions,
      insurances,
      properties,
      debts,
      accountId: account.id,
    });
  }
  return delta;
}

/** Balance grown by monthly-capitalised interest since `updatedAt`, plus the
 *  net of logged transactions (`txDelta`). */
export function cashEffective(account: CashInput, txDelta = 0) {
  const r = account.apr / 100 / 12;
  const months = completedMonths(account.updatedAt);
  const withInterest =
    r > 0 && months > 0 ? account.balance * Math.pow(1 + r, months) : account.balance;
  const effectiveBalance = withInterest + txDelta;
  return {
    months,
    effectiveBalance,
    accrued: withInterest - account.balance, // interest only
    txDelta,
    monthlyGeneration: effectiveBalance * r, // what it will generate next month
  };
}

export type DebtInput = {
  id: string;
  name: string;
  balance: number;
  tin: number;
  months: number;
  startDate: string | null; // mes del primer cargo (null = no amortiza)
  accountId: string | null;
};

export type InsuranceInput = {
  id: string;
  name: string;
  type: string;
  provider: string | null;
  premium: number;
  frequency: string; // MONTHLY | QUARTERLY | ANNUAL
  coverage: number;
  currency: string;
  renewalDate: string | null;
  startDate: string | null; // alta: desde qué mes se cuenta (null = siempre)
  accountId: string | null;
};

/** Normalize a premium paid at a given frequency into a monthly figure. */
export function monthlyFromFrequency(amount: number, frequency: string): number {
  switch (frequency) {
    case "MONTHLY":
      return amount;
    case "QUARTERLY":
      return amount / 3;
    case "ANNUAL":
      return amount / 12;
    default:
      return amount;
  }
}

export type ProfileInput = {
  baseCurrency: string;
  grossSalary: number;
  netMonthly: number;
  monthlyExpenses: number;
  salaryAccountId: string | null; // main account — receives the leftover %
};

export type SalaryAllocationInput = {
  id: string;
  accountId: string;
  percent: number;
};

// ── Enriched output ──

export type EnrichedHolding = HoldingInput & {
  // `quantity` / `avgBuyPrice` here are the EFFECTIVE position (manual + DCA).
  baseQuantity: number; // manual quantity the user entered
  baseAvgBuyPrice: number; // manual avg buy price the user entered
  dcaInvested: number;
  dcaContributions: number;
  dcaNextDate: string | null;
  price: number | null;
  priceCurrency: string | null;
  live: boolean;
  marketValueBase: number;
  costBase: number;
  plBase: number;
  plPct: number;
  dayChangeBase: number;
  dayChangePct: number | null;
};

export type PortfolioSummary = {
  base: string;
  realEstate: number;
  investments: number;
  cash: number;
  grossAssets: number;
  mortgages: number;
  otherDebts: number;
  liabilities: number;
  netWorth: number;
  investmentCost: number;
  investmentPL: number;
  investmentPLPct: number;
  dayChange: number;
  monthlyIncome: number; // salary + cash remuneration
  cashInterestMonthly: number; // monthly remuneration from remunerated accounts
  monthlyOutflow: number; // expenses + debt/mortgage payments + insurance
  insuranceMonthly: number;
  monthlyNet: number;
  // Logged transactions for the current calendar month
  txMonth: {
    income: number;
    expenses: number;
    investments: number;
    recurring: number;
    cashback: number;
    net: number;
  };
  allocation: { label: string; value: number }[];
};

/** Standard French amortization monthly payment. */
export function monthlyPayment(
  balance: number,
  annualRatePct: number,
  months: number,
): number {
  if (balance <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return balance / months;
  const factor = Math.pow(1 + r, months);
  return (balance * r * factor) / (factor - 1);
}

/** Cuotas (cargo el día 1 de cada mes) ya vencidas entre el mes de inicio y
 *  `month`, ambos incluidos. 0 si el préstamo aún no ha arrancado. */
function paymentsElapsed(startMonth: string, month: string): number {
  return startMonth <= month ? monthsInRange(startMonth, month).length : 0;
}

/** French amortization: capital pendiente tras `paid` cuotas. */
export function amortizedBalance(
  balance: number,
  annualRatePct: number,
  months: number,
  paid: number,
): number {
  if (balance <= 0 || months <= 0) return 0;
  if (paid <= 0) return balance;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.max(0, balance * (1 - paid / months));
  const growth = Math.pow(1 + r, paid);
  const payment = monthlyPayment(balance, annualRatePct, months);
  return Math.max(0, balance * growth - (payment * (growth - 1)) / r);
}

/**
 * Estado HOY de un préstamo francés (hipoteca o deuda): capital pendiente,
 * meses restantes y cuota. `balance`/`months` son los valores EN `startDate`
 * (primer cargo: día 1 de ese mes); sin `startDate` no se puede amortizar y
 * se devuelven tal cual.
 */
export function loanStatus(args: {
  balance: number;
  tin: number;
  months: number;
  startDate: string | null;
}): { balance: number; months: number; payment: number } {
  const { balance, tin, months, startDate } = args;
  if (balance <= 0 || months <= 0) return { balance: 0, months: 0, payment: 0 };
  const nowMonth = monthKey(new Date().toISOString());
  const paid = startDate ? paymentsElapsed(monthKey(startDate), nowMonth) : 0;
  const monthsLeft = Math.max(0, months - paid);
  return {
    balance: paid > 0 ? amortizedBalance(balance, tin, months, paid) : balance,
    months: monthsLeft,
    payment: monthsLeft > 0 ? monthlyPayment(balance, tin, months) : 0,
  };
}

/** Estado hoy de la hipoteca de una propiedad (amortizada desde su inicio). */
export function mortgageStatus(p: PropertyInput): {
  balance: number;
  months: number;
  payment: number;
} {
  if (!p.hasMortgage) return { balance: 0, months: 0, payment: 0 };
  return loanStatus({
    balance: p.mortgageBalance,
    tin: p.mortgageTin,
    months: p.mortgageMonths,
    startDate: p.mortgageStartDate,
  });
}

/** Estado hoy de una deuda (amortizada desde su inicio). */
export function debtStatus(d: DebtInput): {
  balance: number;
  months: number;
  payment: number;
} {
  return loanStatus({
    balance: d.balance,
    tin: d.tin,
    months: d.months,
    startDate: d.startDate,
  });
}

export type TransferDestInput =
  | { kind: "existing"; quantity: number; avgBuyPrice: number }
  | { kind: "new" };

export type TransferComputeInput = {
  mode: "eur" | "units";
  amount: number;
  /** Precio unitario el día de venta (origen). */
  priceFrom: number;
  /** Precio unitario el día de compra (destino). */
  priceTo: number;
  originQuantity: number;
  originAvgBuyPrice: number;
  dest: TransferDestInput;
};

export type TransferComputeResult =
  | {
      ok: true;
      unitsOut: number;
      valueMoved: number;
      unitsIn: number;
      origin: { quantity: number; avgBuyPrice: number };
      dest:
        | { kind: "existing"; quantity: number; avgBuyPrice: number }
        | { kind: "new"; quantity: number; avgBuyPrice: number };
    }
  | { ok: false; error: string };

/**
 * Pure math for a fund transfer. Max out = originQuantity (manual base only).
 * valueMoved = unitsOut × priceFrom (sale-day price).
 * unitsIn = valueMoved / priceTo (buy-day price) — captures market moves between dates.
 * Dest avg uses costIn = valueMoved.
 */
export function computeTransfer(input: TransferComputeInput): TransferComputeResult {
  const { mode, amount, priceFrom, priceTo, originQuantity, originAvgBuyPrice, dest } =
    input;

  if (!(amount > 0)) return { ok: false, error: "La cantidad debe ser mayor que 0." };
  if (!(priceFrom > 0) || !(priceTo > 0)) {
    return { ok: false, error: "Los precios deben ser mayores que 0." };
  }
  if (!(originQuantity > 0)) {
    return { ok: false, error: "El fondo origen no tiene participaciones manuales." };
  }

  const unitsOut = mode === "eur" ? amount / priceFrom : amount;
  if (!(unitsOut > 0)) return { ok: false, error: "La cantidad resultante es 0." };
  if (unitsOut > originQuantity + 1e-9) {
    return {
      ok: false,
      error: "No hay suficientes participaciones manuales en el origen.",
    };
  }

  const valueMoved = unitsOut * priceFrom;
  const unitsIn = valueMoved / priceTo;
  const originQty = originQuantity - unitsOut;

  if (dest.kind === "new") {
    return {
      ok: true,
      unitsOut,
      valueMoved,
      unitsIn,
      origin: { quantity: originQty, avgBuyPrice: originAvgBuyPrice },
      dest: { kind: "new", quantity: unitsIn, avgBuyPrice: priceTo },
    };
  }

  const destQty = dest.quantity + unitsIn;
  const destAvg =
    destQty > 0 ? (dest.quantity * dest.avgBuyPrice + valueMoved) / destQty : priceTo;

  return {
    ok: true,
    unitsOut,
    valueMoved,
    unitsIn,
    origin: { quantity: originQty, avgBuyPrice: originAvgBuyPrice },
    dest: { kind: "existing", quantity: destQty, avgBuyPrice: destAvg },
  };
}

function conv(amount: number, currency: string, fx: Record<string, number>): number {
  const rate = fx[currency.toUpperCase()] ?? 1;
  return amount * rate;
}

export function enrichHoldings(
  holdings: HoldingWithDca[],
  quotes: Record<string, Quote>,
  fx: Record<string, number>,
): EnrichedHolding[] {
  return holdings.map((h) => {
    const q = quotes[h.symbol.toUpperCase()];
    const price = q?.price ?? null;
    const priceCurrency = q?.currency ?? h.currency;
    const live = price != null;

    // Effective position = manual entry + accrued DCA contributions.
    const qty = h.effectiveQuantity;
    const avg = h.effectiveAvgBuyPrice;

    // Market value in the quote's currency → base.
    const rawValue = live ? price! * qty : avg * qty;
    const valueCurrency = live ? priceCurrency : h.currency;
    const marketValueBase = conv(rawValue, valueCurrency, fx);

    // Cost basis is in the holding's declared currency.
    const costBase = conv(avg * qty, h.currency, fx);

    const plBase = marketValueBase - costBase;
    const plPct = costBase > 0 ? (plBase / costBase) * 100 : 0;

    const dayChangePerUnit = q?.change ?? 0;
    const dayChangeBase = live
      ? conv(dayChangePerUnit * qty, priceCurrency, fx)
      : 0;

    return {
      ...h,
      quantity: qty,
      avgBuyPrice: avg,
      baseQuantity: h.quantity,
      baseAvgBuyPrice: h.avgBuyPrice,
      dcaInvested: h.dcaInvested,
      dcaContributions: h.dcaContributions,
      dcaNextDate: h.dcaNextDate,
      price,
      priceCurrency,
      live,
      marketValueBase,
      costBase,
      plBase,
      plPct,
      dayChangeBase,
      dayChangePct: q?.changePercent ?? null,
    };
  });
}

export function summarize(args: {
  profile: ProfileInput;
  properties: PropertyInput[];
  holdings: EnrichedHolding[];
  cash: CashInput[];
  debts: DebtInput[];
  insurances: InsuranceInput[];
  transactions: TransactionInput[];
  fx: Record<string, number>;
}): PortfolioSummary {
  const { profile, properties, holdings, cash, debts, insurances, transactions, fx } =
    args;
  const base = profile.baseCurrency;

  const realEstate = properties.reduce((s, p) => s + propertyValue(p), 0);
  // Pasivos al día: capital pendiente ya amortizado (no el valor de origen).
  const mortgages = properties.reduce((s, p) => s + mortgageStatus(p).balance, 0);
  const investments = holdings.reduce((s, h) => s + h.marketValueBase, 0);
  const investmentCost = holdings.reduce((s, h) => s + h.costBase, 0);
  const investmentPL = investments - investmentCost;
  const dayChange = holdings.reduce((s, h) => s + h.dayChangeBase, 0);
  // Remunerated accounts capitalise interest; logged transactions move the
  // balance too (income/cashback add, expenses subtract).
  const cashTotal = cash.reduce(
    (s, c) =>
      s +
      conv(
        cashEffective(c, accountTxDelta(c, transactions, insurances, properties, debts))
          .effectiveBalance,
        c.currency,
        fx,
      ),
    0,
  );
  const cashInterestMonthly = cash.reduce(
    (s, c) =>
      s +
      conv(
        cashEffective(c, accountTxDelta(c, transactions, insurances, properties, debts))
          .monthlyGeneration,
        c.currency,
        fx,
      ),
    0,
  );
  const otherDebts = debts.reduce((s, d) => s + debtStatus(d).balance, 0);

  const grossAssets = realEstate + investments + cashTotal;
  const liabilities = mortgages + otherDebts;
  const netWorth = grossAssets - liabilities;

  const mortgagePayments = properties.reduce((s, p) => s + mortgageStatus(p).payment, 0);
  const debtPayments = debts.reduce((s, d) => s + debtStatus(d).payment, 0);
  const insuranceMonthly = insurances.reduce(
    (s, i) => s + conv(monthlyFromFrequency(i.premium, i.frequency), i.currency, fx),
    0,
  );

  // Interest is capitalised into the cash balance (net worth), so it is NOT
  // added to income here to avoid double-counting.
  const monthlyIncome = profile.netMonthly;
  const monthlyOutflow =
    profile.monthlyExpenses + mortgagePayments + debtPayments + insuranceMonthly;

  // Logged transactions for the current calendar month.
  const now = new Date();
  let txIncome = 0;
  let txExpenses = 0;
  let txInvestments = 0;
  let txCashback = 0;
  for (const t of transactions) {
    const d = new Date(t.date);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    if (t.type === "INCOME") txIncome += conv(t.amount, t.currency, fx);
    else if (isInvestmentKind(t.kind)) txInvestments += conv(t.amount, t.currency, fx);
    else txExpenses += conv(t.amount, t.currency, fx);
    txCashback += conv(t.cashback, t.currency, fx);
  }

  // Costes fijos recurrentes del mes (seguros + hipotecas + deudas), sin
  // duplicar los que ya estén registrados como movimiento.
  const recurringThisMonth = recurringDueForMonth({
    month: monthKey(now.toISOString()),
    transactions,
    insurances,
    properties,
    debts,
  });
  txExpenses += recurringThisMonth;

  const txMonth = {
    income: txIncome,
    expenses: txExpenses,
    investments: txInvestments,
    recurring: recurringThisMonth,
    cashback: txCashback,
    net: txIncome + txCashback - txExpenses,
  };

  return {
    base,
    realEstate,
    investments,
    cash: cashTotal,
    grossAssets,
    mortgages,
    otherDebts,
    liabilities,
    netWorth,
    investmentCost,
    investmentPL,
    investmentPLPct: investmentCost > 0 ? (investmentPL / investmentCost) * 100 : 0,
    dayChange,
    monthlyIncome,
    cashInterestMonthly,
    monthlyOutflow,
    insuranceMonthly,
    monthlyNet: monthlyIncome - monthlyOutflow,
    txMonth,
    allocation: [
      { label: "Inmuebles", value: realEstate },
      { label: "Inversiones", value: investments },
      { label: "Efectivo", value: cashTotal },
    ].filter((a) => a.value > 0),
  };
}

/** Format a number as currency in the given ISO code. */
export function fmtCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function fmtPct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
