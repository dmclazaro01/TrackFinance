import "server-only";
import { prisma } from "@/lib/prisma";
import { getQuotes, buildFxTable, computeDca } from "@/lib/finance";
import {
  toCashInput,
  toDebtInput,
  toInsuranceInput,
  toProfileInput,
  toPropertyInput,
  toSalaryAllocationInput,
  toTransactionInput,
} from "@/lib/inputs";
import {
  enrichHoldings,
  summarize,
  type EnrichedHolding,
  type HoldingWithDca,
  type PortfolioSummary,
  type PropertyInput,
  type CashInput,
  type DebtInput,
  type InsuranceInput,
  type ProfileInput,
  type SalaryAllocationInput,
  type TransactionInput,
} from "@/lib/calc";

export type PortfolioSnapshot = {
  profile: ProfileInput;
  properties: PropertyInput[];
  holdings: EnrichedHolding[];
  cash: CashInput[];
  debts: DebtInput[];
  insurances: InsuranceInput[];
  salaryAllocations: SalaryAllocationInput[];
  transactions: TransactionInput[];
  summary: PortfolioSummary;
  /** Símbolos cuya cotización en vivo no se pudo obtener (valorados a coste). */
  stalePrices: string[];
  updatedAt: string;
};

const DEFAULT_PROFILE: ProfileInput = {
  baseCurrency: "EUR",
  grossSalary: 0,
  netMonthly: 0,
  monthlyExpenses: 0,
  salaryAccountId: null,
};

/** Load every financial entity for a user and enrich it with live prices. */
export async function loadPortfolio(userId: string): Promise<PortfolioSnapshot> {
  // Movimientos relevantes: desde el ancla más antigua de las cuentas (para
  // proyectar saldos) o el inicio del mes actual (para los totales del mes) —
  // lo que sea más antiguo. Nada anterior a eso puede afectar a los cálculos.
  const anchorRows = await prisma.cashAccount.findMany({
    where: { userId },
    select: { updatedAt: true },
  });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const txSince = anchorRows.reduce(
    (min, r) => (r.updatedAt < min ? r.updatedAt : min),
    monthStart,
  );

  const [
    profileRow,
    properties,
    holdingRows,
    cash,
    debts,
    insuranceRows,
    salaryAllocationRows,
    transactionRows,
  ] = await Promise.all([
      prisma.profile.findUnique({ where: { userId } }),
      prisma.property.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.holding.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.cashAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.debt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.insurance.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.salaryAllocation.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: txSince } },
        orderBy: { date: "desc" },
      }),
    ]);

  const profile: ProfileInput = profileRow ? toProfileInput(profileRow) : DEFAULT_PROFILE;

  const base = profile.baseCurrency;

  // Live quotes for all holdings.
  const symbols = holdingRows.map((h) => h.symbol);
  const quotes = await getQuotes(symbols);
  // Holdings whose live quote failed (they are shown at cost price).
  const stalePrices = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(
    (s) => !quotes[s],
  );

  // Currencies we may need to convert into the base currency.
  const currencies = new Set<string>();
  holdingRows.forEach((h) => {
    currencies.add(h.currency);
    const q = quotes[h.symbol.toUpperCase()];
    if (q?.currency) currencies.add(q.currency);
  });
  cash.forEach((c) => currencies.add(c.currency));
  insuranceRows.forEach((i) => currencies.add(i.currency));
  const fx = await buildFxTable([...currencies], base);

  // Resolve each holding's DCA plan (monthly contributions accrued to date).
  const withDca: HoldingWithDca[] = await Promise.all(
    holdingRows.map(async (h) => {
      const fallbackPrice = quotes[h.symbol.toUpperCase()]?.price ?? null;
      const dca =
        h.dcaAmount > 0 && h.dcaStartDate
          ? await computeDca(h.symbol, h.dcaStartDate, h.dcaAmount, fallbackPrice)
          : { units: 0, cost: 0, contributions: 0, nextDate: h.dcaStartDate?.toISOString() ?? null };

      const effectiveQuantity = h.quantity + dca.units;
      const baseCost = h.quantity * h.avgBuyPrice;
      const effectiveAvgBuyPrice =
        effectiveQuantity > 0 ? (baseCost + dca.cost) / effectiveQuantity : h.avgBuyPrice;

      return {
        id: h.id,
        type: h.type,
        name: h.name,
        symbol: h.symbol,
        isin: h.isin,
        currency: h.currency,
        quantity: h.quantity,
        avgBuyPrice: h.avgBuyPrice,
        dcaAmount: h.dcaAmount,
        dcaStartDate: h.dcaStartDate ? h.dcaStartDate.toISOString() : null,
        effectiveQuantity,
        effectiveAvgBuyPrice,
        dcaInvested: dca.cost,
        dcaContributions: dca.contributions,
        dcaNextDate: dca.nextDate,
      };
    }),
  );

  const holdings = enrichHoldings(withDca, quotes, fx);

  const propInputs = properties.map(toPropertyInput);
  const cashInputs = cash.map(toCashInput);
  const transactionInputs = transactionRows.map(toTransactionInput);
  const debtInputs = debts.map(toDebtInput);
  const insuranceInputs = insuranceRows.map(toInsuranceInput);
  const salaryAllocations = salaryAllocationRows.map(toSalaryAllocationInput);

  const summary = summarize({
    profile,
    properties: propInputs,
    holdings,
    cash: cashInputs,
    debts: debtInputs,
    insurances: insuranceInputs,
    transactions: transactionInputs,
    fx,
  });

  return {
    profile,
    properties: propInputs,
    holdings,
    cash: cashInputs,
    debts: debtInputs,
    insurances: insuranceInputs,
    salaryAllocations,
    transactions: transactionInputs,
    summary,
    stalePrices,
    updatedAt: new Date().toISOString(),
  };
}
