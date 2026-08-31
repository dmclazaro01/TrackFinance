"use client";

import { type ReactNode } from "react";
import type { CashInput } from "@/lib/calc";
import { PencilIcon } from "@/components/icons";

/** Shared building blocks for the entity forms (holdings, property, cash,
 *  debt, insurance, transactions, profile). Each domain form lives in its own
 *  file under this folder; `Manage.tsx` re-exports their public buttons. */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function AccountSelect({
  name,
  label,
  accounts,
  defaultValue,
}: {
  name: string;
  label: string;
  accounts: CashInput[];
  defaultValue?: string | null;
}) {
  return (
    <Field label={label}>
      <select name={name} className="input" defaultValue={defaultValue ?? ""}>
        <option value="">— Sin asignar —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function EditIcon() {
  return (
    <span title="Editar" className="inline-flex">
      <PencilIcon />
    </span>
  );
}
