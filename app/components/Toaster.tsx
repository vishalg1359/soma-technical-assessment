"use client"
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const DISMISS_MS = 5000;

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastApi {
  notify: (message: string, options?: { tone?: Toast['tone']; action?: Toast['action'] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Every mutation reports through here, so nothing fails silently. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <Toaster>');
  return api;
}

export default function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<ToastApi['notify']>(
    (message, options) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone: options?.tone ?? 'info', action: options?.action }]);
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pop pointer-events-auto flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-lg backdrop-blur ${
              toast.tone === 'error'
                ? 'border-red-500/40 bg-red-950/80 text-red-200'
                : 'border-[var(--border-strong)] bg-[var(--surface-2)]/90 text-[var(--ink)]'
            }`}
          >
            <span className="flex-grow">{toast.message}</span>

            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
                className="shrink-0 font-medium text-[var(--accent-ink)] hover:underline"
              >
                {toast.action.label}
              </button>
            )}

            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
            >
              {'\u00d7'}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
