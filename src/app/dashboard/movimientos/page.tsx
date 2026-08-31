import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronLeftIcon, DownloadIcon } from "@/components/icons";
import { ImportTransactions } from "@/components/ImportTransactions";
import { HistoryOverview } from "@/components/HistoryOverview";
import { MonthlyView } from "@/components/MonthlyView";
import {
  toInsuranceInput,
  toPropertyInput,
  toTransactionInput,
} from "@/lib/inputs";
import { recurringByMonth } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [rows, accounts, profile, insuranceRows, propertyRows] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.cashAccount.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.profile.findUnique({ where: { userId }, select: { baseCurrency: true } }),
    prisma.insurance.findMany({ where: { userId } }),
    prisma.property.findMany({ where: { userId } }),
  ]);

  const transactions = rows.map(toTransactionInput);
  const insurances = insuranceRows.map(toInsuranceInput);
  const properties = propertyRows.map(toPropertyInput);

  const recurringByMonthMap = recurringByMonth({
    transactions,
    insurances,
    properties,
  });
  const recurring = Object.fromEntries(recurringByMonthMap);

  return (
    <div className="flex-1">
      <header className="border-b border-[var(--border)] sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-display font-bold">
            <Logo />
            <span className="hidden sm:inline">TrackFinance</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn btn-ghost text-sm">
              <ChevronLeftIcon /> Panel
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Movimientos</h1>
            <p className="text-sm text-muted mt-1">
              Histórico de ingresos y gastos, mes a mes. Importa tu Excel de presupuesto
              (hoja «Transactions Log»).
            </p>
          </div>
          {transactions.length > 0 && (
            <a
              href="/api/transactions/export"
              download
              className="btn btn-ghost text-sm"
              title="Descargar tus movimientos en Excel"
            >
              <DownloadIcon /> Exportar Excel
            </a>
          )}
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-1">Importar desde Excel</h3>
          <p className="text-xs text-muted mb-4">
            Sube tu archivo .xlsx con columnas DATE · TYPE · CATEGORY · AMOUNT · DETAILS.
            Los movimientos que ya existan se omiten (puedes reimportar sin duplicar).
          </p>
          <ImportTransactions />
        </div>

        <HistoryOverview transactions={transactions} base={profile?.baseCurrency ?? "EUR"} recurringByMonth={recurring} />
        <MonthlyView transactions={transactions} accounts={accounts} base={profile?.baseCurrency ?? "EUR"} recurringByMonth={recurring} />
      </main>
    </div>
  );
}
