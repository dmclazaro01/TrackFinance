"use client";

import { useState } from "react";
import { addCash, updateCash } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { fmtCurrency } from "@/lib/calc";
import type { CashInput } from "@/lib/calc";
import { Field, EditIcon } from "./shared";

function CashForm({
  initial,
  effectiveBalance,
  onDone,
}: {
  initial?: CashInput;
  effectiveBalance?: number;
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const showHint =
    isEdit && effectiveBalance != null && Math.abs(effectiveBalance - initial!.balance) > 0.01;
  const { submit, error } = useFormAction((fd) => (isEdit ? updateCash(fd) : addCash(fd)), onDone);
  return (
    <form action={submit} className="grid grid-cols-2 gap-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <div className="col-span-2">
        <Field label="Nombre">
          <input
            name="name"
            className="input"
            required
            placeholder="Cuenta corriente"
            defaultValue={initial?.name ?? ""}
          />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={isEdit ? "Saldo actual" : "Saldo"}>
          <input
            name="balance"
            type="text"
            inputMode="decimal"
            className="input"
            required
            defaultValue={
              effectiveBalance != null ? effectiveBalance.toFixed(2) : (initial?.balance ?? "")
            }
          />
        </Field>
        {showHint && (
          <p className="text-xs text-muted mt-1.5">
            Este saldo ({" "}
            <strong className="text-[var(--foreground)]">
              {fmtCurrency(effectiveBalance!, initial!.currency)}
            </strong>{" "}
            ) ya incluye los movimientos, seguros/deudas recurrentes y el interés acumulados
            desde la última vez que lo fijaste (habías introducido{" "}
            {fmtCurrency(initial!.balance, initial!.currency)}). Al guardar se toma como el saldo
            real de hoy y el cálculo se reinicia desde aquí. Corrígelo solo si tu banco marca
            otra cifra.
          </p>
        )}
      </div>
      <Field label="Divisa">
        <input
          name="currency"
          className="input"
          maxLength={3}
          defaultValue={initial?.currency ?? "EUR"}
        />
      </Field>
      <Field label="Interés anual (%)">
        <input
          name="apr"
          type="text"
          inputMode="decimal"
          className="input"
          defaultValue={initial?.apr ?? "0"}
        />
      </Field>
      <Field label="Cashback (%)">
        <input
          name="cashbackPercent"
          type="text"
          inputMode="decimal"
          className="input"
          placeholder="0"
          defaultValue={initial?.cashbackPercent ?? ""}
        />
      </Field>
      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddCashButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        + Efectivo
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir cuenta / efectivo">
        <CashForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditCashButton({
  cash,
  effectiveBalance,
}: {
  cash: CashInput;
  effectiveBalance?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar cuenta"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar · ${cash.name}`}>
        <CashForm
          initial={cash}
          effectiveBalance={effectiveBalance}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

