"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fmtCurrency } from "@/lib/calc";
import { useThemeColors } from "@/components/dashboard/theme";
import { EmptyHint } from "@/components/dashboard/widgets";

type AllocSlice = { label: string; value: number };
type BreakdownBar = { name: string; value: number };

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
} as const;

/** Asset-allocation donut + assets/liabilities bar chart. Split out of the
 *  Dashboard so Recharts is code-split and lazy-loaded (see Dashboard.tsx). */
export function AllocationCharts({
  allocation,
  breakdown,
  base,
}: {
  allocation: AllocSlice[];
  breakdown: BreakdownBar[];
  base: string;
}) {
  const chart = useThemeColors();
  const c = (v: number) => fmtCurrency(v, base);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="font-semibold mb-4">Distribución de activos</h3>
        {allocation.length === 0 ? (
          <EmptyHint text="Añade inversiones, propiedades o efectivo para ver el reparto." />
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={chart.pie[i % chart.pie.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => c(Number(v))}
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "var(--foreground)" }}
                    labelStyle={{ color: "var(--muted)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {allocation.map((a, i) => (
                <span key={a.label} className="text-xs flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ background: chart.pie[i % chart.pie.length] }}
                  />
                  {a.label} · {c(a.value)}
                </span>
              ))}
            </div>
            <table className="sr-only">
              <caption>Distribución de activos</caption>
              <thead>
                <tr>
                  <th>Clase</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map((a) => (
                  <tr key={a.label}>
                    <td>{a.label}</td>
                    <td>{c(a.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-4">Activos y pasivos</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="name" tick={{ fill: chart.muted, fontSize: 12 }} />
              <YAxis
                tick={{ fill: chart.muted, fontSize: 11 }}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                formatter={(v) => c(Number(v))}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "var(--foreground)" }}
                labelStyle={{ color: "var(--muted)" }}
                cursor={{ fill: "rgba(128,128,128,0.12)" }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={b.value >= 0 ? chart.accent : chart.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Activos y pasivos</caption>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{c(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
