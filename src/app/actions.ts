"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeAppraisal } from "@/lib/valuation";
import { TX_KINDS, localDateKey, computeTransfer, type ImportResult } from "@/lib/calc";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("No autenticado");
  return session.user.id;
}

/** Resultado de una acción de guardado: nada si fue bien, o el motivo. */
export type SaveResult = { error: string } | undefined;

/** Error de validación: siempre `{ error }` (nunca undefined), para que el
 *  narrowing `"error" in data` en las acciones deje el dato bien tipado. */
function zodError(error: z.ZodError): { error: string } {
  const issue = error.issues[0];
  const field = issue?.path?.length ? issue.path.join(".") : "datos";
  return { error: `Revisa el campo «${field}».` };
}

function num(v: FormDataEntryValue | null, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function str(v: FormDataEntryValue | null): string {
  return v == null ? "" : String(v).trim();
}

// ── Profile ──────────────────────────────────────────────

const profileSchema = z.object({
  baseCurrency: z.string().min(3).max(3),
  grossSalary: z.number().min(0),
  netMonthly: z.number().min(0),
  monthlyExpenses: z.number().min(0),
  salaryAccountId: z.string().nullable(),
});

export async function saveProfile(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const parsed = profileSchema.safeParse({
    baseCurrency: (str(formData.get("baseCurrency")) || "EUR").toUpperCase(),
    grossSalary: num(formData.get("grossSalary")),
    netMonthly: num(formData.get("netMonthly")),
    monthlyExpenses: num(formData.get("monthlyExpenses")),
    salaryAccountId: str(formData.get("salaryAccountId")) || null,
  });
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Replace the salary split (account + %) with the submitted rows.
  const accIds = formData.getAll("allocAccountId").map((v) => String(v));
  const pcts = formData.getAll("allocPercent").map((v) => num(v));
  const rows = accIds
    .map((accountId, i) => ({ accountId, percent: pcts[i] ?? 0 }))
    .filter((r) => r.accountId && r.percent > 0);
  await prisma.salaryAllocation.deleteMany({ where: { userId } });
  if (rows.length > 0) {
    await prisma.salaryAllocation.createMany({
      data: rows.map((r) => ({ userId, ...r })),
    });
  }
  revalidatePath("/dashboard");
}

// ── Holdings ─────────────────────────────────────────────

const holdingSchema = z.object({
  type: z.enum(["STOCK", "ETF", "FUND", "CRYPTO", "BOND", "OTHER"]),
  name: z.string().min(1),
  symbol: z.string().min(1),
  isin: z.string().optional().nullable(),
  currency: z.string().min(3).max(3),
  quantity: z.number(),
  avgBuyPrice: z.number().min(0),
  dcaAmount: z.number().min(0),
});

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function holdingFromForm(formData: FormData) {
  const parsed = holdingSchema.safeParse({
    type: str(formData.get("type")) || "STOCK",
    name: str(formData.get("name")),
    symbol: str(formData.get("symbol")).toUpperCase(),
    isin: str(formData.get("isin")) || null,
    currency: (str(formData.get("currency")) || "EUR").toUpperCase(),
    quantity: num(formData.get("quantity")),
    avgBuyPrice: num(formData.get("avgBuyPrice")),
    dcaAmount: num(formData.get("dcaAmount")),
  });
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  const dcaStartDate = data.dcaAmount > 0 ? parseDate(formData.get("dcaStartDate")) : null;
  return { ...data, dcaStartDate };
}

export async function addHolding(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = holdingFromForm(formData);
  if ("error" in data) return data;
  await prisma.holding.create({ data: { userId, ...data } });
  revalidatePath("/dashboard");
}

export async function updateHolding(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = holdingFromForm(formData);
  if ("error" in data) return data;
  await prisma.holding.updateMany({ where: { id, userId }, data });
  revalidatePath("/dashboard");
}

// ── Holding transfer ─────────────────────────────────────

const transferSchema = z.object({
  fromId: z.string().min(1),
  mode: z.enum(["eur", "units"]),
  amount: z.number().positive(),
  priceFrom: z.number().positive(),
  priceTo: z.number().positive(),
  toId: z.string().min(1),
  newName: z.string().optional(),
  newSymbol: z.string().optional(),
  newType: z.enum(["STOCK", "ETF", "FUND", "CRYPTO", "BOND", "OTHER"]).optional(),
  newCurrency: z.string().min(3).max(3).optional(),
  newIsin: z.string().optional().nullable(),
  commission: z.number().min(0),
  commissionAccountId: z.string().nullable(),
  saleDate: z.date(),
  buyDate: z.date(),
});

export async function transferHolding(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();

  const toIdRaw = str(formData.get("toId"));
  const parsed = transferSchema.safeParse({
    fromId: str(formData.get("fromId")),
    mode: str(formData.get("mode")) === "eur" ? "eur" : "units",
    amount: num(formData.get("amount")),
    priceFrom: num(formData.get("priceFrom")),
    priceTo: num(formData.get("priceTo")),
    toId: toIdRaw || "new",
    newName: str(formData.get("newName")) || undefined,
    newSymbol: str(formData.get("newSymbol")).toUpperCase() || undefined,
    newType: (str(formData.get("newType")) || "FUND") as
      | "STOCK"
      | "ETF"
      | "FUND"
      | "CRYPTO"
      | "BOND"
      | "OTHER",
    newCurrency: (str(formData.get("newCurrency")) || "EUR").toUpperCase(),
    newIsin: str(formData.get("newIsin")) || null,
    commission: num(formData.get("commission")),
    commissionAccountId: str(formData.get("commissionAccountId")) || null,
    saleDate: parseDate(formData.get("saleDate")) ?? new Date(),
    buyDate: parseDate(formData.get("buyDate")) ?? new Date(),
  });
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;

  if (data.toId !== "new" && data.toId === data.fromId) {
    return { error: "Origen y destino no pueden ser el mismo fondo." };
  }
  if (data.toId === "new") {
    if (!data.newName?.trim() || !data.newSymbol?.trim()) {
      return { error: "Indica nombre y símbolo del fondo nuevo." };
    }
  }
  if (data.commission > 0 && !data.commissionAccountId) {
    return { error: "Elige la cuenta que paga la comisión." };
  }

  const origin = await prisma.holding.findFirst({
    where: { id: data.fromId, userId },
  });
  if (!origin) return { error: "Fondo origen no encontrado." };

  let destExisting: typeof origin | null = null;
  if (data.toId !== "new") {
    destExisting = await prisma.holding.findFirst({
      where: { id: data.toId, userId },
    });
    if (!destExisting) return { error: "Fondo destino no encontrado." };
  }

  if (data.commission > 0 && data.commissionAccountId) {
    const acc = await prisma.cashAccount.findFirst({
      where: { id: data.commissionAccountId, userId },
      select: { id: true },
    });
    if (!acc) return { error: "Cuenta de comisión no válida." };
  }

  const computed = computeTransfer({
    mode: data.mode,
    amount: data.amount,
    priceFrom: data.priceFrom,
    priceTo: data.priceTo,
    originQuantity: origin.quantity,
    originAvgBuyPrice: origin.avgBuyPrice,
    dest: destExisting
      ? {
          kind: "existing",
          quantity: destExisting.quantity,
          avgBuyPrice: destExisting.avgBuyPrice,
        }
      : { kind: "new" },
  });
  if (!computed.ok) return { error: computed.error };

  const destSymbol = destExisting?.symbol ?? data.newSymbol ?? "?";
  const saleKey = localDateKey(data.saleDate);
  const buyKey = localDateKey(data.buyDate);
  const commissionDesc =
    saleKey === buyKey
      ? `Traspaso ${origin.symbol} → ${destSymbol} (${saleKey})`
      : `Traspaso ${origin.symbol} → ${destSymbol} (venta ${saleKey}, compra ${buyKey})`;

  await prisma.$transaction(async (tx) => {
    await tx.holding.update({
      where: { id: origin.id },
      data: { quantity: computed.origin.quantity },
    });

    if (destExisting && computed.dest.kind === "existing") {
      await tx.holding.update({
        where: { id: destExisting.id },
        data: {
          quantity: computed.dest.quantity,
          avgBuyPrice: computed.dest.avgBuyPrice,
        },
      });
    } else if (computed.dest.kind === "new") {
      await tx.holding.create({
        data: {
          userId,
          name: data.newName!,
          symbol: data.newSymbol!,
          type: data.newType ?? "FUND",
          currency: data.newCurrency ?? "EUR",
          isin: data.newIsin ?? null,
          quantity: computed.dest.quantity,
          avgBuyPrice: computed.dest.avgBuyPrice,
          dcaAmount: 0,
          dcaStartDate: null,
        },
      });
    }

    if (data.commission > 0 && data.commissionAccountId) {
      await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          kind: "Gastos variables",
          amount: data.commission,
          currency: origin.currency || "EUR",
          date: data.buyDate,
          category: "Comisión traspaso",
          description: commissionDesc,
          accountId: data.commissionAccountId,
          cashback: 0,
        },
      });
    }
  });

  revalidatePath("/dashboard");
  if (data.commission > 0) revalidatePath("/dashboard/movimientos");
}

// ── Properties ───────────────────────────────────────────

const propertySchema = z.object({
  name: z.string().min(1),
  currentValue: z.number().min(0),
  purchaseValue: z.number().min(0),
  purchaseDate: z.date().nullable(),
  hasMortgage: z.boolean(),
  mortgageBalance: z.number().min(0),
  mortgageTin: z.number().min(0),
  mortgageMonths: z.number().int().min(0),
  mortgageAccountId: z.string().nullable(),
  mortgageStartDate: z.date().nullable(),
  cadastralRef: z.string().nullable(),
  address: z.string().nullable(),
  autoValuation: z.boolean(),
});

function propertyFromForm(formData: FormData) {
  const hasMortgage = formData.get("hasMortgage") != null;
  const parsed = propertySchema.safeParse({
    name: str(formData.get("name")),
    currentValue: num(formData.get("currentValue")),
    purchaseValue: num(formData.get("purchaseValue")),
    purchaseDate: parseDate(formData.get("purchaseDate")),
    hasMortgage,
    mortgageBalance: hasMortgage ? num(formData.get("mortgageBalance")) : 0,
    mortgageTin: hasMortgage ? num(formData.get("mortgageTin")) : 0,
    mortgageMonths: hasMortgage ? num(formData.get("mortgageMonths")) : 0,
    mortgageAccountId: hasMortgage ? str(formData.get("mortgageAccountId")) || null : null,
    mortgageStartDate: hasMortgage ? parseDate(formData.get("mortgageStartDate")) : null,
    cadastralRef: str(formData.get("cadastralRef")).toUpperCase() || null,
    address: str(formData.get("address")) || null,
    autoValuation: formData.get("autoValuation") != null,
  });
  if (!parsed.success) return zodError(parsed.error);
  return parsed.data;
}

/** Compute the online appraisal and store it + a history point (sólo si el
 *  valor cambió, para no inflar el histórico con duplicados). */
async function applyAppraisal(userId: string, propertyId: string, cadastralRef: string | null) {
  if (!cadastralRef) return;
  const appraisal = await computeAppraisal(cadastralRef);
  if (!appraisal) return;
  await prisma.property.updateMany({
    where: { id: propertyId, userId },
    data: {
      surfaceM2: appraisal.surfaceM2,
      province: appraisal.province,
      appraisedValue: appraisal.value,
      appraisedAt: new Date(),
    },
  });
  const last = await prisma.propertyValuation.findFirst({
    where: { propertyId },
    orderBy: { date: "desc" },
    select: { value: true },
  });
  if (last?.value !== appraisal.value) {
    await prisma.propertyValuation.create({
      data: { propertyId, value: appraisal.value },
    });
  }
}

export async function addProperty(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = propertyFromForm(formData);
  if ("error" in data) return data;
  const created = await prisma.property.create({ data: { userId, ...data } });
  if (data.autoValuation && data.cadastralRef) {
    await applyAppraisal(userId, created.id, data.cadastralRef);
  }
  revalidatePath("/dashboard");
}

export async function updateProperty(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = propertyFromForm(formData);
  if ("error" in data) return data;
  await prisma.property.updateMany({ where: { id, userId }, data });
  if (data.autoValuation && data.cadastralRef) {
    await applyAppraisal(userId, id, data.cadastralRef);
  }
  revalidatePath("/dashboard");
}

/** Manual "actualizar tasación ahora" button. */
export async function refreshPropertyValuation(formData: FormData) {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const prop = await prisma.property.findFirst({ where: { id, userId } });
  if (prop?.cadastralRef) {
    await applyAppraisal(userId, id, prop.cadastralRef);
  }
  revalidatePath("/dashboard");
}

// ── Cash accounts ────────────────────────────────────────

const cashSchema = z.object({
  name: z.string().min(1),
  balance: z.number(),
  currency: z.string().min(3).max(3),
  apr: z.number().min(0),
  cashbackPercent: z.number().min(0),
});

function cashFromForm(formData: FormData) {
  const parsed = cashSchema.safeParse({
    name: str(formData.get("name")),
    balance: num(formData.get("balance")),
    currency: (str(formData.get("currency")) || "EUR").toUpperCase(),
    apr: num(formData.get("apr")),
    cashbackPercent: num(formData.get("cashbackPercent")),
  });
  if (!parsed.success) return zodError(parsed.error);
  return parsed.data;
}

export async function addCash(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = cashFromForm(formData);
  if ("error" in data) return data;
  await prisma.cashAccount.create({ data: { userId, ...data } });
  revalidatePath("/dashboard");
}

export async function updateCash(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = cashFromForm(formData);
  if ("error" in data) return data;
  await prisma.cashAccount.updateMany({
    where: { id, userId },
    data,
  });
  revalidatePath("/dashboard");
}

// ── Debts ────────────────────────────────────────────────

const debtSchema = z.object({
  name: z.string().min(1),
  balance: z.number().min(0),
  tin: z.number().min(0),
  months: z.number().int().min(0),
  startDate: z.date().nullable(),
  accountId: z.string().nullable(),
});

function debtFromForm(formData: FormData) {
  const parsed = debtSchema.safeParse({
    name: str(formData.get("name")),
    balance: num(formData.get("balance")),
    tin: num(formData.get("tin")),
    months: num(formData.get("months")),
    startDate: parseDate(formData.get("startDate")),
    accountId: str(formData.get("accountId")) || null,
  });
  if (!parsed.success) return zodError(parsed.error);
  return parsed.data;
}

export async function addDebt(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = debtFromForm(formData);
  if ("error" in data) return data;
  await prisma.debt.create({ data: { userId, ...data } });
  revalidatePath("/dashboard");
}

export async function updateDebt(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = debtFromForm(formData);
  if ("error" in data) return data;
  await prisma.debt.updateMany({
    where: { id, userId },
    data,
  });
  revalidatePath("/dashboard");
}

// ── Insurance ────────────────────────────────────────────

const insuranceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["HOME", "LIFE", "HEALTH", "CAR", "OTHER"]),
  provider: z.string().optional().nullable(),
  premium: z.number().min(0),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]),
  coverage: z.number().min(0),
  currency: z.string().min(3).max(3),
  accountId: z.string().nullable(),
});

function insuranceFromForm(formData: FormData) {
  const parsed = insuranceSchema.safeParse({
    name: str(formData.get("name")),
    type: str(formData.get("type")) || "OTHER",
    provider: str(formData.get("provider")) || null,
    premium: num(formData.get("premium")),
    frequency: str(formData.get("frequency")) || "ANNUAL",
    coverage: num(formData.get("coverage")),
    currency: (str(formData.get("currency")) || "EUR").toUpperCase(),
    accountId: str(formData.get("accountId")) || null,
  });
  if (!parsed.success) return zodError(parsed.error);
  return {
    ...parsed.data,
    renewalDate: parseDate(formData.get("renewalDate")),
    startDate: parseDate(formData.get("startDate")),
  };
}

export async function addInsurance(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = insuranceFromForm(formData);
  if ("error" in data) return data;
  await prisma.insurance.create({ data: { userId, ...data } });
  revalidatePath("/dashboard");
}

export async function updateInsurance(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = insuranceFromForm(formData);
  if ("error" in data) return data;
  await prisma.insurance.updateMany({
    where: { id, userId },
    data,
  });
  revalidatePath("/dashboard");
}

// ── Transactions (manual income/expense ledger) ──────────

/** Income only for the "Ingresos" bucket; everything else is an outflow. */
function typeFromKind(kind: string): "INCOME" | "EXPENSE" {
  return kind === "Ingresos" ? "INCOME" : "EXPENSE";
}

const txSchema = z.object({
  kind: z.enum(TX_KINDS),
  amount: z.number().min(0),
  currency: z.string().min(3).max(3),
  category: z.string().nullable(),
  description: z.string().nullable(),
  accountId: z.string().nullable(),
});

async function txFromForm(userId: string, formData: FormData) {
  const parsed = txSchema.safeParse({
    kind: str(formData.get("kind")) || "Gastos variables",
    amount: num(formData.get("amount")),
    currency: (str(formData.get("currency")) || "EUR").toUpperCase(),
    category: str(formData.get("category")) || null,
    description: str(formData.get("description")) || null,
    accountId: str(formData.get("accountId")) || null,
  });
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  const type = typeFromKind(data.kind);
  const date = parseDate(formData.get("date")) ?? new Date();
  const applyCashback = formData.get("applyCashback") != null;

  // Cashback only for expenses on an account that has a cashback %.
  let cashback = 0;
  if (type === "EXPENSE" && data.accountId && applyCashback) {
    const account = await prisma.cashAccount.findFirst({
      where: { id: data.accountId, userId },
      select: { cashbackPercent: true },
    });
    if (account && account.cashbackPercent > 0) {
      cashback = (data.amount * account.cashbackPercent) / 100;
    }
  }
  return { ...data, type, date, cashback };
}

export async function addTransaction(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const data = await txFromForm(userId, formData);
  if ("error" in data) return data;
  await prisma.transaction.create({ data: { userId, ...data } });
  revalidatePath("/dashboard");
}

export async function updateTransaction(formData: FormData): Promise<SaveResult> {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const data = await txFromForm(userId, formData);
  if ("error" in data) return data;
  await prisma.transaction.updateMany({ where: { id, userId }, data });
  revalidatePath("/dashboard");
}

function normalizeKind(raw: string): (typeof TX_KINDS)[number] {
  const s = raw.toLowerCase();
  if (s.includes("ingreso")) return "Ingresos";
  if (s.includes("fijo")) return "Gastos fijos";
  if (s.includes("inversi")) return "Inversiones";
  if (s.includes("variable")) return "Gastos variables";
  return "Gastos variables";
}

/** Import the "Transactions Log" sheet of a budget .xlsx (DATE/TYPE/CATEGORY/AMOUNT/DETAILS). */
export async function importTransactions(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  const userId = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { imported: 0, skipped: 0, error: "No se recibió ningún archivo." };
  }

  let rows: {
    date: Date;
    kind: (typeof TX_KINDS)[number];
    type: "INCOME" | "EXPENSE";
    amount: number;
    category: string | null;
    description: string | null;
  }[] = [];

  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet("Transactions Log") ?? wb.worksheets[0];
    if (!ws) return { imported: 0, skipped: 0, error: "No se encontró la hoja de movimientos." };

    // Locate the header row (contains DATE + AMOUNT).
    let headerRow = 0;
    const colIdx: Record<string, number> = {};
    ws.eachRow((row, n) => {
      if (headerRow) return;
      const labels = (row.values as unknown[]).map((v) =>
        String(v ?? "").trim().toUpperCase(),
      );
      if (labels.includes("DATE") && labels.includes("AMOUNT")) {
        headerRow = n;
        labels.forEach((l, i) => {
          if (l) colIdx[l] = i;
        });
      }
    });
    if (!headerRow) {
      return { imported: 0, skipped: 0, error: "No se encontró la fila de cabecera (DATE/AMOUNT)." };
    }

    // Unwrap formula / rich-text cell values to their plain value.
    const unwrap = (v: unknown): unknown => {
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("result" in o) return o.result;
        if ("text" in o) return o.text;
        if ("richText" in o && Array.isArray(o.richText))
          return o.richText.map((r) => (r as { text?: string }).text ?? "").join("");
      }
      return v;
    };

    ws.eachRow((row, n) => {
      if (n <= headerRow) return;
      const cell = (label: string) =>
        colIdx[label] ? unwrap(row.getCell(colIdx[label]).value) : null;
      const rawDate = cell("DATE");
      const rawAmount = cell("AMOUNT");
      if (rawDate == null || rawAmount == null) return;

      const date = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
      const amount = Math.abs(Number(rawAmount));
      if (Number.isNaN(date.getTime()) || !Number.isFinite(amount) || amount === 0) return;

      const kind = normalizeKind(String(cell("TYPE") ?? ""));
      rows.push({
        date,
        kind,
        type: typeFromKind(kind),
        amount,
        category: cell("CATEGORY") ? String(cell("CATEGORY")).trim() : null,
        description: cell("DETAILS") ? String(cell("DETAILS")).trim() : null,
      });
    });
  } catch {
    return { imported: 0, skipped: 0, error: "No se pudo leer el archivo .xlsx." };
  }

  if (rows.length === 0) return { imported: 0, skipped: 0, error: "No se encontraron movimientos." };

  // Dedupe against existing rows so re-importing doesn't duplicate.
  const existing = await prisma.transaction.findMany({
    where: { userId },
    select: { date: true, amount: true, category: true, kind: true, description: true },
  });
  const key = (d: Date, a: number, c: string | null, k: string | null, de: string | null) =>
    `${localDateKey(d)}|${a}|${c ?? ""}|${k ?? ""}|${de ?? ""}`;
  const seen = new Set(
    existing.map((e) => key(e.date, e.amount, e.category, e.kind, e.description)),
  );

  const toInsert = rows.filter((r) => !seen.has(key(r.date, r.amount, r.category, r.kind, r.description)));

  if (toInsert.length > 0) {
    await prisma.transaction.createMany({
      data: toInsert.map((r) => ({ userId, currency: "EUR", cashback: 0, ...r })),
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/movimientos");
  return { imported: toInsert.length, skipped: rows.length - toInsert.length };
}

// ── Generic delete ───────────────────────────────────────

export async function deleteItem(formData: FormData) {
  const userId = await requireUser();
  const id = str(formData.get("id"));
  const kind = str(formData.get("kind"));
  switch (kind) {
    case "holding":
      await prisma.holding.deleteMany({ where: { id, userId } });
      break;
    case "property":
      await prisma.property.deleteMany({ where: { id, userId } });
      break;
    case "cash":
      // accountId fields are plain strings (no FK/cascade), so clear every
      // reference to this account before deleting it — otherwise seguros,
      // deudas, hipotecas y movimientos quedan apuntando a una cuenta
      // inexistente sin ningún aviso.
      await prisma.$transaction([
        prisma.profile.updateMany({
          where: { userId, salaryAccountId: id },
          data: { salaryAccountId: null },
        }),
        prisma.property.updateMany({
          where: { userId, mortgageAccountId: id },
          data: { mortgageAccountId: null },
        }),
        prisma.insurance.updateMany({
          where: { userId, accountId: id },
          data: { accountId: null },
        }),
        prisma.debt.updateMany({
          where: { userId, accountId: id },
          data: { accountId: null },
        }),
        prisma.transaction.updateMany({
          where: { userId, accountId: id },
          data: { accountId: null },
        }),
        // SalaryAllocation.accountId is required (not nullable) — the row
        // itself must go rather than be nulled.
        prisma.salaryAllocation.deleteMany({ where: { userId, accountId: id } }),
        prisma.cashAccount.deleteMany({ where: { id, userId } }),
      ]);
      break;
    case "debt":
      await prisma.debt.deleteMany({ where: { id, userId } });
      break;
    case "insurance":
      await prisma.insurance.deleteMany({ where: { id, userId } });
      break;
    case "transaction":
      await prisma.transaction.deleteMany({ where: { id, userId } });
      break;
  }
  revalidatePath("/dashboard");
}
