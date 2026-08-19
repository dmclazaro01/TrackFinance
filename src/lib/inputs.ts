import "server-only";
import type {
  CashAccount,
  Debt,
  Insurance,
  Profile,
  Property,
  SalaryAllocation,
  Transaction,
} from "@/generated/prisma/client";
import type {
  CashInput,
  DebtInput,
  InsuranceInput,
  ProfileInput,
  PropertyInput,
  SalaryAllocationInput,
  TransactionInput,
} from "@/lib/calc";

/** Mappers Prisma → tipos planos serializables que consume `calc.ts`.
 *  Úsalos siempre que cargues entidades de BD: el mapping ISO de fechas y la
 *  selección de campos viven aquí una sola vez. */

export function toProfileInput(p: Profile): ProfileInput {
  return {
    baseCurrency: p.baseCurrency,
    grossSalary: p.grossSalary,
    netMonthly: p.netMonthly,
    monthlyExpenses: p.monthlyExpenses,
    salaryAccountId: p.salaryAccountId,
  };
}

export function toPropertyInput(p: Property): PropertyInput {
  return {
    id: p.id,
    name: p.name,
    currentValue: p.currentValue,
    purchaseValue: p.purchaseValue,
    purchaseDate: p.purchaseDate ? p.purchaseDate.toISOString() : null,
    hasMortgage: p.hasMortgage,
    mortgageBalance: p.mortgageBalance,
    mortgageTin: p.mortgageTin,
    mortgageMonths: p.mortgageMonths,
    mortgageStartDate: p.mortgageStartDate ? p.mortgageStartDate.toISOString() : null,
    mortgageAccountId: p.mortgageAccountId,
    cadastralRef: p.cadastralRef,
    address: p.address,
    province: p.province,
    surfaceM2: p.surfaceM2,
    autoValuation: p.autoValuation,
    appraisedValue: p.appraisedValue,
    appraisedAt: p.appraisedAt ? p.appraisedAt.toISOString() : null,
  };
}

export function toCashInput(c: CashAccount): CashInput {
  return {
    id: c.id,
    name: c.name,
    balance: c.balance,
    currency: c.currency,
    apr: c.apr,
    cashbackPercent: c.cashbackPercent,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toDebtInput(d: Debt): DebtInput {
  return {
    id: d.id,
    name: d.name,
    balance: d.balance,
    tin: d.tin,
    months: d.months,
    startDate: d.startDate ? d.startDate.toISOString() : null,
    accountId: d.accountId,
  };
}

export function toInsuranceInput(i: Insurance): InsuranceInput {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    provider: i.provider,
    premium: i.premium,
    frequency: i.frequency,
    coverage: i.coverage,
    currency: i.currency,
    renewalDate: i.renewalDate ? i.renewalDate.toISOString() : null,
    startDate: i.startDate ? i.startDate.toISOString() : null,
    accountId: i.accountId,
  };
}

export function toTransactionInput(t: Transaction): TransactionInput {
  return {
    id: t.id,
    type: t.type,
    kind: t.kind,
    amount: t.amount,
    currency: t.currency,
    date: t.date.toISOString(),
    category: t.category,
    description: t.description,
    accountId: t.accountId,
    cashback: t.cashback,
  };
}

export function toSalaryAllocationInput(a: SalaryAllocation): SalaryAllocationInput {
  return {
    id: a.id,
    accountId: a.accountId,
    percent: a.percent,
  };
}
