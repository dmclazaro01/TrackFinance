"use client";

import { useState } from "react";
import { addInsurance, updateInsurance } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { localDateKey } from "@/lib/calc";
import type { InsuranceInput, CashInput } from "@/lib/calc";
import { Field, AccountSelect, EditIcon } from "./shared";

function InsuranceForm({
  initial,
  accounts,
  onDone,
}: {
  initial?: InsuranceInput;
  accounts: CashInput[];
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const { submit, error } = useFormAction(
    (fd) => (isEdit ? updateInsurance(fd) : addInsurance(fd)),
    onDone,
  );
  return (
    <form action={submit} className="grid grid-cols-2 gap-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <div className="col-span-2">
        <Field label="Nombre">
          <input
            name="name"
            className="input"
            required
            placeholder="Seguro de hogar"
            defaultValue={initial?.name ?? ""}
          />
        </Field>
      </div>
      <Field label="Tipo">
        <select name="type" className="input" defaultValue={initial?.type ?? "HOME"}>
          <option value="HOME">Hogar</option>
          <option value="LIFE">Vida</option>
          <option value="HEALTH">Salud / privado</option>
          <option value="CAR">Coche</option>
          <option value="OTHER">Otro</option>
        </select>
      </Field>
      <Field label="Compañía (opcional)">
        <input
          name="provider"
          className="input"
          placeholder="Mapfre, Sanitas…"
          defaultValue={initial?.provider ?? ""}
        />
      </Field>
      <Field label="Prima">
        <input
          name="premium"
          type="text"
          inputMode="decimal"
          className="input"
          required
          defaultValue={initial?.premium ?? ""}
        />
      </Field>
      <Field label="Frecuencia de pago">
        <select
          name="frequency"
          className="input"
          defaultValue={initial?.frequency ?? "ANNUAL"}
        >
          <option value="MONTHLY">Mensual</option>
          <option value="QUARTERLY">Trimestral</option>
          <option value="ANNUAL">Anual</option>
        </select>
      </Field>
      <Field label="Capital asegurado (opcional)">
        <input
          name="coverage"
          type="text"
          inputMode="decimal"
          className="input"
          defaultValue={initial?.coverage ?? ""}
        />
      </Field>
      <Field label="Divisa">
        <input
          name="currency"
          className="input"
          maxLength={3}
          defaultValue={initial?.currency ?? "EUR"}
        />
      </Field>
      <Field label="Renovación (opcional)">
        <input
          name="renewalDate"
          type="date"
          className="input"
          defaultValue={initial?.renewalDate ? localDateKey(initial.renewalDate) : ""}
        />
      </Field>
      <Field label="Contratado desde (opcional)">
        <input
          name="startDate"
          type="date"
          className="input"
          defaultValue={initial?.startDate ? localDateKey(initial.startDate) : ""}
        />
      </Field>
      <div className="col-span-2">
        <AccountSelect
          name="accountId"
          label="Se paga desde"
          accounts={accounts}
          defaultValue={initial?.accountId}
        />
      </div>
      <p className="col-span-2 text-xs text-muted">
        Deja la fecha en blanco si ya lo tenías antes de tu histórico. Indícala si el seguro
        es nuevo, para no contar la prima en meses anteriores.
      </p>
      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir seguro"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddInsuranceButton({ accounts }: { accounts: CashInput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        + Seguro
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir seguro">
        <InsuranceForm accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditInsuranceButton({
  insurance,
  accounts,
}: {
  insurance: InsuranceInput;
  accounts: CashInput[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar seguro"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar · ${insurance.name}`}>
        <InsuranceForm initial={insurance} accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

