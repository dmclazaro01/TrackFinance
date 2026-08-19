"use client";

import { useState } from "react";
import { addDebt, updateDebt } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import type { DebtInput, CashInput } from "@/lib/calc";
import { Field, AccountSelect, EditIcon } from "./shared";

function DebtForm({
  initial,
  accounts,
  onDone,
}: {
  initial?: DebtInput;
  accounts: CashInput[];
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const { submit, error } = useFormAction((fd) => (isEdit ? updateDebt(fd) : addDebt(fd)), onDone);
  return (
    <form action={submit} className="grid grid-cols-2 gap-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <div className="col-span-2">
        <Field label="Nombre">
          <input
            name="name"
            className="input"
            required
            placeholder="Préstamo coche"
            defaultValue={initial?.name ?? ""}
          />
        </Field>
      </div>
      <Field label="Capital pendiente">
        <input
          name="balance"
          type="text"
          inputMode="decimal"
          className="input"
          required
          defaultValue={initial?.balance ?? ""}
        />
      </Field>
      <Field label="TIN (%)">
        <input
          name="tin"
          type="text"
          inputMode="decimal"
          className="input"
          defaultValue={initial?.tin ?? "0"}
        />
      </Field>
      <Field label="Meses restantes">
        <input
          name="months"
          type="text"
          inputMode="numeric"
          className="input"
          defaultValue={initial?.months ?? "0"}
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
      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddDebtButton({ accounts }: { accounts: CashInput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        + Deuda
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir deuda / préstamo">
        <DebtForm accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditDebtButton({
  debt,
  accounts,
}: {
  debt: DebtInput;
  accounts: CashInput[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar deuda"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar · ${debt.name}`}>
        <DebtForm initial={debt} accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

