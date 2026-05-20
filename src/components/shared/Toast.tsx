import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastHandler: ((toast: ToastMessage) => void) | null = null;

export function toast(type: ToastType, message: string, duration = 3000) {
  const id = Math.random().toString(36).slice(2);
  toastHandler?.({ id, type, message, duration });
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
};

const BG: Record<ToastType, string> = {
  success: 'bg-green-900/80 border-green-700',
  error: 'bg-red-900/80 border-red-700',
  warning: 'bg-yellow-900/80 border-yellow-700',
  info: 'bg-blue-900/80 border-blue-700',
};

function ToastItem({ toast: t, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(t.id), 300);
    }, t.duration ?? 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-surface-lg text-sm text-white max-w-sm transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${BG[t.type]}`}
    >
      {ICONS[t.type]}
      <span className="flex-1">{t.message}</span>
      <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((t: ToastMessage) => {
    setToasts(prev => [...prev.slice(-4), t]);
  }, []);

  useEffect(() => {
    toastHandler = addToast;
    return () => { toastHandler = null; };
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
}
