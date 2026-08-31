"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCurrency, fmtPct } from "@/lib/calc";
import { useThemeColors } from "@/components/dashboard/theme";

type Point = { date: string; value: number };
type Range = "1S" | "1M" | "1A";
const RANGE_DAYS: Record<Range, number> = { "1S": 7, "1M": 31, "1A": 366 };

export function PortfolioHistoryChart({ base }: { base: string }) {
  const [series, setSeries] = useState<Point[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("1M");
  const color = useThemeColors();

  useEffect(() => {
    let alive = true;
    fetch("/api/portfolio/history", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((j) => {
        if (alive) setSeries(j.series ?? []);
      })
      .catch(() => alive && setSeries([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(() => {
    if (!series) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
    return series.filter((p) => new Date(p.date) >= cutoff);
  }, [series, range]);

  const change = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0].value;
    const last = data[data.length - 1].value;
    return { abs: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 };
  }, [data]);

  const c = (v: number) => fmtCurrency(v, base);
  const fmtDate = (d: string) => {
    const date = new Date(d);
    return range === "1A"
      ? date.toLocaleDateString("es-ES", { month: "short" })
      : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h3 className="font-semibold">Evolución de la cartera</h3>
          {change && (
            <div className="text-sm mt-1">
              <span
                className={change.abs >= 0 ? "text-positive" : "text-negative"}
              >
                {change.abs >= 0 ? "+" : ""}
                {c(change.abs)} · {fmtPct(change.pct)}
              </span>
              <span className="text-muted"> en {labelFor(range)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {(["1S", "1M", "1A"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors"
              style={
                range === r
                  ? { background: "var(--accent)", color: "var(--on-accent)" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 grid place-items-center text-sm text-muted">Cargando…</div>
      ) : data.length < 2 ? (
        <div className="h-64 grid place-items-center text-sm text-muted text-center px-4">
          {series && series.length === 0
            ? "Añade inversiones con cotización para ver su evolución histórica."
            : "Sin suficientes datos en este rango."}
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="pf-hist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={color.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: color.muted, fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: color.muted, fontSize: 11 }}
                width={48}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v) => c(Number(v))}
                labelFormatter={(d) => new Date(String(d)).toLocaleDateString("es-ES")}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                }}
                itemStyle={{ color: "var(--foreground)" }}
                labelStyle={{ color: "var(--muted)" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color.accent}
                strokeWidth={2}
                fill="url(#pf-hist)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function labelFor(r: Range): string {
  return r === "1S" ? "la última semana" : r === "1M" ? "el último mes" : "el último año";
}
