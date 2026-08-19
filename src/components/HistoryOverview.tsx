import {
  fmtCurrency,
  isInvestmentKind,
  monthKey,
  type TransactionInput,
} from "@/lib/calc";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

/** Overview de todo el histórico de movimientos (no solo el mes seleccionado). */
export function HistoryOverview({
  transactions,
  base,
  recurringByMonth,
}: {
  transactions: TransactionInput[];
  base: string;
  recurringByMonth?: Record<string, number>;
}) {
  if (transactions.length === 0) return null;

  const c = (v: number) => fmtCurrency(v, base);

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalInvested = 0;
  let totalRecurring = 0;
  const monthSet = new Set<string>();
  let minDate = transactions[0].date;
  let maxDate = transactions[0].date;

  for (const t of transactions) {
    if (t.date < minDate) minDate = t.date;
    if (t.date > maxDate) maxDate = t.date;
    monthSet.add(monthKey(t.date));
    if (t.type === "INCOME") totalIncome += t.amount;
    else if (isInvestmentKind(t.kind)) totalInvested += t.amount;
    else totalExpenses += t.amount;
  }

  if (recurringByMonth) {
    for (const v of Object.values(recurringByMonth)) totalRecurring += v;
  }
  totalExpenses += totalRecurring;

  const monthsCovered = monthSet.size;
  const balance = totalIncome - totalExpenses;
  const avg = (total: number) => (monthsCovered > 0 ? total / monthsCovered : 0);

  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4">Resumen de todo el histórico</h3>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted mb-1">Total ingresos</div>
          <div className="text-lg font-bold tabular-nums text-positive">{c(totalIncome)}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Total gastos</div>
          <div className="text-lg font-bold tabular-nums text-negative">{c(totalExpenses)}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Total invertido</div>
          <div className="text-lg font-bold tabular-nums">{c(totalInvested)}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Balance acumulado</div>
          <div
            className={`text-lg font-bold tabular-nums ${balance >= 0 ? "text-positive" : "text-negative"}`}
          >
            {c(balance)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Periodo cubierto</div>
          <div className="text-sm font-semibold">
            {fmtDate(minDate)} – {fmtDate(maxDate)}
          </div>
          <div className="text-xs text-muted mt-0.5">{monthsCovered} meses con datos</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Promedio mensual ingresos</div>
          <div className="text-sm font-semibold tabular-nums">{c(avg(totalIncome))}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Promedio mensual gastos</div>
          <div className="text-sm font-semibold tabular-nums">{c(avg(totalExpenses))}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Promedio mensual invertido</div>
          <div className="text-sm font-semibold tabular-nums">{c(avg(totalInvested))}</div>
        </div>
      </div>
    </div>
  );
}
