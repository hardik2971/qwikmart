'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronRight, Home, Star, X } from 'lucide-react';

/* eslint-disable @next/next/no-img-element */
export function Logo({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  if (iconOnly) return <img src="/images/brand/qwikmart-icon.png" alt="QwikMart" className={clsx('select-none', className)} />;
  return (
    <picture>
      <source srcSet="/images/brand/qwikmart-logo.webp" type="image/webp" />
      {/* "Qwik" is dark blue — sit it on a light chip in dark mode so it stays legible */}
      <img
        src="/images/brand/qwikmart-logo.png"
        alt="QwikMart"
        className={clsx('select-none dark:rounded-lg dark:bg-white dark:px-2 dark:py-1', className)}
      />
    </picture>
  );
}
/* eslint-enable @next/next/no-img-element */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <Link href="/" className="inline-flex items-center gap-1 hover:text-primary">
        <Home className="h-3.5 w-3.5" /> Home
      </Link>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          {it.href ? (
            <Link href={it.href} className="hover:text-primary">
              {it.label}
            </Link>
          ) : (
            <span className="font-medium text-primary">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !hideClose && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, hideClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 animate-fade-in sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={() => !hideClose && onClose()} />
      <div
        className={clsx(
          'relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-pop animate-slide-up sm:rounded-card sm:p-6',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
        )}
        role="dialog"
        aria-modal="true"
      >
        {(title || !hideClose) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-lg font-bold text-ink">{title}</div>
            {!hideClose && (
              <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-soft" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-line text-line'}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  icon,
  image,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  /** optional illustration (public/images/empty/*) shown instead of the icon circle */
  image?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="mb-4 h-40 w-40 object-contain" />
      ) : (
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary">{icon}</div>
      )}
      <h3 className="text-lg font-bold">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-muted">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-line',
      )}
    >
      <span
        className={clsx(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'start-6' : 'start-1',
        )}
      />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatusPill({ label, className }: { label: string; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>{label}</span>;
}
