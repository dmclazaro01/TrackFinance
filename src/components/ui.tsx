"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { CloseIcon } from "@/components/icons";

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

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape to close + focus trap (Tab / Shift+Tab cycle within the dialog).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open, restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstField ?? panel)?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id={titleId} className="text-lg font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-[var(--foreground)] inline-flex"
            aria-label="Cerrar"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Styled confirmation dialog — replaces the native window.confirm() so the
 *  destructive-action flow keeps the app's visual language. Focus lands on
 *  "Cancelar" by default (safe option). */
export function ConfirmDialog({
  open,
  title = "¿Confirmar?",
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} className="btn btn-ghost">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="btn"
            style={{ background: "var(--negative)", color: "var(--on-accent)" }}
          >
            {confirmLabel}
          </button>
        </div>
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
