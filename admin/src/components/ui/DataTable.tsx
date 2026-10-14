'use client';
// Reusable Firestore data table — port of components/table.blade.php + th + pagination.
// Server-side: equality filters (where ==), search (search_keywords array-contains first term; remaining terms filtered client-side),
// sort (orderBy; disabled while searching to avoid composite indexes), cursor pagination (limit + startAfter), total via count().
//
// <DataTable<Order>
//   path="orders" constraints={storeId ? [where('store_id','==',storeId)] : []} deps={[storeId]}
//   filters={[{ key:'status', placeholder:'All Statuses', options: STATUS_OPTIONS }]}
//   defaultSort={{ field:'created_at', dir:'desc' }} search="Search order #, customer"
//   columns={[{ key:'order_number', header:'Order', sort:'order_number', render: o => o.order_number }, ...]} />
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { countSpec, planSpec, runSpec, toSpec, where } from '@/lib/firestore';
import { servable, type QSpec } from '@/lib/queryPlan';
import { searchKey, searchTerms } from '@/lib/format';
import { cx, Empty, Spinner } from '.';
import { SearchBox } from '@/components/form/fields';

export interface Column<T> { key: string; header: ReactNode; render?: (row: T, index: number) => ReactNode; sort?: string; align?: 'left' | 'right' | 'center'; className?: string }
export interface FilterDef {
  key: string; placeholder: string; options: { value: string; label: string }[];
  /** field to compare (defaults to key) */ field?: string;
  /** custom constraints for a value (e.g. booleans, ranges) */ toConstraints?: (v: string) => QueryConstraint[];
  /** custom element instead of a select */ className?: string;
}
export interface DataTableProps<T> {
  path: string;
  group?: boolean;
  constraints?: QueryConstraint[];
  /** filters the planner may move client-side when no composite index covers them (UI filters); `constraints` always stay server-side */
  extraConstraints?: QueryConstraint[];
  deps?: any[];
  filters?: FilterDef[];
  initialFilters?: Record<string, string>;
  columns: Column<T>[];
  defaultSort?: { field: string; dir: 'asc' | 'desc' } | null;
  search?: boolean | string;
  searchField?: string;
  clientFilter?: (row: T, terms: string[]) => boolean;
  pageSize?: number;
  toolbar?: ReactNode;
  /** extra controls on the left of the filter bar */ filterExtra?: ReactNode;
  refreshKey?: any;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** custom body (cards/grid) instead of a table */ renderBody?: (rows: T[]) => ReactNode;
  onRows?: (rows: T[]) => void;
  className?: string;
  testId?: string;
}

export function DataTable<T extends { id: string }>(props: DataTableProps<T>) {
  const {
    path, group, constraints = [], extraConstraints = [], deps = [], filters = [], initialFilters = {}, columns, defaultSort = { field: 'created_at', dir: 'desc' },
    search, searchField = 'search_keywords', clientFilter, pageSize: initialSize = 20, toolbar, filterExtra, refreshKey, empty, rowClassName,
    onRowClick, renderBody, onRows, className = '', testId,
  } = props;
  const [fv, setFv] = useState<Record<string, string>>(initialFilters);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [size, setSize] = useState(initialSize);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const cursors = useRef<(DocumentSnapshot | null)[]>([]);
  const hasMore = useRef(false);

  useEffect(() => { const t = setTimeout(() => setDq(q.trim().toLowerCase()), 350); return () => clearTimeout(t); }, [q]);

  const terms = useMemo(() => searchTerms(dq), [dq]);
  const baseKey = JSON.stringify([path, group, fv, dq, sort, size, deps, refreshKey, tick]);

  // reset pagination when the query changes
  useEffect(() => { cursors.current = []; setPage(0); }, [JSON.stringify([path, fv, dq, sort, size, deps, refreshKey, tick])]);

  // Query spec: `constraints` (scope, e.g. store_id) must stay server-side; UI filters and search are optional for the
  // planner, which keeps the server query inside the deployed composite indexes (see lib/queryPlan.ts).
  const buildSpec = (): QSpec => {
    const base = toSpec(path, constraints, { group, eqRequired: true });
    const ui: QueryConstraint[] = [...extraConstraints];
    for (const f of filters) {
      const v = fv[f.key];
      if (v === undefined || v === '') continue;
      if (f.toConstraints) ui.push(...f.toConstraints(v));
      else ui.push(where(f.field || f.key, '==', v));
    }
    if (terms.length) ui.push(where(searchField, 'array-contains', searchKey(terms)));
    const extra = toSpec(path, ui, { group, eqRequired: false });
    return { ...base, filters: [...base.filters, ...extra.filters], orderBy: sort ? [{ field: sort.field, dir: sort.dir }] : base.orderBy, limit: null };
  };
  const clientCache = useRef<{ key: string; rows: T[]; truncated: boolean } | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const spec = buildSpec();
        const restFilter = (list: T[]) => (terms.length > 1 || clientFilter ? list.filter((r: any) => {
          if (clientFilter) return clientFilter(r, terms);
          const kw: string[] = r[searchField] || [];
          return terms.every((t) => kw.includes(t.slice(0, 15)));
        }) : list);
        let list: T[];
        if (servable({ ...spec, limit: size + 1 })) {
          // exact server query → cursor pagination + server count
          clientCache.current = null; setTruncated(false);
          if (page === 0) countSpec(path, spec).then((c) => alive && setTotal(c)).catch(() => alive && setTotal(null));
          const cur = page > 0 ? cursors.current[page - 1] : null;
          const p = planSpec({ ...spec, limit: size + 1 });
          const { rows: got, docs } = await runSpec<T>(path, p, cur);
          if (!alive) return;
          hasMore.current = docs.length > size;
          cursors.current[page] = (docs.slice(0, size).pop() as DocumentSnapshot | undefined) || null;
          list = restFilter(got.slice(0, size));
        } else {
          // not covered by a composite index → bounded server query, rest filtered / sorted / paginated in the browser
          const key = JSON.stringify([path, group, fv, dq, sort, deps, refreshKey, tick]);
          if (clientCache.current?.key !== key) {
            const p = planSpec(spec);
            const { rows: got, docs } = await runSpec<T>(path, p);
            if (!alive) return;
            clientCache.current = { key, rows: restFilter(got), truncated: p.bound != null && docs.length >= p.bound };
          }
          const all = clientCache.current.rows;
          setTruncated(clientCache.current.truncated);
          setTotal(all.length);
          hasMore.current = all.length > (page + 1) * size;
          list = all.slice(page * size, (page + 1) * size);
        }
        setRows(list);
        onRows?.(list);
      } catch (e: any) {
        if (!alive) return;
        console.warn('[DataTable]', path, e);
        setError(e?.code === 'permission-denied' ? 'You do not have permission to view these records.' : e?.code === 'failed-precondition' ? 'This filter combination needs a Firestore index (see README).' : e?.message || 'Failed to load');
        setRows([]);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [baseKey, page]);

  const toggleSort = (field: string) => setSort((s) => (s?.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
  const from = rows.length ? page * size + 1 : 0;
  const to = page * size + rows.length;
  const lastPage = total != null ? Math.max(1, Math.ceil(total / size)) : null;

  return (
    <div className={cx('card overflow-hidden', className)} data-testid={testId}>
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
          <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setFv(initialFilters); setQ(''); setSort(defaultSort); setTick((t) => t + 1); }}>
            <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {renderBody ? (
        <div className="p-4">{loading && !rows.length ? <div className="py-14 flex justify-center"><Spinner /></div> : error ? <Empty text={error} /> : rows.length ? renderBody(rows) : <Empty text={empty} />}</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin relative">
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
              ) : !rows.length ? (
                <tr><td colSpan={columns.length}><Empty text={empty} /></td></tr>
              ) : rows.map((r, i) => (
                <tr key={(r as any)._path || r.id} className={cx(rowClassName?.(r), onRowClick && 'cursor-pointer', loading && 'opacity-60')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
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
          <span className="hidden sm:inline">Total Records : {total ?? '…'}{truncated ? '+' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">{from}–{to}{lastPage ? ` · Page ${page + 1} of ${lastPage}` : ''}</span>
          <button type="button" className="icon-btn" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} title="Previous"><ChevronLeft className="w-4 h-4" /></button>
          <span className="w-8 h-8 rounded-lg bg-primary text-white text-sm font-semibold flex items-center justify-center">{page + 1}</span>
          <button type="button" className="icon-btn" disabled={!hasMore.current || loading} onClick={() => setPage((p) => p + 1)} title="Next"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

/** Helper to build select options from docs. */
export const opts = <T,>(list: T[] | undefined, label: (t: T) => string, value: (t: T) => string = (t: any) => t.id) =>
  (list || []).map((t) => ({ value: value(t), label: label(t) }));
