'use client';
// Small presentational components ported from backend/resources/views/components/*.blade.php.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Eye, Pencil, Trash2, TrendingUp, TrendingDown, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { statusColor, statusLabel, flagEmoji, imgUrl } from '@/lib/format';
import type { Country } from '@/lib/types';

export function cx(...c: unknown[]): string { return c.filter((x) => typeof x === "string" && x).join(" "); }

export function Card({ title, subtitle, icon: Icon, actions, children, padding = true, className = '', bodyClassName = '' }: {
  title?: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children?: ReactNode; padding?: boolean; className?: string; bodyClassName?: string;
}) {
  return (
    <div className={cx('card', className)}>
      {(title || actions) && (
        <div className={cx('flex flex-wrap items-center justify-between gap-3 px-5 pt-5', !padding && 'pb-4')}>
          <div className="flex items-center gap-2.5">
            {Icon && <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><Icon className="w-4 h-4" /></span>}
            <div>
              {title && <h3 className="card-title">{title}</h3>}
              {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(padding && 'p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, back, children }: { title: ReactNode; subtitle?: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-primary font-medium mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {back && <Link href={back} className="btn-outline"><ArrowLeft className="w-4 h-4" /> Back</Link>}
      </div>
    </div>
  );
}

const PILL: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200', amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200', purple: 'bg-violet-50 text-violet-700 border-violet-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200', red: 'bg-red-50 text-red-600 border-red-200', gray: 'bg-slate-100 text-slate-600 border-slate-200',
};
export function StatusPill({ status, label, className = '' }: { status: any; label?: ReactNode; className?: string }) {
  return <span className={cx('pill border', PILL[statusColor(status)], className)}>{label ?? statusLabel(status)}</span>;
}

const STAT_BG: Record<string, string> = { blue: 'bg-blue-500', green: 'bg-primary', orange: 'bg-amber-500', amber: 'bg-amber-500', red: 'bg-red-500', purple: 'bg-violet-500', cyan: 'bg-cyan-500', gray: 'bg-slate-500' };
export function StatCard({ label, value, icon: Icon, color = 'blue', href }: { label: ReactNode; value: ReactNode; icon: LucideIcon; color?: string; href?: string }) {
  const inner = (
    <>
      <span className={cx('w-10 h-10 shrink-0 rounded-xl text-white flex items-center justify-center', STAT_BG[color] || STAT_BG.blue)}><Icon className="w-5 h-5" /></span>
      <span className="min-w-0">
        <span className="block text-[13px] text-muted">{label}</span>
        <span className="block text-xl font-extrabold text-navy dark:text-white leading-tight truncate">{value}</span>
      </span>
    </>
  );
  const cls = 'card flex items-center gap-4 px-4 py-3.5 hover:shadow-card transition';
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

const TILE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-500', cyan: 'bg-cyan-50 text-cyan-600', teal: 'bg-teal-50 text-teal-600',
  purple: 'bg-violet-50 text-violet-500', pink: 'bg-pink-50 text-pink-500', orange: 'bg-orange-50 text-orange-500', amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-500', indigo: 'bg-indigo-50 text-indigo-500',
};
export function MetricCard({ label, value, icon: Icon, color = 'green', growth, suffix }: { label: ReactNode; value: ReactNode; icon: LucideIcon; color?: string; growth?: number | null; suffix?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center', TILE[color] || TILE.green)}><Icon className="w-5 h-5" /></span>
        {growth != null && isFinite(growth) && (
          <span className={cx('pill', growth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
            {growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{Math.abs(Math.round(growth))}%
          </span>
        )}
      </div>
      <div className="mt-4 text-[11.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-[22px] font-extrabold text-navy dark:text-white leading-tight">{value} {suffix && <span className="text-xs font-medium text-muted">{suffix}</span>}</div>
    </div>
  );
}

/** view / edit / delete icon buttons (delete calls onDelete — wrap it with useConfirm). */
export function RowActions({ view, edit, onDelete, children }: { view?: string; edit?: string; onDelete?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {children}
      {view && <Link href={view} className="icon-btn" title="View"><Eye className="w-4 h-4" /></Link>}
      {edit && <Link href={edit} className="icon-btn" title="Edit"><Pencil className="w-4 h-4" /></Link>}
      {onDelete && <button type="button" onClick={onDelete} className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}

export function Empty({ text = 'No records found.', icon: Icon = Inbox }: { text?: ReactNode; icon?: LucideIcon }) {
  return <div className="flex flex-col items-center gap-2 py-14 text-center text-muted"><Icon className="w-8 h-8 text-slate-300" />{text}</div>;
}

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) { return <Loader2 className={cx('animate-spin text-primary', className)} />; }
export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-muted"><Spinner />{text}</div>;
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-3 select-none', disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')}>
      <span role="switch" aria-checked={checked} className={cx('toggle mt-0.5', checked && 'toggle-on')} onClick={(e) => { e.preventDefault(); if (!disabled) onChange(!checked); }}><span className="toggle-dot" /></span>
      {(label || description) && (
        <span onClick={(e) => { e.preventDefault(); if (!disabled) onChange(!checked); }}>
          {label && <span className="block text-sm font-medium text-navy dark:text-slate-200">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div className={cx('flex flex-wrap border-b border-line dark:border-dark-line', className)}>
      {tabs.map((t) => <button key={t.key} type="button" className={cx('tab', value === t.key && 'tab-active')} onClick={() => onChange(t.key)}>{t.label}</button>)}
    </div>
  );
}

export function CountryFlag({ country, size = 'md' }: { country?: Pick<Country, 'flag' | 'iso2' | 'name'> | null; size?: 'sm' | 'md' }) {
  const flag = country?.flag || '';
  const isImage = flag && (flag.includes('/') || flag.includes('.'));
  const box = size === 'sm' ? 'w-6 h-4 text-base' : 'w-9 h-6 text-2xl';
  if (isImage) return <img src={imgUrl(flag)} alt={country?.iso2} className={cx(box, 'rounded-sm object-cover border border-line inline-block')} />;
  return <span className={cx(box, 'inline-flex items-center justify-center leading-none')} title={country?.name}>{flagEmoji(flag, country?.iso2)}</span>;
}

export function Avatar({ src, name, className = 'w-9 h-9' }: { src?: string | null; name?: string; className?: string }) {
  const url = src ? imgUrl(src) : `https://ui-avatars.com/api/?background=E6F4E9&color=0E9623&name=${encodeURIComponent(name || 'User')}`;
  return <img src={url} alt="" className={cx(className, 'rounded-full bg-primary-50 object-cover')} />;
}

/** Thumbnail with placeholder. */
export function Thumb({ src, alt = '', className = 'w-10 h-10' }: { src?: string | null; alt?: string; className?: string }) {
  return src
    ? <img src={imgUrl(src)} alt={alt} className={cx(className, 'rounded-lg object-cover bg-slate-50 border border-line dark:border-dark-line')} />
    : <span className={cx(className, 'rounded-lg bg-primary-50 text-primary flex items-center justify-center text-xs font-bold')}>{alt.slice(0, 2).toUpperCase()}</span>;
}

/** Key-value row used on detail pages. */
export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="flex justify-between gap-4 py-2 text-sm border-b border-line last:border-0 dark:border-dark-line"><span className="text-muted">{label}</span><span className="font-medium text-navy dark:text-slate-200 text-right">{children}</span></div>;
}

/** Shown when a page is not permitted for the current role. */
export function Forbidden() {
  return <div className="card p-10 text-center"><h2 className="text-lg font-bold text-navy dark:text-white">Access denied</h2><p className="text-muted mt-1">You don't have permission to view this page.</p></div>;
}
