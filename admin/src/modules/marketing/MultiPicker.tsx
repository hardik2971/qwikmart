'use client';
// Searchable multi-select (checkbox list + selected chips) — replaces the Blade <select multiple> pickers.
import { useMemo, useState, type ReactNode } from 'react';
import { X, Search } from 'lucide-react';
import { cx } from '@/components/ui';

export interface PickOpt { value: string; label: string }

export function MultiPicker({ label, options, value, onChange, hint, loading, placeholder = 'Search…', maxHeight = 220 }: {
  label?: ReactNode; options: PickOpt[]; value: string[]; onChange: (v: string[]) => void; hint?: ReactNode; loading?: boolean; placeholder?: string; maxHeight?: number;
}) {
  const [q, setQ] = useState('');
  const map = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase() === s) : options;
  }, [options, q]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div>
      {label && <span className="label">{label}</span>}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="pill border border-primary/30 bg-primary-50 text-primary">
              {map.get(v) ?? `#${v}`}
              <button type="button" className="ml-0.5 hover:text-red-500" onClick={() => toggle(v)} aria-label="Remove"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button type="button" className="text-xs text-muted hover:text-red-500" onClick={() => onChange([])}>Clear</button>
        </div>
      )}
      <div className="rounded-lg border border-line dark:border-dark-line">
        <label className="relative block border-b border-line dark:border-dark-line">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full bg-transparent py-2 pl-9 pr-3 text-sm outline-none" />
        </label>
        <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight }}>
          {loading ? <p className="px-3 py-3 text-sm text-muted">Loading…</p> : !list.length ? <p className="px-3 py-3 text-sm text-muted">No options.</p> : list.map((o) => (
            <label key={o.value} className={cx('flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800', value.includes(o.value) && 'text-primary font-medium')}>
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="rounded border-line text-primary focus:ring-primary" />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
