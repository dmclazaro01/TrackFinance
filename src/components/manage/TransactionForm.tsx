"use client";

import { useState } from "react";
import { addTransaction, updateTransaction } from "@/app/actions";
import { Modal, SubmitButton, useFormAction, FormError } from "@/components/ui";
import { localDateKey } from "@/lib/calc";
import type { TransactionInput, CashInput } from "@/lib/calc";
import { Field, EditIcon } from "./shared";

const TX_CATEGORIES = [
  "Alimentación",
  "Restauración",
  "Transporte",
  "Vivienda",
  "Suministros",
  "Ocio",
  "Salud",
  "Ropa",
  "Suscripciones",
  "Nómina",
  "Ingreso extra",
  "Otros",
];

function TransactionForm({
  initial,
  accounts,
  onDone,
}: {
  initial?: TransactionInput;
  accounts: CashInput[];
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [kind, setKind] = useState(initial?.kind ?? "Gastos variables");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [applyCashback, setApplyCashback] = useState(true);

  const account = accounts.find((a) => a.id === accountId);
  const cashbackPct = account?.cashbackPercent ?? 0;
  const showCashback = kind !== "Ingresos" && cashbackPct > 0;
  const cashbackAmount =
    showCashback && applyCashback ? ((Number(amount) || 0) * cashbackPct) / 100 : 0;
  const today = localDateKey(new Date());
  const { submit, error } = useFormAction(
    (fd) => (isEdit ? updateTransaction(fd) : addTransaction(fd)),
    onDone,
  );

  return (
    <form action={submit} className="grid grid-cols-2 gap-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <Field label="Tipo">
        <select
          name="kind"
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="Gastos variables">Gasto variable</option>
          <option value="Gastos fijos">Gasto fijo</option>
          <option value="Ingresos">Ingreso</option>
          <option value="Inversiones">Inversión</option>
        </select>
      </Field>
      <Field label="Importe">
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          className="input"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Fecha">
        <input
          name="date"
          type="date"
          className="input"
          defaultValue={initial ? localDateKey(initial.date) : today}
        />
      </Field>
      <Field label="Divisa">
        <input name="currency" className="input" maxLength={3} defaultValue={initial?.currency ?? "EUR"} />
      </Field>
      <Field label="Categoría">
        <input
          name="category"
          className="input"
          list="tx-categories"
          defaultValue={initial?.category ?? ""}
        />
        <datalist id="tx-categories">
          {TX_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Cuenta">
        <select
          name="accountId"
          className="input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">— Sin asignar —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="col-span-2">
        <Field label="Descripción (opcional)">
          <input name="description" className="input" defaultValue={initial?.description ?? ""} />
        </Field>
      </div>

      {showCashback && (
        <label className="col-span-2 flex items-center gap-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
          <input
            name="applyCashback"
            type="checkbox"
            checked={applyCashback}
            onChange={(e) => setApplyCashback(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span>
            Aplicar cashback {cashbackPct}% de {account?.name}
            {cashbackAmount > 0 && (
              <span className="text-positive"> · +{cashbackAmount.toFixed(2)} {account?.currency}</span>
            )}
          </span>
        </label>
      )}

      <FormError error={error} />
      <div className="col-span-2 mt-2">
        <SubmitButton>{isEdit ? "Guardar cambios" : "Añadir movimiento"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddTransactionButton({ accounts }: { accounts: CashInput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        + Añadir movimiento
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir movimiento">
        <TransactionForm accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditTransactionButton({
  transaction,
  accounts,
}: {
  transaction: TransactionInput;
  accounts: CashInput[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-muted hover:text-[var(--accent)] text-sm px-1"
        onClick={() => setOpen(true)}
        aria-label="Editar movimiento"
      >
        <EditIcon />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar movimiento">
        <TransactionForm initial={transaction} accounts={accounts} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

