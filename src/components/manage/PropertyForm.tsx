"use client";

import { useState } from "react";
import { addProperty, updateProperty } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { localDateKey } from "@/lib/calc";
import type { PropertyInput, CashInput } from "@/lib/calc";
import { Field, AccountSelect, EditIcon } from "./shared";

function PropertyForm({
  initial,
  accounts,
  onDone,
}: {
  initial?: PropertyInput;
  accounts: CashInput[];
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [mortgage, setMortgage] = useState(initial?.hasMortgage ?? false);
  const [autoVal, setAutoVal] = useState(initial?.autoValuation ?? false);
  const { submit, error } = useFormAction(
    (fd) => (isEdit ? updateProperty(fd) : addProperty(fd)),
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
            placeholder="Vivienda habitual"
            defaultValue={initial?.name ?? ""}
          />
        </Field>
      </div>
      <Field label="Valor actual (manual)">
        <input
          name="currentValue"
          type="text"
          inputMode="decimal"
          className="input"
          required
          defaultValue={initial?.currentValue ?? ""}
        />
      </Field>
      <Field label="Valor de compra">
        <input
          name="purchaseValue"
          type="text"
          inputMode="decimal"
          className="input"
          defaultValue={initial?.purchaseValue ?? ""}
        />
      </Field>
      <Field label="Fecha de compra (opcional)">
        <input
          name="purchaseDate"
          type="date"
          className="input"
          defaultValue={initial?.purchaseDate ? localDateKey(initial.purchaseDate) : ""}
        />
      </Field>

      {/* Online appraisal (Catastro) */}
      <div className="col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            name="autoValuation"
            type="checkbox"
            checked={autoVal}
            onChange={(e) => setAutoVal(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          Actualizar el valor a diario con tasación online (Catastro + €/m² de zona)
        </label>
        {autoVal && (
          <div className="mt-3 grid gap-3">
            <Field label="Referencia catastral (20 caracteres)">
              <input
                name="cadastralRef"
                className="input font-mono"
                placeholder="0545206VK4704F0001RE"
                maxLength={20}
                defaultValue={initial?.cadastralRef ?? ""}
              />
            </Field>
            <Field label="Dirección (opcional, para referencia)">
              <input
                name="address"
                className="input"
                placeholder="Calle Alcalá 1, Madrid"
                defaultValue={initial?.address ?? ""}
              />
            </Field>
            <p className="text-xs text-muted">
              Tu referencia catastral está en el recibo del IBI o en{" "}
              <span className="text-[var(--accent)]">sedecatastro.gob.es</span>. El valor
              es una estimación (m² del Catastro × €/m² de la provincia), no una tasación
              oficial.
            </p>
          </div>
        )}
      </div>

      <div className="col-span-2 flex items-center gap-2 mt-1">
        <input
          id="hasMortgage"
          name="hasMortgage"
          type="checkbox"
          checked={mortgage}
          onChange={(e) => setMortgage(e.target.checked)}
          className="w-4 h-4 accent-[var(--accent)]"
        />
        <label htmlFor="hasMortgage" className="text-sm">
          Tiene hipoteca
        </label>
      </div>
      {mortgage && (
        <>
          <Field label="Capital pendiente">
            <input
              name="mortgageBalance"
              type="text"
              inputMode="decimal"
              className="input"
              defaultValue={initial?.mortgageBalance ?? ""}
            />
          </Field>
          <Field label="TIN (%)">
            <input
              name="mortgageTin"
              type="text"
              inputMode="decimal"
              className="input"
              defaultValue={initial?.mortgageTin ?? ""}
            />
          </Field>
          <Field label="Meses restantes">
            <input
              name="mortgageMonths"
              type="text"
              inputMode="numeric"
              className="input"
              defaultValue={initial?.mortgageMonths ?? ""}
            />
          </Field>
          <Field label="Se cobra la cuota desde (opcional)">
            <input
              name="mortgageStartDate"
              type="date"
              className="input"
              defaultValue={
                initial?.mortgageStartDate ? localDateKey(initial.mortgageStartDate) : ""
              }
            />
          </Field>
          <div className="col-span-2">
            <AccountSelect
              name="mortgageAccountId"
              label="La hipoteca se paga desde"
              accounts={accounts}
              defaultValue={initial?.mortgageAccountId}
            />
          </div>
          <p className="col-span-2 text-xs text-muted">
            Deja la fecha en blanco si ya se venía pagando antes de tu histórico. Indícala si
            la hipoteca es nueva, para no contar la cuota en meses anteriores.
          </p>
        </>
      )}
      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir propiedad"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddPropertyButton({ accounts }: { accounts: CashInput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        + Añadir propiedad
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir propiedad">
        <PropertyForm accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditPropertyButton({
  property,
  accounts,
}: {
  property: PropertyInput;
  accounts: CashInput[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar propiedad"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar · ${property.name}`}>
        <PropertyForm initial={property} accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

