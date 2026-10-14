'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface T { id: number; type: ToastType; message: string }
const Ctx = createContext<(message: string, type?: ToastType) => void>(() => {});

const BORDER: Record<ToastType, string> = { success: 'border-primary/40', error: 'border-red-300', warning: 'border-amber-300', info: 'border-blue-300' };
const DOT: Record<ToastType, string> = { success: 'bg-primary', error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' };

/** Toasts — identical look to layouts/partials/toasts.blade.php. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const remove = (id: number) => setItems((s) => s.filter((i) => i.id !== id));
  const add = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, type, message }]);
    setTimeout(() => remove(id), 4500);
  }, []);
  return (
    <Ctx.Provider value={add}>
      {children}
      <div className="fixed top-20 right-4 z-[100] space-y-2 w-80" data-testid="toasts">
        {items.map((t) => (
          <div key={t.id} data-toast={t.type} className={`flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg dark:bg-dark-card ${BORDER[t.type]}`}>
            <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold ${DOT[t.type]}`}>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
            </span>
            <p className="flex-1 text-sm text-navy dark:text-slate-200 break-words">{t.message}</p>
            <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => remove(t.id)}><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
/** const toast = useToast(); toast('Saved'); toast('Failed', 'error') */
export const useToast = () => useContext(Ctx);
