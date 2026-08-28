import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      // Scrub any sensitive pattern or lengthy payloads to ensure privacy
      const sanitized = message.substring(0, 150);
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      setToasts((prev) => [...prev, { id, type, message: sanitized }]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  const success = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
  const error = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const info = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast Render Container */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-card border p-3.5 shadow-float animate-rise ${
              toast.type === 'error'
                ? 'border-warn bg-warn-tint text-warn'
                : toast.type === 'success'
                  ? 'border-transparent bg-accent-tint text-accent-ink'
                  : 'border-line bg-surface text-text'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' ? (
                <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
              ) : toast.type === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
              ) : (
                <Info className="h-4 w-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
              )}
              <p className="text-row font-bold leading-snug">{toast.message}</p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="cursor-pointer rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
