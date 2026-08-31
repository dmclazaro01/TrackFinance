"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { PortfolioSnapshot } from "@/lib/portfolio";
import {
  fmtCurrency,
  fmtPct,
  cashEffective,
  accountTxDelta,
  monthlyFromFrequency,
  propertyValue,
  mortgageStatus,
  debtStatus,
} from "@/lib/calc";
import { refreshPropertyValuation } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WarningIcon, RefreshIcon, ChevronRightIcon } from "@/components/icons";
import { TYPE_LABEL, INSURANCE_LABEL, FREQ_LABEL } from "@/components/dashboard/labels";
import { DeleteButton, Kpi, Row, EmptyHint } from "@/components/dashboard/widgets";

/** Recharts is heavy; load the chart components only on the client and code-split
 *  them out of the initial dashboard bundle. A skeleton holds their space. */
function ChartSkeleton({ single = false }: { single?: boolean }) {
  const card = (
    <div className="card p-6">
      <div className="h-4 w-40 rounded bg-[var(--surface-2)] mb-4" />
      <div className="h-64 rounded-lg bg-[var(--surface-2)] animate-pulse" />
    </div>
  );
  return single ? card : <div className="grid gap-6 lg:grid-cols-2">{card}{card}</div>;
}

const AllocationCharts = dynamic(
  () => import("@/components/dashboard/AllocationCharts").then((m) => m.AllocationCharts),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const PortfolioHistoryChart = dynamic(
  () => import("@/components/PortfolioHistoryChart").then((m) => m.PortfolioHistoryChart),
  { ssr: false, loading: () => <ChartSkeleton single /> },
);
import {
  AddHoldingButton,
  TransferHoldingButton,
  EditHoldingButton,
  AddPropertyButton,
  EditPropertyButton,
  AddCashButton,
  EditCashButton,
  AddDebtButton,
  EditDebtButton,
  AddInsuranceButton,
  EditInsuranceButton,
  AddTransactionButton,
  EditTransactionButton,
  EditProfileButton,
} from "@/components/Manage";

export default function Dashboard({
  initial,
  user,
  signOutSlot,
}: {
  initial: PortfolioSnapshot;
  user: { name?: string | null; email?: string | null; image?: string | null };
  signOutSlot: ReactNode;
}) {
  const [data, setData] = useState<PortfolioSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);
  // null en el primer render para que SSR y CSR coincidan ("ahora mismo");
  // el valor real se hidrata en useEffect.
  const [now, setNow] = useState<number | null>(null);

  // Sync when the server component revalidates (after a mutation).
  useEffect(() => setData(initial), [initial]);

  // Tick every 10s so the "actualizado hace…" label stays fresh.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/portfolio/live", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore transient errors */
    } finally {
      setRefreshing(false);
    }
  }

  // Poll live prices every 30s.
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const {
    summary,
    holdings,
    properties,
    cash,
    debts,
    insurances,
    profile,
    salaryAllocations,
    transactions,
    stalePrices,
  } = data;
  const accountName = (id: string | null) =>
    id ? (cash.find((a) => a.id === id)?.name ?? "—") : "—";
  const base = summary.base;
  const c = (v: number) => fmtCurrency(v, base);

  // Salary split: each allocation sends a % to an account; the leftover % goes
  // to the main salary account.
  const allocByAccount = salaryAllocations.reduce<Record<string, number>>((m, a) => {
    m[a.accountId] = (m[a.accountId] ?? 0) + a.percent;
    return m;
  }, {});
  const allocatedPct = salaryAllocations.reduce((s, a) => s + a.percent, 0);
  const restPct = Math.max(0, 100 - allocatedPct);

  // Monthly cash flow linked to a given account (salary in, payments out).
  const accountFlow = (id: string) => {
    const salaryPct =
      (allocByAccount[id] ?? 0) + (profile.salaryAccountId === id ? restPct : 0);
    const salaryIn = (profile.netMonthly * salaryPct) / 100;
    const insOut = insurances
      .filter((i) => i.accountId === id)
      .reduce((s, i) => s + monthlyFromFrequency(i.premium, i.frequency), 0);
    const debtOut = debts
      .filter((d) => d.accountId === id)
      .reduce((s, d) => s + debtStatus(d).payment, 0);
    const mortOut = properties
      .filter((p) => p.hasMortgage && p.mortgageAccountId === id)
      .reduce((s, p) => s + mortgageStatus(p).payment, 0);
    const out = insOut + debtOut + mortOut;
    return { salaryIn, out, net: salaryIn - out, hasLinks: salaryIn > 0 || out > 0 };
  };

  const breakdown = [
    { name: "Inmuebles", value: summary.realEstate },
    { name: "Inversiones", value: summary.investments },
    { name: "Efectivo", value: summary.cash },
    { name: "Pasivos", value: -summary.liabilities },
  ];

  const updated = new Date(data.updatedAt).toLocaleTimeString("es-ES");
  // Si now es null (primer render / SSR) usamos el propio updatedAt para
  // evitar mismatch de hidratación; tras el montaje now tiene Date.now().
  const effectiveNow = now ?? new Date(data.updatedAt).getTime();
  const secondsAgo = Math.max(0, Math.round((effectiveNow - new Date(data.updatedAt).getTime()) / 1000));
  const relUpdated =
    secondsAgo < 10
      ? "ahora mismo"
      : secondsAgo < 60
        ? `hace ${secondsAgo}s`
        : `hace ${Math.floor(secondsAgo / 60)} min`;

  return (
    <div className="flex-1">
      {/* Header */}
      <header className="border-b border-[var(--border)] sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-display font-bold">
            <Logo />
            <span className="hidden sm:inline">TrackFinance</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={refresh}
              className="btn btn-ghost text-sm"
              disabled={refreshing}
              title={`Actualizar precios · actualizado ${relUpdated}`}
              suppressHydrationWarning
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${refreshing ? "bg-[var(--accent-2)] animate-pulse" : "bg-[var(--positive)]"}`}
              />
              {refreshing ? "Actualizando" : "En vivo"}
              <span suppressHydrationWarning className="hidden lg:inline text-muted font-normal">· {relUpdated}</span>
            </button>
            <div className="flex items-center gap-2">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name ?? ""}
                  className="w-8 h-8 rounded-full border border-[var(--border)]"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] grid place-items-center text-sm">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-sm hidden md:inline text-muted max-w-[140px] truncate">
                {user.name ?? user.email}
              </span>
            </div>
            {signOutSlot}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Net worth — the headline figure, given its own weight */}
        <section className="space-y-4">
          <div className="card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <div className="text-xs text-muted font-medium mb-2">
                Patrimonio neto
              </div>
              <div className="font-display font-bold tracking-tight tabular-nums text-4xl sm:text-5xl">
                {c(summary.netWorth)}
              </div>
              <div className="text-sm mt-3 flex flex-wrap gap-x-5 gap-y-1 text-muted">
                <span>Activos {c(summary.grossAssets)}</span>
                <span>Pasivos −{c(summary.liabilities)}</span>
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs text-muted mb-1">Variación del día</div>
              <div
                className={`text-xl font-semibold tabular-nums ${summary.dayChange >= 0 ? "text-positive" : "text-negative"}`}
              >
                {summary.dayChange >= 0 ? "+" : ""}
                {c(summary.dayChange)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Kpi label="Inversiones" value={c(summary.investments)} />
            <Kpi
              label="P/L inversiones"
              value={c(summary.investmentPL)}
              tone={summary.investmentPL >= 0 ? "positive" : "negative"}
              sub={
                <span
                  className={
                    summary.investmentPL >= 0 ? "text-positive" : "text-negative"
                  }
                >
                  {fmtPct(summary.investmentPLPct)}
                </span>
              }
            />
            <Kpi
              label="Ahorro mensual estimado"
              value={c(summary.monthlyNet)}
              tone={summary.monthlyNet >= 0 ? "positive" : "negative"}
              sub={
                <span className="text-muted">
                  Ingresos {c(summary.monthlyIncome)} · Gastos {c(summary.monthlyOutflow)}
                </span>
              }
            />
          </div>
        </section>

        {/* Charts (lazy-loaded, code-split) */}
        <AllocationCharts
          allocation={summary.allocation}
          breakdown={breakdown}
          base={base}
        />

        {/* Portfolio value over time */}
        <PortfolioHistoryChart base={base} />

        {/* Holdings */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Inversiones</h3>
              <p className="text-xs text-muted">
                Acciones, ETFs, fondos y cripto · precios en tiempo real
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TransferHoldingButton holdings={holdings} accounts={cash} />
              <AddHoldingButton />
            </div>
          </div>
          {stalePrices && stalePrices.length > 0 && (
            <div
              className="mb-3 rounded-lg border border-[var(--negative)]/40 bg-[var(--negative)]/10 px-3 py-2 text-xs text-negative flex items-start gap-2"
              title={`Sin cotización en vivo: ${stalePrices.join(", ")}`}
            >
              <WarningIcon size={14} className="mt-0.5 shrink-0" />
              <span>
                Precios no actualizados para{" "}
                <strong>{stalePrices.join(", ")}</strong>. Se valoran a precio de coste
                hasta que el mercado responda (reintenta en unos minutos).
              </span>
            </div>
          )}
          {holdings.length === 0 ? (
            <EmptyHint text="Aún no has añadido inversiones. Busca por ISIN o ticker para empezar." />
          ) : (
            <>
            {/* Mobile: stacked cards (the 7-column table scrolls awkwardly on phones). */}
            <ul className="space-y-3 sm:hidden">
              {holdings.map((h) => (
                <li key={h.id} className="border border-[var(--border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{h.name}</div>
                      <div className="text-xs text-muted">
                        {h.symbol} · {TYPE_LABEL[h.type] ?? h.type}
                        {!h.live && (
                          <span className="text-[var(--negative)]"> · sin cotización</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditHoldingButton holding={h} />
                      <DeleteButton id={h.id} kind="holding" />
                    </div>
                  </div>
                  {h.dcaAmount > 0 && (
                    <div className="text-xs mt-2 inline-flex flex-wrap items-center gap-1.5">
                      <span className="text-[var(--accent)] border border-[var(--border)] rounded-full px-2 py-0.5">
                        DCA {fmtCurrency(h.dcaAmount, h.currency)}/mes
                      </span>
                      <span className="text-muted">
                        aportado {c(h.dcaInvested)} · {h.dcaContributions} aport.
                      </span>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-sm">
                    <div className="flex justify-between col-span-2">
                      <dt className="text-muted">Valor</dt>
                      <dd className="tabular-nums font-medium">{c(h.marketValueBase)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Cantidad</dt>
                      <dd className="tabular-nums">{h.quantity}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">P. medio</dt>
                      <dd className="tabular-nums">{fmtCurrency(h.avgBuyPrice, h.currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">P. actual</dt>
                      <dd className="tabular-nums">
                        {h.price != null
                          ? fmtCurrency(h.price, h.priceCurrency ?? h.currency)
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">P/L</dt>
                      <dd
                        className={`tabular-nums ${h.plBase >= 0 ? "text-positive" : "text-negative"}`}
                      >
                        {c(h.plBase)} · {fmtPct(h.plPct)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            {/* Desktop: full table. */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-[var(--border)]">
                    <th className="py-2 pr-3 font-medium">Activo</th>
                    <th className="py-2 px-3 font-medium text-right">Cantidad</th>
                    <th className="py-2 px-3 font-medium text-right">P. medio</th>
                    <th className="py-2 px-3 font-medium text-right">P. actual</th>
                    <th className="py-2 px-3 font-medium text-right">Valor</th>
                    <th className="py-2 px-3 font-medium text-right">P/L</th>
                    <th className="py-2 pl-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr
                      key={h.id}
                      className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40"
                    >
                      <td className="py-3 pr-3">
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-muted">
                          {h.symbol} · {TYPE_LABEL[h.type] ?? h.type}
                          {h.isin ? ` · ${h.isin}` : ""}
                          {!h.live && (
                            <span className="text-[var(--negative)]"> · sin cotización</span>
                          )}
                        </div>
                        {h.dcaAmount > 0 && (
                          <div className="text-xs mt-1 inline-flex flex-wrap items-center gap-1.5">
                            <span className="text-[var(--accent)] border border-[var(--border)] rounded-full px-2 py-0.5">
                              DCA {fmtCurrency(h.dcaAmount, h.currency)}/mes
                            </span>
                            <span className="text-muted">
                              aportado {c(h.dcaInvested)} · {h.dcaContributions} aport.
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">{h.quantity}</td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {fmtCurrency(h.avgBuyPrice, h.currency)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {h.price != null
                          ? fmtCurrency(h.price, h.priceCurrency ?? h.currency)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium">
                        {c(h.marketValueBase)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right tabular-nums ${h.plBase >= 0 ? "text-positive" : "text-negative"}`}
                      >
                        {c(h.plBase)}
                        <div className="text-xs">{fmtPct(h.plPct)}</div>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <EditHoldingButton holding={h} />
                          <DeleteButton id={h.id} kind="holding" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        {/* Properties */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Propiedades</h3>
            <AddPropertyButton accounts={cash} />
          </div>
          {properties.length === 0 ? (
            <EmptyHint text="Añade tus inmuebles y sus hipotecas para ver su impacto en el patrimonio." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {properties.map((p) => {
                const value = propertyValue(p);
                // Saldo/cuota amortizados a hoy (coherente con el patrimonio neto).
                const mort = mortgageStatus(p);
                const equity = value - mort.balance;
                const payment = mort.payment;
                const appraised = p.autoValuation && p.appraisedValue != null;
                return (
                  <div key={p.id} className="card p-5">
                    <div className="flex items-start justify-between">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex items-center gap-1">
                        <EditPropertyButton property={p} accounts={cash} />
                        <DeleteButton id={p.id} kind="property" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold mt-1">{c(value)}</div>
                    {appraised && (
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[var(--accent)] border border-[var(--border)] rounded-full px-2 py-0.5">
                          Tasación online
                        </span>
                        <span className="text-muted">
                          {p.surfaceM2 ? `${p.surfaceM2} m²` : ""}
                          {p.appraisedAt
                            ? ` · ${new Date(p.appraisedAt).toLocaleDateString("es-ES")}`
                            : ""}
                        </span>
                        <form action={refreshPropertyValuation} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="text-muted hover:text-[var(--accent)] inline-flex"
                            title="Actualizar tasación ahora"
                            aria-label="Actualizar tasación"
                          >
                            <RefreshIcon size={14} />
                          </button>
                        </form>
                      </div>
                    )}
                    <div className="mt-3 space-y-1 text-sm">
                      {p.purchaseValue > 0 && (
                        <Row
                          label={
                            p.purchaseDate
                              ? `Comprada · ${new Date(p.purchaseDate).toLocaleDateString("es-ES")}`
                              : "Valor de compra"
                          }
                          value={c(p.purchaseValue)}
                        />
                      )}
                      {p.hasMortgage ? (
                        <>
                          <Row label="Hipoteca pendiente" value={c(mort.balance)} />
                          <Row label="TIN" value={`${p.mortgageTin}%`} />
                          <Row label="Cuota mensual" value={c(payment)} />
                          <Row
                            label="Equity (neto)"
                            value={c(equity)}
                            strong
                          />
                        </>
                      ) : (
                        <Row label="Sin hipoteca · equity" value={c(equity)} strong />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Cash & Debts */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Efectivo y cuentas</h3>
              <AddCashButton />
            </div>
            {cash.length === 0 ? (
              <EmptyHint text="Sin cuentas registradas." />
            ) : (
              <ul className="space-y-2">
                {cash.map((a) => {
                  const eff = cashEffective(
                    a,
                    accountTxDelta(a, transactions, insurances, properties, debts),
                  );
                  const flow = accountFlow(a.id);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between border-b border-[var(--border)]/50 pb-2"
                    >
                      <div>
                        <div className="font-medium">{a.name}</div>
                        {flow.hasLinks && (
                          <div className="text-xs mt-0.5">
                            <span
                              className={flow.net >= 0 ? "text-positive" : "text-negative"}
                            >
                              Flujo asociado {flow.net >= 0 ? "+" : ""}
                              {c(flow.net)}/mes
                            </span>
                            <span className="text-muted">
                              {flow.salaryIn > 0 ? ` · salario +${c(flow.salaryIn)}` : ""}
                              {flow.out > 0 ? ` · pagos −${c(flow.out)}` : ""}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-muted">
                          {a.currency}
                          {a.apr > 0 && (
                            <>
                              {" · "}
                              {a.apr}% TAE ·{" "}
                              <span className="text-positive">
                                +{fmtCurrency(eff.monthlyGeneration, a.currency)}/mes
                              </span>
                              {eff.accrued > 0 && (
                                <span className="text-positive">
                                  {" · acum. +"}
                                  {fmtCurrency(eff.accrued, a.currency)}
                                </span>
                              )}
                            </>
                          )}
                          {eff.txDelta !== 0 && (
                            <span
                              className={eff.txDelta >= 0 ? "text-positive" : "text-negative"}
                              title="Movimientos registrados + seguros/deudas/hipoteca que se pagan desde esta cuenta"
                            >
                              {" · movim./recurrentes "}
                              {eff.txDelta >= 0 ? "+" : "−"}
                              {fmtCurrency(Math.abs(eff.txDelta), a.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums mr-1">
                          {fmtCurrency(eff.effectiveBalance, a.currency)}
                        </span>
                        <EditCashButton cash={a} effectiveBalance={eff.effectiveBalance} />
                        <DeleteButton id={a.id} kind="cash" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Deudas y préstamos</h3>
              <AddDebtButton accounts={cash} />
            </div>
            {debts.length === 0 ? (
              <EmptyHint text="Sin deudas registradas." />
            ) : (
              <ul className="space-y-2">
                {debts.map((d) => {
                  const ds = debtStatus(d); // saldo/cuota amortizados a hoy
                  return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between border-b border-[var(--border)]/50 pb-2"
                  >
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted">
                        {d.tin}% · cuota {c(ds.payment)}/mes
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium tabular-nums text-negative mr-1">
                        {c(ds.balance)}
                      </span>
                      <EditDebtButton debt={d} accounts={cash} />
                      <DeleteButton id={d.id} kind="debt" />
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Transactions ledger */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Movimientos</h3>
              <p className="text-xs text-muted">Ingresos y gastos registrados · este mes</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/dashboard/movimientos" className="btn btn-ghost text-sm">
                Histórico mensual <ChevronRightIcon />
              </a>
              <AddTransactionButton accounts={cash} />
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-4">
            <Kpi label="Ingresos (mes)" value={c(summary.txMonth.income)} tone="positive" />
            <Kpi label="Gastos (mes)" value={c(summary.txMonth.expenses)} tone="negative" />
            <Kpi label="Inversiones (mes)" value={c(summary.txMonth.investments)} tone="neutral" />
            <Kpi
              label="Cashback (mes)"
              value={c(summary.txMonth.cashback)}
              tone={summary.txMonth.cashback > 0 ? "positive" : "neutral"}
            />
            <Kpi
              label="Neto (mes)"
              value={c(summary.txMonth.net)}
              tone={summary.txMonth.net >= 0 ? "positive" : "negative"}
            />
          </div>

          {transactions.length === 0 ? (
            <EmptyHint text="Sin movimientos. Añade tus ingresos y gastos; el cashback se calcula solo si la cuenta lo tiene." />
          ) : (
            <>
            {/* Mobile: stacked cards. */}
            <ul className="space-y-2 sm:hidden">
              {transactions.map((t) => {
                const income = t.type === "INCOME";
                return (
                  <li
                    key={t.id}
                    className="border border-[var(--border)] rounded-xl p-3 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {t.category ?? (income ? "Ingreso" : "Gasto")}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(t.date).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                        {" · "}
                        {accountName(t.accountId)}
                        {t.description ? ` · ${t.description}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div
                          className={`tabular-nums text-sm ${income ? "text-positive" : "text-negative"}`}
                        >
                          {income ? "+" : "−"}
                          {fmtCurrency(t.amount, t.currency)}
                        </div>
                        {t.cashback > 0 && (
                          <div className="tabular-nums text-xs text-positive">
                            +{fmtCurrency(t.cashback, t.currency)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <EditTransactionButton transaction={t} accounts={cash} />
                        <DeleteButton id={t.id} kind="transaction" />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* Desktop: full table. */}
            <div className="card p-2 overflow-x-auto hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-[var(--border)]">
                    <th className="py-2 px-3 font-medium">Fecha</th>
                    <th className="py-2 px-3 font-medium">Concepto</th>
                    <th className="py-2 px-3 font-medium">Cuenta</th>
                    <th className="py-2 px-3 font-medium text-right">Importe</th>
                    <th className="py-2 px-3 font-medium text-right">Cashback</th>
                    <th className="py-2 pl-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const income = t.type === "INCOME";
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40"
                      >
                        <td className="py-2.5 px-3 text-muted whitespace-nowrap">
                          {new Date(t.date).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium">{t.category ?? (income ? "Ingreso" : "Gasto")}</span>
                          {t.description && (
                            <span className="text-muted"> · {t.description}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted">{accountName(t.accountId)}</td>
                        <td
                          className={`py-2.5 px-3 text-right tabular-nums ${income ? "text-positive" : "text-negative"}`}
                        >
                          {income ? "+" : "−"}
                          {fmtCurrency(t.amount, t.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-positive">
                          {t.cashback > 0 ? `+${fmtCurrency(t.cashback, t.currency)}` : ""}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <EditTransactionButton transaction={t} accounts={cash} />
                            <DeleteButton id={t.id} kind="transaction" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        {/* Insurance */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Seguros</h3>
              <p className="text-xs text-muted">
                Hogar, vida, salud, coche… La prima se suma a tu gasto mensual (
                {c(summary.insuranceMonthly)}/mes).
              </p>
            </div>
            <AddInsuranceButton accounts={cash} />
          </div>
          {insurances.length === 0 ? (
            <EmptyHint text="Sin seguros registrados." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {insurances.map((i) => (
                <div key={i.id} className="card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-muted">
                        {INSURANCE_LABEL[i.type] ?? i.type}
                        {i.provider ? ` · ${i.provider}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <EditInsuranceButton insurance={i} accounts={cash} />
                      <DeleteButton id={i.id} kind="insurance" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <Row
                      label={`Prima (${FREQ_LABEL[i.frequency] ?? i.frequency})`}
                      value={fmtCurrency(i.premium, i.currency)}
                    />
                    {i.coverage > 0 && (
                      <Row label="Capital asegurado" value={fmtCurrency(i.coverage, i.currency)} />
                    )}
                    {i.renewalDate && (
                      <Row
                        label="Renovación"
                        value={new Date(i.renewalDate).toLocaleDateString("es-ES")}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Income / profile */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Ingresos y flujo mensual</h3>
            <EditProfileButton
              profile={profile}
              accounts={cash}
              allocations={salaryAllocations}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Kpi label="Salario bruto anual" value={c(profile.grossSalary)} />
            <Kpi
              label="Ingreso neto mensual"
              value={c(summary.monthlyIncome)}
              sub={
                summary.cashInterestMonthly > 0 ? (
                  <span className="text-muted">
                    + remuneración cuentas{" "}
                    <span className="text-positive">{c(summary.cashInterestMonthly)}</span>/mes
                    (al saldo)
                  </span>
                ) : undefined
              }
            />
            <Kpi label="Gastos + cuotas / mes" value={c(summary.monthlyOutflow)} />
            <Kpi
              label="Ahorro mensual"
              value={c(summary.monthlyNet)}
              tone={summary.monthlyNet >= 0 ? "positive" : "negative"}
            />
          </div>
        </section>

        <p suppressHydrationWarning className="text-center text-xs text-muted pb-4">
          Última actualización: {updated} · Datos vía Yahoo Finance · No constituye
          asesoramiento financiero.
        </p>
      </main>
    </div>
  );
}

