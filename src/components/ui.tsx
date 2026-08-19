"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ActionResult = { error: string } | undefined | void;

/** Hook para formularios de guardado: ejecuta la server action, muestra el
 *  error devuelto (o uno genérico si revienta) y sólo cierra si fue bien. */
export function useFormAction(
  action: (fd: FormData) => Promise<ActionResult>,
  onDone: () => void,
) {
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(
    async (fd: FormData) => {
      setError(null);
      try {
        const res = await action(fd);
        if (res && "error" in res && res.error) {
          setError(res.error);
          return;
        }
        onDone();
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    },
    [action, onDone],
  );
  return { submit, error };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="col-span-2 text-sm text-negative">{error}</p>;
}

export function SubmitButton({
  children,
  className = "btn btn-primary w-full",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-[var(--foreground)] text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small hook: dialog open state that auto-closes when the row count changes
 *  (i.e. after a successful server action + revalidation). */
export function useAutoCloseOnChange(signal: unknown) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(signal);
  useEffect(() => {
    if (open && signal !== snapshot) {
      setOpen(false);
    }
    setSnapshot(signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
  return { open, setOpen };
}
