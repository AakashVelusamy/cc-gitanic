import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function removeById(id: string) {
  return (prev: Toast[]) => prev.filter((t) => t.id !== id);
}

function toastClassName(type: ToastType): string {
  if (type === 'error') return 'bg-destructive/20 border-destructive/30 text-destructive-foreground';
  if (type === 'success') return 'bg-green-500/20 border-green-500/30 text-green-100';
  return 'bg-primary/20 border-primary/30 text-primary-foreground';
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto remove after 5 seconds
    setTimeout(() => { setToasts(removeById(id)); }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(removeById(id));
  }, []);

  const contextValue = useMemo(() => ({ toast: addToast }), [addToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-xl shadow-2xl backdrop-blur-md transition-all duration-300 animate-toast-sequence border ${toastClassName(t.type)}`}
          >
            <div className="flex gap-3 items-center">
              {t.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0 text-destructive" />}
              {t.type === 'success' && <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />}
              {t.type === 'info' && <Info className="w-5 h-5 shrink-0 text-primary" />}
              <p className="text-sm font-medium text-foreground">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-foreground/50 hover:text-foreground transition-colors shrink-0 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
