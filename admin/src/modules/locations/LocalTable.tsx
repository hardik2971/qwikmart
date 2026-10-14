'use client';
// Client-side table for small collections (countries, zones, stores, roles, delivery boys…) that have no
// `search_keywords` — loads everything once, then filters / searches / sorts / paginates in memory.
// Same look as components/ui/DataTable.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cx, Empty, Spinner } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import type { Column } from '@/components/ui/DataTable';

export interface LocalFilter<T> {
  key: string; placeholder: string; options: { value: string; label: string }[];
  /** predicate; defaults to String(row[key]) === value */ test?: (row: T, v: string) => boolean;
  className?: string;
}

const sortVal = (v: any) => (v && typeof v === 'object' && typeof v.seconds === 'number' ? v.seconds : typeof v === 'string' ? v.toLowerCase() : v ?? '');

export function LocalTable<T extends { id: string }>({
  rows, loading, error, columns, filters = [], initialFilters = {}, search, searchText, defaultSort = null, pageSize: initial = 20,
  toolbar, filterExtra, renderBody, empty, onRefresh, rowClassName, testId,
}: {
  rows: T[]; loading?: boolean; error?: string | null; columns: Column<T>[]; filters?: LocalFilter<T>[]; initialFilters?: Record<string, string>;
  search?: string | boolean; searchText?: (row: T) => string; defaultSort?: { field: string; dir: 'asc' | 'desc' } | null; pageSize?: number;
  toolbar?: ReactNode; filterExtra?: ReactNode; renderBody?: (rows: T[]) => ReactNode; empty?: ReactNode; onRefresh?: () => void;
  rowClassName?: (row: T) => string; testId?: string;
}) {
  const [fv, setFv] = useState<Record<string, string>>(initialFilters);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [size, setSize] = useState(initial);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let list = rows;
    for (const f of filters) {
      const v = fv[f.key];
      if (!v) continue;
      list = list.filter((r) => (f.test ? f.test(r, v) : String((r as any)[f.key] ?? '') === v));
    }
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      list = list.filter((r) => {
        const hay = (searchText ? searchText(r) : Object.values(r).filter((x) => typeof x === 'string' || typeof x === 'number').join(' ')).toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    if (sort) {
      const { field, dir } = sort;
      list = [...list].sort((a: any, b: any) => {
        const x = sortVal(a[field]); const y = sortVal(b[field]);
        const n = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return n * (dir === 'asc' ? 1 : -1);
      });
    }
    return list;
  }, [rows, fv, q, sort, JSON.stringify(filters.map((f) => f.key))]);

  useEffect(() => { setPage(0); }, [fv, q, size, rows.length]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / size));
  const pageRows = filtered.slice(page * size, page * size + size);
  const toggleSort = (field: string) => setSort((s) => (s?.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));

  return (
    <div className="card overflow-hidden" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
        {filterExtra}
        {filters.map((f) => (
          <select key={f.key} value={fv[f.key] ?? ''} onChange={(e) => setFv((s) => ({ ...s, [f.key]: e.target.value }))} className={cx('input !w-auto !py-2 min-w-[150px]', f.className)}>
            <option value="">{f.placeholder}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {search && <SearchBox value={q} onChange={setQ} placeholder={typeof search === 'string' ? search : 'Search'} />}
          <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setFv(initialFilters); setQ(''); setSort(defaultSort); onRefresh?.(); }}>
            <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {renderBody ? (
        <div className="p-4">{loading && !rows.length ? <div className="py-14 flex justify-center"><Spinner /></div> : error ? <Empty text={error} /> : pageRows.length ? renderBody(pageRows) : <Empty text={empty} />}</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cx(c.align === 'right' && '!text-right', c.align === 'center' && '!text-center', c.className)}>
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.sort!)} className="inline-flex items-center gap-1 uppercase hover:text-primary">
                        {c.header}
                        {sort?.field === c.sort ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-60" />) : <ChevronsUpDown className="w-3 h-3 opacity-60" />}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr><td colSpan={columns.length} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
              ) : error ? (
                <tr><td colSpan={columns.length}><Empty text={error} /></td></tr>
              ) : !pageRows.length ? (
                <tr><td colSpan={columns.length}><Empty text={empty} /></td></tr>
              ) : pageRows.map((r, i) => (
                <tr key={r.id} className={rowClassName?.(r)}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                      {c.render ? c.render(r, i) : String((r as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line dark:border-dark-line text-sm">
        <div className="flex items-center gap-2 text-muted">
          <span>Per page</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="input !w-20 !py-1.5">
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="hidden sm:inline">Total Records : {filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">{filtered.length ? page * size + 1 : 0}–{page * size + pageRows.length} · Page {page + 1} of {lastPage}</span>
          <button type="button" className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} title="Previous"><ChevronLeft className="w-4 h-4" /></button>
          <span className="w-8 h-8 rounded-lg bg-primary text-white text-sm font-semibold flex items-center justify-center">{page + 1}</span>
          <button type="button" className="icon-btn" disabled={page + 1 >= lastPage} onClick={() => setPage((p) => p + 1)} title="Next"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

/** Load a whole (small) collection with react-query-like state; `reload()` refetches. */
export function useAll<T>(loader: () => Promise<T[]>, deps: any[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    loader().then((r) => { if (alive) setRows(r); }).catch((e: any) => {
      if (!alive) return;
      console.warn('[useAll]', e);
      setError(e?.code === 'permission-denied' ? 'You do not have permission to view these records.' : e?.code === 'failed-precondition' ? 'This filter combination needs a Firestore index (see README).' : e?.message || 'Failed to load');
      setRows([]);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, tick]);
  return { rows, loading, error, reload: () => setTick((t) => t + 1), setRows };
}

export const FULFILLMENT_OPTS = [{ value: 'both', label: 'Both' }, { value: 'quick', label: 'Quick' }, { value: 'ecommerce', label: 'eCommerce' }];
export const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
export const isActive = (s: any) => s === true || s === 'active' || s === 1 || s === '1';
