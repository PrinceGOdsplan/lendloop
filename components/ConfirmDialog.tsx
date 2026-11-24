"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./ui";

/** Native <dialog>: focus is trapped by the browser and Esc closes it. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-white p-6 text-ink shadow-xl"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:justify-end">
        <Button variant="secondary" onClick={onClose} autoFocus>
          {cancelLabel}
        </Button>
        <Button
          variant="dangerSolid"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
