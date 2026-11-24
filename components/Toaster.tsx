"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => close.current(), 4000);
    return () => clearTimeout(timer);
  }, [paused]);
  return (
    <div
      className="toast-in flex items-start gap-3 rounded-[12px] bg-ink px-4 py-3 text-[15px] text-white shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden className={toast.tone === "error" ? "text-red-300" : "text-emerald-300"}>
        {toast.tone === "error" ? "!" : "✓"}
      </span>
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded px-1 text-stone-300 hover:text-white"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { id, message, tone }]);
  }, []);
  const remove = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[84px] z-50 space-y-2 sm:left-auto sm:right-6 sm:w-96 md:bottom-6"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onClose={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
