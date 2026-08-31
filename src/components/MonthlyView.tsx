"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCurrency, monthKey, type TransactionInput } from "@/lib/calc";
import { useThemeColors } from "@/components/dashboard/theme";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

const KIND_COLORS: Record<string, string> = {
  Ingresos: "var(--positive)",
  "Gastos fijos": "var(--accent-2)",
  "Gastos variables": "var(--accent)",
  Inversiones: "var(--chart-2)",
};

function kindOf(t: TransactionInput): string {
  if (t.kind) return t.kind;
  return t.type === "INCOME" ? "Ingresos" : "Gastos variables";
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
}

export function MonthlyView({
  transactions,
  accounts,
  base,
  recurringByMonth,
}: {
  transactions: TransactionInput[];
  accounts: { id: string; name: string }[];
  base: string;
  recurringByMonth?: Record<string, number>;
}) {
  const color = useThemeColors();
  const c = (v: number) => fmtCurrency(v, base);
  const accountName = (id: string | null) =>
    id ? (accounts.find((a) => a.id === id)?.name ?? "—") : "—";

  // Group by month.
  const months = useMemo(() => {
    const map = new Map<string, TransactionInput[]>();
    for (const t of transactions) {
      const k = monthKey(t.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.keys()].sort(); // ascending
  }, [transactions]);

  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (months.length && !months.includes(selected)) setSelected(months[months.length - 1]);
  }, [months, selected]);

  // Per-month totals for the bar chart (last 12 months).
  const monthly = useMemo(() => {
    return months.map((k) => {
      const txs = transactions.filter((t) => monthKey(t.date) === k);
      const rec = recurringByMonth?.[k] ?? 0;
      let income = 0;
      let expense = 0;
      let invested = 0;
      for (const t of txs) {
        const kind = kindOf(t);
        if (kind === "Ingresos") income += t.amount;
        else if (kind === "Inversiones") invested += t.amount;
        else expense += t.amount;
      }
      return {
        key: k,
        label: monthLabel(k),
        income,
        expense: -(expense + rec),
        invested,
        net: income - expense - rec,
      };
    });
  }, [months, transactions, recurringByMonth]);

  const chartData = monthly.slice(-12).map((m) => {
    // La inversión es parte de los ingresos de ese mes, no dinero adicional:
    // se integra como un tramo DENTRO de la misma columna, sin sumar altura.
    // Si se invierte más de lo ingresado ese mes (viene de ahorro previo), el
    // tramo se recorta al total de ingresos para no inflar la columna.
    const investedWithinIncome = Math.min(m.invested, m.income);
    return {
      name: new Date(`${m.key}-01`).toLocaleDateString("es-ES", { month: "short" }),
      "Ingresos (resto)": m.income - investedWithinIncome,
      Inversiones: investedWithinIncome,
      Gastos: -m.expense,
    };
  });

  // Eje Y dinámico: la altura se ajusta al mes más alto (ingresos o gastos) con
  // un 10% de aire, redondeado a un valor "bonito". Nunca recorta las barras.
  const yMax = useMemo(() => {
    const peak = chartData.reduce(
      (max, d) => Math.max(max, d["Ingresos (resto)"] + d.Inversiones, d.Gastos),
      0,
    );
    if (peak <= 0) return 1000;
    const padded = peak * 1.1;
    const mag = 10 ** Math.floor(Math.log10(padded));
    return Math.ceil(padded / mag) * mag;
  }, [chartData]);

  const monthTxs = useMemo(
    () =>
      transactions
        .filter((t) => monthKey(t.date) === selected)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, selected],
  );

  const byKind = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTxs) m[kindOf(t)] = (m[kindOf(t)] ?? 0) + t.amount;
    return m;
  }, [monthTxs]);

  const recurring = recurringByMonth?.[selected] ?? 0;
  const income = byKind["Ingresos"] ?? 0;
  const gastosFijos = (byKind["Gastos fijos"] ?? 0) + recurring;
  const gastosVariables = byKind["Gastos variables"] ?? 0;
  const outflow = gastosFijos + gastosVariables;
  const kindValues: Record<string, number> = {
    ...byKind,
    "Gastos fijos": gastosFijos,
  };

  // Expense categories for the month.
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTxs) {
      const kind = kindOf(t);
      if (kind === "Ingresos" || kind === "Inversiones") continue;
      const cat = t.category ?? "Sin categoría";
      m[cat] = (m[cat] ?? 0) + t.amount;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [monthTxs]);
  const maxCat = byCategory.length ? byCategory[0][1] : 1;

  const idx = months.indexOf(selected);

  if (months.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        No hay movimientos todavía. Importa tu Excel o añade movimientos desde el panel.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monthly income vs expenses */}
      <div className="card p-6">
        <h3 className="font-semibold mb-4">Ingresos y gastos por mes</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={color.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: color.muted, fontSize: 11 }} />
              <YAxis
                tick={{ fill: color.muted, fontSize: 11 }}
                width={48}
                domain={[0, yMax]}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
                }
              />
              <Tooltip
                formatter={(v) => c(Math.abs(Number(v)))}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                }}
                itemStyle={{ color: "var(--foreground)" }}
                labelStyle={{ color: "var(--muted)" }}
                cursor={{ fill: "rgba(128,128,128,0.12)" }}
              />
              <Bar
                dataKey="Ingresos (resto)"
                name="Ingresos"
                stackId="ing"
                fill={color.positive}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Inversiones"
                name="Inversiones (de esos ingresos)"
                stackId="ing"
                fill={color.invested}
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="Gastos" stackId="gas" fill={color.negative} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--positive)" }} />
            Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--chart-2)" }} />
            Inversiones (tramo dentro de los ingresos, no se suma aparte)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--negative)" }} />
            Gastos
          </span>
        </div>

        {/* Alternativa textual del gráfico para lectores de pantalla. */}
        <table className="sr-only">
          <caption>Ingresos y gastos por mes</caption>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Ingresos</th>
              <th>Inversiones</th>
              <th>Gastos</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{c(d["Ingresos (resto)"] + d.Inversiones)}</td>
                <td>{c(d.Inversiones)}</td>
                <td>{c(d.Gastos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button
          className="btn btn-ghost text-sm"
          onClick={() => idx > 0 && setSelected(months[idx - 1])}
          disabled={idx <= 0}
        >
          <ChevronLeftIcon /> Anterior
        </button>
        <div className="font-display font-semibold capitalize">{monthLabel(selected)}</div>
        <button
          className="btn btn-ghost text-sm"
          onClick={() => idx < months.length - 1 && setSelected(months[idx + 1])}
          disabled={idx >= months.length - 1}
        >
          Siguiente <ChevronRightIcon />
        </button>
      </div>

      {/* Kind summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {(["Ingresos", "Gastos fijos", "Gastos variables", "Inversiones"] as const).map((k) => (
          <div key={k} className="card p-4">
            <div className="text-xs text-muted mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: KIND_COLORS[k] }} />
              {k}
            </div>
            <div className="text-lg font-bold tabular-nums">{c(kindValues[k] ?? 0)}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-xs text-muted mb-1">Balance</div>
          <div
            className={`text-lg font-bold tabular-nums ${income - outflow >= 0 ? "text-positive" : "text-negative"}`}
          >
            {c(income - outflow)}
          </div>
        </div>
      </div>

      {/* Category breakdown + list */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Gastos por categoría</h3>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted">Sin gastos este mes.</p>
          ) : (
            <ul className="space-y-2.5">
              {byCategory.map(([cat, amt]) => (
                <li key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{cat}</span>
                    <span className="tabular-nums">{c(amt)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${(amt / maxCat) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left border-b border-[var(--border)]">
                <th className="py-2 px-3 font-medium">Fecha</th>
                <th className="py-2 px-3 font-medium">Concepto</th>
                <th className="py-2 px-3 font-medium text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {monthTxs.map((t) => {
                const isIncome = kindOf(t) === "Ingresos";
                return (
                  <tr key={t.id} className="border-b border-[var(--border)]/50">
                    <td className="py-2 px-3 text-muted whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-medium">{t.category ?? kindOf(t)}</span>
                      {t.description && <span className="text-muted"> · {t.description}</span>}
                      <span className="text-muted text-xs"> · {accountName(t.accountId)}</span>
                    </td>
                    <td
                      className={`py-2 px-3 text-right tabular-nums ${isIncome ? "text-positive" : "text-negative"}`}
                    >
                      {isIncome ? "+" : "−"}
                      {fmtCurrency(t.amount, t.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
