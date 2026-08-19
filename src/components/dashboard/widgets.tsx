"use client";

import { type ReactNode } from "react";
import { deleteItem } from "@/app/actions";

const DELETE_CONFIRM_LABEL: Record<string, string> = {
  holding: "esta inversión",
  property: "esta propiedad",
  cash: "esta cuenta (si otros seguros, deudas o hipotecas la usan como cuenta de pago, se desvincularán)",
  debt: "esta deuda",
  insurance: "este seguro",
  transaction: "este movimiento",
};

export function DeleteButton({ id, kind }: { id: string; kind: string }) {
  return (
    <form
      action={deleteItem}
      onSubmit={(e) => {
        const label = DELETE_CONFIRM_LABEL[kind] ?? "este elemento";
        if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        className="text-muted hover:text-[var(--negative)] text-sm px-2"
        aria-label="Eliminar"
        title="Eliminar"
      >
        ✕
      </button>
    </form>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "";
  return (
    <div className="card p-5">
      <div className="text-xs text-muted font-medium mb-1">{label}</div>
      <div className={`text-2xl font-bold tracking-tight ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1">{sub}</div>}
    </div>
  );
}

export function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
      {text}
    </div>
  );
}
