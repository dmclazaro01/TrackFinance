"use client";

import { useMemo, useState } from "react";
import { transferHolding } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { localDateKey } from "@/lib/calc";
import type { EnrichedHolding, CashInput } from "@/lib/calc";
import { Field, AccountSelect } from "./shared";

type SearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
  isin: string | null;
};

function SymbolSearch({ onPick }: { onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-1">
      <span className="label">Buscar por nombre, ticker o ISIN</span>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Ej. AAPL, Vanguard, IE00B4L5Y983"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={run}>
          {loading ? "…" : "Buscar"}
        </button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-[var(--surface-2)] text-sm"
                onClick={() => {
                  onPick(r);
                  setResults([]);
                }}
              >
                <span className="font-semibold">{r.symbol}</span>{" "}
                <span className="text-muted">— {r.name}</span>
                {r.exchange && (
                  <span className="text-muted text-xs"> · {r.exchange}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function seedPrice(h: EnrichedHolding | null | undefined): string {
  if (h?.live && h.price != null) return String(h.price);
  return "";
}

function TransferForm({
  holdings,
  accounts,
  onDone,
}: {
  holdings: EnrichedHolding[];
  accounts: CashInput[];
  onDone: () => void;
}) {
  const transferable = holdings.filter((h) => h.baseQuantity > 0);
  const initialFrom = transferable[0] ?? null;

  const [fromId, setFromId] = useState(initialFrom?.id ?? "");
  const [toId, setToId] = useState("");
  const [mode, setMode] = useState<"eur" | "units">("eur");
  const [priceFrom, setPriceFrom] = useState(() => seedPrice(initialFrom));
  const [priceTo, setPriceTo] = useState("");
  const [picked, setPicked] = useState<SearchResult | null>(null);

  const isNew = toId === "new";

  const from = useMemo(
    () => holdings.find((h) => h.id === fromId) ?? null,
    [holdings, fromId],
  );

  function onFromChange(id: string) {
    setFromId(id);
    const h = holdings.find((x) => x.id === id);
    setPriceFrom(seedPrice(h));
    if (toId === id) setToId("");
  }

  function onToChange(id: string) {
    setToId(id);
    if (id === "new") {
      setPriceTo("");
      return;
    }
    const h = holdings.find((x) => x.id === id);
    setPriceTo(seedPrice(h));
  }

  const { submit, error } = useFormAction(transferHolding, onDone);
  const destOptions = holdings.filter((h) => h.id !== fromId);
  const today = localDateKey(new Date());

  return (
    <form action={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label="Origen">
          <select
            name="fromId"
            className="input"
            required
            value={fromId}
            onChange={(e) => onFromChange(e.target.value)}
          >
            {transferable.length === 0 && (
              <option value="">— Sin fondos con participaciones manuales —</option>
            )}
            {transferable.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.symbol}) · manual {h.baseQuantity}
                {h.quantity !== h.baseQuantity ? ` · ef. ${h.quantity}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {from && (
          <p className="text-xs text-muted mt-1">
            Solo se pueden traspasar participaciones manuales ({from.baseQuantity}).
            {from.dcaAmount > 0 && " El DCA no se mueve con el traspaso."}
          </p>
        )}
      </div>

      <div className="col-span-2 flex gap-2">
        <button
          type="button"
          className={`btn text-sm flex-1 ${mode === "eur" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("eur")}
        >
          Importe (€)
        </button>
        <button
          type="button"
          className={`btn text-sm flex-1 ${mode === "units" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("units")}
        >
          Participaciones
        </button>
        <input type="hidden" name="mode" value={mode} />
      </div>

      <Field label={mode === "eur" ? "Importe (€)" : "Participaciones"}>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          className="input"
          required
          placeholder={mode === "eur" ? "2000" : "10"}
        />
      </Field>
      <Field label="Precio venta (origen)">
        <input
          name="priceFrom"
          type="text"
          inputMode="decimal"
          className="input"
          required
          value={priceFrom}
          onChange={(e) => setPriceFrom(e.target.value)}
        />
      </Field>

      <Field label="Fecha de venta">
        <input name="saleDate" type="date" className="input" required defaultValue={today} />
      </Field>
      <Field label="Fecha de compra">
        <input name="buyDate" type="date" className="input" required defaultValue={today} />
      </Field>
      <p className="col-span-2 text-xs text-muted -mt-1">
        Si venta y compra no son el mismo día, usa el precio de cada fecha. Valor que sale =
        participaciones × precio venta; las que entran = ese valor ÷ precio compra.
      </p>

      <div className="col-span-2">
        <Field label="Destino">
          <select
            name="toId"
            className="input"
            required
            value={toId}
            onChange={(e) => onToChange(e.target.value)}
          >
            <option value="">— Elige destino —</option>
            {destOptions.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.symbol})
              </option>
            ))}
            <option value="new">+ Nuevo fondo…</option>
          </select>
        </Field>
      </div>

      {isNew && (
        <div className="col-span-2 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
          <SymbolSearch
            onPick={(r) => {
              setPicked(r);
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nombre">
                <input
                  name="newName"
                  className="input"
                  required
                  defaultValue={picked?.name ?? ""}
                  key={`n-${picked?.symbol ?? "x"}`}
                />
              </Field>
            </div>
            <Field label="Símbolo (Yahoo)">
              <input
                name="newSymbol"
                className="input"
                required
                defaultValue={picked?.symbol ?? ""}
                key={`s-${picked?.symbol ?? "x"}`}
              />
            </Field>
            <Field label="ISIN">
              <input
                name="newIsin"
                className="input"
                defaultValue={picked?.isin ?? ""}
                key={`i-${picked?.symbol ?? "x"}`}
              />
            </Field>
            <Field label="Tipo">
              <select name="newType" className="input" defaultValue="FUND">
                <option value="FUND">Fondo</option>
                <option value="ETF">ETF</option>
                <option value="STOCK">Acción</option>
                <option value="CRYPTO">Cripto</option>
                <option value="BOND">Bono</option>
                <option value="OTHER">Otro</option>
              </select>
            </Field>
            <Field label="Divisa">
              <input name="newCurrency" className="input" maxLength={3} defaultValue="EUR" />
            </Field>
          </div>
        </div>
      )}

      <Field label="Precio compra (destino)">
        <input
          name="priceTo"
          type="text"
          inputMode="decimal"
          className="input"
          required
          value={priceTo}
          onChange={(e) => setPriceTo(e.target.value)}
        />
      </Field>
      <Field label="Comisión (opcional)">
        <input
          name="commission"
          type="text"
          inputMode="decimal"
          className="input"
          placeholder="0"
        />
      </Field>
      <div className="col-span-2">
        <AccountSelect
          name="commissionAccountId"
          label="Cuenta que paga la comisión (si hay)"
          accounts={accounts}
        />
      </div>

      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>Confirmar traspaso</SubmitButton>
      </div>
    </form>
  );
}

export function TransferHoldingButton({
  holdings,
  accounts,
}: {
  holdings: EnrichedHolding[];
  accounts: CashInput[];
}) {
  const [open, setOpen] = useState(false);
  const none = holdings.every((h) => h.baseQuantity <= 0);
  return (
    <>
      <button
        className="btn btn-ghost text-sm"
        onClick={() => setOpen(true)}
        disabled={none}
        title={
          none
            ? "No hay participaciones manuales para traspasar"
            : "Traspasar entre fondos"
        }
      >
        Traspasar
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Traspasar entre fondos">
        <TransferForm
          holdings={holdings}
          accounts={accounts}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
