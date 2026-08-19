import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex-1">
      {/* Nav — minimal, edge-aligned */}
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-bold text-lg">
          <Logo />
          TrackFinance
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <GoogleSignIn label="Entrar" />
        </div>
      </header>

      {/* Hero — split stat-panel macrostructure */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
        <div>
          <span className="inline-block text-xs font-semibold tracking-wide text-[var(--accent)] border border-[var(--border)] rounded-full px-3 py-1 mb-6">
            Patrimonio · inversiones · inmuebles
          </span>
          <h1
            className="font-display font-bold leading-[0.98]"
            style={{ fontSize: "var(--text-display)" }}
          >
            Todo tu patrimonio,
            <br />
            <span className="text-[var(--accent)]">en tiempo real</span>
          </h1>
          <p className="text-muted max-w-xl mt-6 text-lg leading-relaxed">
            Reúne tu salario, propiedades e hipotecas, fondos por ISIN, acciones con
            su precio medio de compra y el efectivo. TrackFinance calcula tu
            patrimonio neto y lo mantiene al minuto con cotizaciones de mercado.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <GoogleSignIn />
            <Link href="#como-funciona" className="btn btn-ghost">
              Cómo funciona
            </Link>
          </div>
          <p className="text-xs text-muted mt-5">
            Sin tarjetas ni configuración. Entras con Google y empiezas.
          </p>
        </div>

        {/* Tier-A/B hand-built snapshot — clearly labelled as an example */}
        <SnapshotPreview />
      </section>

      {/* Capabilities — asymmetric bento, not a uniform card row */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-display font-semibold mb-6">
          Un panel que entiende tu dinero
        </h2>
        <div className="grid gap-4 md:grid-cols-3 md:auto-rows-[minmax(0,1fr)]">
          <article className="card p-7 md:col-span-2 md:row-span-2 flex flex-col justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--accent)] mb-2">
                Patrimonio neto en vivo
              </div>
              <p className="text-muted max-w-md">
                Sumamos inmuebles, inversiones y efectivo y restamos hipotecas y
                deudas. La cifra se recalcula cuando cambia el mercado o cuando
                actualizas cualquier dato.
              </p>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <li className="border-t border-[var(--border)] pt-3">
                Conversión automática de divisas
              </li>
              <li className="border-t border-[var(--border)] pt-3">
                Reparto por clase de activo
              </li>
              <li className="border-t border-[var(--border)] pt-3">
                Cuota mensual desde el TIN y el plazo
              </li>
              <li className="border-t border-[var(--border)] pt-3">
                Ahorro mensual estimado
              </li>
            </ul>
          </article>

          <article className="card p-7">
            <div className="text-sm font-semibold mb-2">Fondos por ISIN</div>
            <p className="text-muted text-sm">
              Escribe el ISIN de un fondo o ETF y lo localizamos y cotizamos
              automáticamente.
            </p>
          </article>

          <article className="card p-7">
            <div className="text-sm font-semibold mb-2">Acciones con P/L</div>
            <p className="text-muted text-sm">
              Tu precio medio de compra frente al precio actual: ganancia o pérdida
              latente por posición.
            </p>
          </article>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-muted">
        TrackFinance · Datos de mercado vía Yahoo Finance · Solo con fines
        informativos, no es asesoramiento financiero.
      </footer>
    </main>
  );
}

/** Hand-built illustrative snapshot (SVG sparkline + allocation bars).
 *  Marked as an example so no figures are presented as real data. */
function SnapshotPreview() {
  const alloc = [
    { label: "Inversiones", pct: 46, color: "var(--accent)" },
    { label: "Inmuebles", pct: 38, color: "var(--accent-2)" },
    { label: "Efectivo", pct: 16, color: "var(--positive)" },
  ];
  return (
    <div className="card p-6 relative">
      <span className="absolute top-4 right-4 text-[10px] uppercase tracking-widest text-muted border border-[var(--border)] rounded-full px-2 py-0.5">
        Ejemplo
      </span>
      <div className="text-xs text-muted">Patrimonio neto</div>
      <div className="text-4xl font-display font-bold mt-1 tabular-nums">
        487.250 €
      </div>
      <div className="text-sm text-positive mt-1">+1.240 € hoy · +0,26 %</div>

      <svg
        viewBox="0 0 320 90"
        className="w-full h-24 mt-5"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 70 L40 66 L80 72 L120 54 L160 58 L200 40 L240 44 L280 24 L320 18"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M0 70 L40 66 L80 72 L120 54 L160 58 L200 40 L240 44 L280 24 L320 18 L320 90 L0 90 Z"
          fill="url(#spark)"
        />
      </svg>

      <div className="mt-5 space-y-3">
        {alloc.map((a) => (
          <div key={a.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted">{a.label}</span>
              <span className="tabular-nums">{a.pct} %</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${a.pct}%`, background: a.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
