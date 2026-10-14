'use client';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

const W: Record<string, string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl', '6xl': 'max-w-6xl' };

/** Centered modal or right-side drawer (`side`) — same look as components/modal.blade.php. */
export function Modal({ open, onClose, title, children, size = 'lg', side = false, footer }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: string; side?: boolean; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`fixed inset-0 z-[90] flex ${side ? 'justify-end' : 'items-start justify-center p-4 pt-[6vh]'} overflow-y-auto`} role="dialog">
      <div className="fixed inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative w-full ${W[size] || size} bg-white dark:bg-dark-card ${side ? 'min-h-screen shadow-2xl' : 'rounded-2xl shadow-2xl mb-10'}`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-line">
            <h3 className="font-bold text-navy dark:text-white">{title}</h3>
            <button type="button" onClick={onClose} className="text-red-400 hover:text-red-600" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        )}
        {children}
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-line dark:border-dark-line">{footer}</div>}
      </div>
    </div>
  );
}
