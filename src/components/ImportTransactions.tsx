"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importTransactions } from "@/app/actions";
import type { ImportResult } from "@/lib/calc";

function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Importando…" : "Importar Excel"}
    </button>
  );
}

export function ImportTransactions() {
  const [state, formAction] = useActionState<ImportResult | null, FormData>(
    importTransactions,
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        type="file"
        name="file"
        accept=".xlsx"
        required
        className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-[var(--foreground)] file:text-sm"
      />
      <ImportButton />
      {state && (
        <span className="text-sm">
          {state.error ? (
            <span className="text-negative">{state.error}</span>
          ) : (
            <span className="text-positive">
              Importados {state.imported}
              {state.skipped > 0 ? ` · ${state.skipped} ya existían` : ""}
            </span>
          )}
        </span>
      )}
    </form>
  );
}
