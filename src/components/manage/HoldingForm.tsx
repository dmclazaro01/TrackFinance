"use client";

import { useState } from "react";
import { addHolding, updateHolding } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { localDateKey } from "@/lib/calc";
import type { EnrichedHolding } from "@/lib/calc";
import { Field, EditIcon } from "./shared";

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
    <div className="mb-4">
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

function HoldingForm({
  initial,
  onDone,
}: {
  initial?: EnrichedHolding;
  onDone: () => void;
}) {
  const isEdit = !!initial;
  // For edit, keep a key seed so search-picks can override the field defaults.
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const seed = picked?.symbol ?? initial?.symbol ?? "new";
  const { submit, error } = useFormAction(
    (fd) => (isEdit ? updateHolding(fd) : addHolding(fd)),
    () => {
      setPicked(null);
      onDone();
    },
  );

  return (
    <>
      {!isEdit && <SymbolSearch onPick={setPicked} />}
      <form action={submit} className="grid grid-cols-2 gap-3">
        {isEdit && <input type="hidden" name="id" value={initial!.id} />}
        <div className="col-span-2">
          <Field label="Nombre">
            <input
              name="name"
              className="input"
              required
              defaultValue={picked?.name ?? initial?.name ?? ""}
              key={`name-${seed}`}
            />
          </Field>
        </div>
        <Field label="Símbolo (Yahoo)">
          <input
            name="symbol"
            className="input"
            required
            defaultValue={picked?.symbol ?? initial?.symbol ?? ""}
            key={`sym-${seed}`}
          />
        </Field>
        <Field label="ISIN (opcional)">
          <input
            name="isin"
            className="input"
            defaultValue={picked?.isin ?? initial?.isin ?? ""}
            key={`isin-${seed}`}
          />
        </Field>
        <Field label="Tipo">
          <select name="type" className="input" defaultValue={initial?.type ?? "STOCK"}>
            <option value="STOCK">Acción</option>
            <option value="ETF">ETF</option>
            <option value="FUND">Fondo</option>
            <option value="CRYPTO">Cripto</option>
            <option value="BOND">Bono</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Divisa">
          <input
            name="currency"
            className="input"
            maxLength={3}
            defaultValue={initial?.currency ?? "EUR"}
          />
        </Field>
        <Field label="Cantidad / participaciones">
          <input
            name="quantity"
            type="text"
            inputMode="decimal"
            className="input"
            required
            defaultValue={initial ? initial.baseQuantity : ""}
          />
        </Field>
        <Field label="Precio medio de compra">
          <input
            name="avgBuyPrice"
            type="text"
            inputMode="decimal"
            className="input"
            required
            defaultValue={initial ? initial.baseAvgBuyPrice : ""}
          />
        </Field>

        {/* DCA */}
        <div className="col-span-2 mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
          <div className="text-sm font-semibold mb-1">Aportación mensual (DCA)</div>
          <p className="text-xs text-muted mb-3">
            Opcional. Cada mes desde la fecha indicada se compran participaciones al
            precio de ese mes y la posición se actualiza sola.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Importe mensual (€)">
              <input
                name="dcaAmount"
                type="text"
                inputMode="decimal"
                className="input"
                placeholder="0"
                defaultValue={initial?.dcaAmount ? initial.dcaAmount : ""}
              />
            </Field>
            <Field label="Fecha de inicio">
              <input
                name="dcaStartDate"
                type="date"
                className="input"
                defaultValue={initial?.dcaStartDate ? localDateKey(initial.dcaStartDate) : ""}
              />
            </Field>
          </div>
        </div>

        <FormError error={error} />
        <div className="col-span-2 mt-2">
          <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir inversión"}</SubmitButton>
        </div>
      </form>
    </>
  );
}

export function AddHoldingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        + Añadir inversión
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir inversión">
        <HoldingForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditHoldingButton({ holding }: { holding: EnrichedHolding }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar inversión"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar · ${holding.name}`}>
        <HoldingForm initial={holding} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
