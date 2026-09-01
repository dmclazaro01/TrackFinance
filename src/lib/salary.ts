import "server-only";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/calc";

export type SalarySlice = { accountId: string | null; amount: number };

export function buildSalarySlices(
  profile: { netMonthly: number; salaryAccountId: string | null },
  allocations: { accountId: string; percent: number }[],
): SalarySlice[] {
  const net = profile.netMonthly;
  if (!(net > 0)) return [];
  const byAccount = new Map<string, number>();
  let allocatedPct = 0;
  for (const a of allocations) {
    if (!a.accountId || !(a.percent > 0)) continue;
    allocatedPct += a.percent;
    byAccount.set(a.accountId, (byAccount.get(a.accountId) ?? 0) + a.percent);
  }
  const restPct = Math.max(0, 100 - allocatedPct);
  if (restPct > 0 && profile.salaryAccountId) {
    byAccount.set(
      profile.salaryAccountId,
      (byAccount.get(profile.salaryAccountId) ?? 0) + restPct,
    );
  }
  // Si no hay cuenta destino pero hay nómina, crea una fila sin cuenta (cuenta en txMonth pero no en effectiveBalance per account)
  if (byAccount.size === 0) {
    return [{ accountId: profile.salaryAccountId ?? null, amount: net }];
  }
  const out: SalarySlice[] = [];
  for (const [accountId, pct] of byAccount.entries()) {
    const amount = (net * pct) / 100;
    if (amount > 0) out.push({ accountId, amount });
  }
  // Normaliza por redondeo: si la suma por redondeo no cuadra, ajusta la última
  const sum = out.reduce((s, v) => s + v.amount, 0);
  if (out.length > 0 && Math.abs(sum - net) >= 0.01) {
    out[out.length - 1].amount += net - sum;
  }
  return out;
}

function salaryMonthBounds(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1, 12, 0, 0); // mediodía local evita cambios de día en UTC
  const end = new Date(y, m + 1, 1, 12, 0, 0);
  return { start, end, key: monthKey(start.toISOString()) };
}

/**
 * Idempotente: crea las filas de nómina del mes en curso si no existen.
 * Usa `category = Nómina` como marcador para deduplicar (igual que recurring dedupe).
 * No toca las secciones teóricas (`monthlyIncome` / `accountFlow`) -> no hay doble conteo.
 */
export async function ensureMonthlySalaryForUser(
  userId: string,
  now = new Date(),
): Promise<{ created: number; month: string }> {
  const { start, end, key } = salaryMonthBounds(now);
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile || !(profile.netMonthly > 0)) return { created: 0, month: key };

  const allocations = await prisma.salaryAllocation.findMany({ where: { userId } });
  const slices = buildSalarySlices(
    { netMonthly: profile.netMonthly, salaryAccountId: profile.salaryAccountId },
    allocations.map((a) => ({ accountId: a.accountId, percent: a.percent })),
  );
  if (slices.length === 0) return { created: 0, month: key };

  // Ya hay nómina este mes -> idempotente
  const existing = await prisma.transaction.findFirst({
    where: {
      userId,
      type: "INCOME",
      category: "Nómina",
      date: { gte: start, lt: end },
    },
    select: { id: true },
  });
  if (existing) return { created: 0, month: key };

  const baseCurrency = profile.baseCurrency ?? "EUR";
  await prisma.transaction.createMany({
    data: slices.map((s) => ({
      userId,
      type: "INCOME",
      kind: "Ingresos",
      amount: s.amount,
      currency: baseCurrency,
      date: start,
      category: "Nómina",
      description: `Nómina ${key}`,
      accountId: s.accountId,
      cashback: 0,
    })),
  });
  return { created: slices.length, month: key };
}

export async function ensureMonthlySalaryForAll(now = new Date()) {
  const profiles = await prisma.profile.findMany({
    where: { netMonthly: { gt: 0 } },
    select: { userId: true },
  });
  let created = 0;
  for (const p of profiles) {
    const r = await ensureMonthlySalaryForUser(p.userId, now);
    created += r.created;
  }
  return { users: profiles.length, created };
}
