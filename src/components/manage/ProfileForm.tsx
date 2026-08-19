"use client";

import { useState } from "react";
import { saveProfile } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import type { ProfileInput, CashInput, SalaryAllocationInput } from "@/lib/calc";
import { Field, AccountSelect } from "./shared";

export function EditProfileButton({
  profile,
  accounts,
  allocations,
}: {
  profile: ProfileInput;
  accounts: CashInput[];
  allocations: SalaryAllocationInput[];
}) {
  const [open, setOpen] = useState(false);
  const { submit, error } = useFormAction(saveProfile, () => setOpen(false));
  return (
    <>
      <button className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        Editar ingresos
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ingresos y perfil">
        <form action={submit} className="grid grid-cols-2 gap-3">
          <Field label="Divisa base">
            <input
              name="baseCurrency"
              className="input"
              maxLength={3}
              defaultValue={profile.baseCurrency}
            />
          </Field>
          <Field label="Salario bruto anual">
            <input
              name="grossSalary"
              type="text"
              inputMode="decimal"
              className="input"
              defaultValue={profile.grossSalary || ""}
            />
          </Field>
          <Field label="Ingreso neto mensual">
            <input
              name="netMonthly"
              type="text"
              inputMode="decimal"
              className="input"
              defaultValue={profile.netMonthly || ""}
            />
          </Field>
          <Field label="Gastos de vida mensuales">
            <input
              name="monthlyExpenses"
              type="text"
              inputMode="decimal"
              className="input"
              defaultValue={profile.monthlyExpenses || ""}
            />
            <span className="text-xs text-muted mt-1 block">
              Solo tu gasto de vida (comida, ocio…). No incluyas seguros, hipotecas ni
              deudas: se calculan y se suman aparte automáticamente.
            </span>
          </Field>
          <div className="col-span-2">
            <AccountSelect
              name="salaryAccountId"
              label="Cuenta principal (recibe el resto de la nómina)"
              accounts={accounts}
              defaultValue={profile.salaryAccountId}
            />
          </div>
          <div className="col-span-2">
            <SalarySplitEditor
              accounts={accounts}
              allocations={allocations}
              netMonthly={profile.netMonthly}
              currency={profile.baseCurrency}
            />
          </div>
          <FormError error={error} />
          <div className="col-span-2 mt-2">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Dynamic editor for splitting the salary across accounts by percentage.
 *  The leftover percentage goes to the main salary account. */
function SalarySplitEditor({
  accounts,
  allocations,
  netMonthly,
  currency,
}: {
  accounts: CashInput[];
  allocations: SalaryAllocationInput[];
  netMonthly: number;
  currency: string;
}) {
  const [rows, setRows] = useState<{ accountId: string; percent: string }[]>(
    allocations.length
      ? allocations.map((a) => ({ accountId: a.accountId, percent: String(a.percent) }))
      : [],
  );

  const totalPct = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const rest = Math.max(0, 100 - totalPct);
  const fmt = (v: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(v || 0);

  function update(i: number, patch: Partial<{ accountId: string; percent: string }>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
      <div className="text-sm font-semibold mb-1">Reparto de la nómina</div>
      <p className="text-xs text-muted mb-3">
        Envía un % de la nómina a otras cuentas (p. ej. una remunerada). El resto se
        queda en la cuenta principal.
      </p>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              name="allocAccountId"
              className="input"
              value={r.accountId}
              onChange={(e) => update(i, { accountId: e.target.value })}
            >
              <option value="">— Cuenta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="relative w-28 shrink-0">
              <input
                name="allocPercent"
                type="text"
                inputMode="decimal"
                className="input pr-6"
                placeholder="0"
                value={r.percent}
                onChange={(e) => update(i, { percent: e.target.value })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted text-sm">
                %
              </span>
            </div>
            <button
              type="button"
              className="text-muted hover:text-[var(--negative)] px-1"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              aria-label="Quitar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-ghost text-sm mt-2"
        onClick={() => setRows((rs) => [...rs, { accountId: "", percent: "" }])}
      >
        + Añadir cuenta
      </button>

      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs border-t border-[var(--border)] pt-2">
        <span className={totalPct > 100 ? "text-negative" : "text-muted"}>
          Repartido {totalPct}%{totalPct > 100 ? " (supera el 100%)" : ""}
          {netMonthly > 0 && ` · ${fmt((netMonthly * Math.min(totalPct, 100)) / 100)}`}
        </span>
        <span className="text-muted">
          A cuenta principal {rest}%
          {netMonthly > 0 && ` · ${fmt((netMonthly * rest) / 100)}`}
        </span>
      </div>
    </div>
  );
}
