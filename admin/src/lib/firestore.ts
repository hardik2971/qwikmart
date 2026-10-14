'use client';
// Firestore data helpers shared by every module.
//  - fetchDoc / fetchList  — one-off reads (wrapped by react-query hooks below)
//  - useDocQ / useListQ    — cached reads with react-query (invalidate with invalidate(key))
//  - useLiveDoc / useLiveList — realtime onSnapshot subscriptions
//  - saveDoc / patchDoc / removeDoc — writes that stamp created_at / updated_at
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, documentId, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc,
  where as fsWhere, orderBy as fsOrderBy, limit as fsLimit, startAfter, writeBatch, getCountFromServer, getAggregateFromServer, sum as fsSum, average as fsAverage,
  type DocumentData, type DocumentSnapshot, type Query, type QueryConstraint, type WhereFilterOp, type FieldPath,
} from 'firebase/firestore';
import { applyClient, plan, servable, DEFAULT_BOUND, type Op, type QFilter, type QOrder, type QPlan, type QSpec } from './queryPlan';
import { db } from './firebase';
import type { Attribute, Brand, Category, Country, Language, RoleDoc, Store, Tax, Zone } from './types';

export { serverTimestamp };

// ---------- planned queries ----------
// Every query the panels issue is built from these tagged constraints and goes through the planner (./queryPlan.ts), which
// keeps the server query inside the deployed composite indexes (firebase/firestore.indexes.json) and applies the rest
// client-side on a bounded result. Modules must not import where / orderBy / limit / query / getDocs / getCountFromServer /
// onSnapshot-on-queries from 'firebase/firestore' (checked by the QA index-coverage script).
const META = '__sbq';
type Meta = { k: 'where'; field: string; op: Op; value: unknown; required?: boolean } | { k: 'orderBy'; field: string; dir: 'asc' | 'desc' } | { k: 'limit'; n: number };
const meta = (c: QueryConstraint): Meta | undefined => (c as any)[META];
const tag = <C extends QueryConstraint>(c: C, m: Meta): C => { Object.defineProperty(c, META, { value: m, enumerable: false }); return c; };

export function where(field: string | FieldPath, op: WhereFilterOp, value: unknown): QueryConstraint {
  return tag(fsWhere(field as any, op, value), { k: 'where', field: typeof field === 'string' ? field : '__name__', op: op as Op, value });
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return tag(fsOrderBy(field, dir), { k: 'orderBy', field, dir });
}
export function limit(n: number): QueryConstraint { return tag(fsLimit(n), { k: 'limit', n }); }
/** Mark a filter as required server-side (security-rules scope such as store_id for store users). */
export function required(c: QueryConstraint): QueryConstraint { const m = meta(c); if (m?.k === 'where') m.required = true; return c; }

const RANGE: string[] = ['<', '<=', '>', '>=', '!=', 'not-in'];
const collectionId = (path: string) => path.split('/').filter(Boolean).pop() || path;

/**
 * Tagged constraints → planner spec. With `eqRequired` (default) equality / array filters must stay server-side
 * (only range filters, ordering and limits may move client-side); DataTable passes false for its optional UI filters.
 */
export function toSpec(path: string, constraints: QueryConstraint[], opts: { group?: boolean; eqRequired?: boolean } = {}): QSpec {
  const filters: QFilter[] = []; const order: QOrder[] = []; let lim: number | null = null;
  for (const c of constraints) {
    const m = meta(c);
    if (!m) throw new Error(`[firestore] untagged query constraint on ${path} — import where/orderBy/limit from @/lib/firestore`);
    if (m.k === 'where') filters.push({ field: m.field, op: m.op, value: m.value, required: !!m.required || (opts.eqRequired !== false && !RANGE.includes(m.op)) });
    else if (m.k === 'orderBy') order.push({ field: m.field, dir: m.dir });
    else lim = m.n;
  }
  return { collection: collectionId(path), group: !!opts.group, filters, orderBy: order, limit: lim };
}

function source(path: string, group?: boolean) { return group ? collectionGroup(db(), path) : collection(db(), path); }
/** Firestore query for the server part of a plan (optionally after a cursor). */
export function serverQuery(path: string, spec: QSpec, cursor?: DocumentSnapshot | null): Query {
  const cs: QueryConstraint[] = [
    ...spec.filters.map((f) => fsWhere(f.field === '__name__' ? documentId() : f.field, f.op as WhereFilterOp, f.value)),
    ...spec.orderBy.map((o) => fsOrderBy(o.field, o.dir)),
    ...(cursor ? [startAfter(cursor)] : []),
    ...(spec.limit != null ? [fsLimit(spec.limit)] : []),
  ];
  return query(source(path, spec.group), ...cs);
}

export function planQuery(path: string, constraints: QueryConstraint[], opts: { group?: boolean; eqRequired?: boolean; bound?: number } = {}): QPlan {
  return plan(toSpec(path, constraints, opts), opts.bound ?? DEFAULT_BOUND);
}
export function planSpec(spec: QSpec, bound = DEFAULT_BOUND): QPlan { return plan(spec, bound); }
const rowOf = <T,>(d: { id: string; data: () => DocumentData | undefined; ref: { path: string } }, group?: boolean): T =>
  (group ? ({ ...withId<T>(d), _path: d.ref.path } as T) : withId<T>(d));
export { applyClient, rowOf };

/** Run a planned query once. */
export async function runQuery<T>(path: string, constraints: QueryConstraint[], opts: { group?: boolean; bound?: number; eqRequired?: boolean } = {}): Promise<T[]> {
  assertRead(path);
  const p = planQuery(path, constraints, opts);
  const s = await getDocs(serverQuery(path, p.server));
  const rows = s.docs.map((d) => rowOf<T>(d, opts.group));
  return p.exact ? rows : applyClient(rows, p.client);
}
/** Run an already-built spec (DataTable). */
export async function runSpec<T>(path: string, p: QPlan, cursor?: DocumentSnapshot | null): Promise<{ rows: T[]; docs: DocumentSnapshot[] }> {
  assertRead(path);
  const s = await getDocs(serverQuery(path, p.server, cursor));
  const rows = s.docs.map((d) => rowOf<T>(d, p.server.group));
  return { rows: p.exact ? rows : applyClient(rows, p.client), docs: s.docs };
}

/** count() that never needs a missing index (falls back to counting a bounded client-side result). */
export async function countDocs(path: string, constraints: QueryConstraint[] = [], opts: { group?: boolean } = {}): Promise<number> {
  const spec = toSpec(path, constraints, opts);
  return countSpec(path, spec);
}
export async function countSpec(path: string, spec: QSpec): Promise<number> {
  assertRead(path);
  const cspec: QSpec = { ...spec, orderBy: [], limit: null };
  if (servable(cspec)) return (await getCountFromServer(serverQuery(path, cspec))).data().count;
  const p = plan(cspec);
  const s = await getDocs(serverQuery(path, p.server));
  return applyClient(s.docs.map((d) => rowOf<any>(d, spec.group)), p.client).length;
}
/** sum / average aggregates with the same fallback. Always returns `count` too. */
export async function aggregateDocs(path: string, constraints: QueryConstraint[], fields: { sum?: Record<string, string>; avg?: Record<string, string> }, opts: { group?: boolean } = {}): Promise<Record<string, number> & { count: number }> {
  assertRead(path);
  const spec = toSpec(path, constraints, opts);
  const cspec: QSpec = { ...spec, orderBy: [], limit: null };
  if (servable(cspec)) {
    const aggSpec: Record<string, any> = {};
    for (const [k, f] of Object.entries(fields.sum || {})) aggSpec[k] = fsSum(f);
    for (const [k, f] of Object.entries(fields.avg || {})) aggSpec[k] = fsAverage(f);
    const [agg, cnt] = await Promise.all([Object.keys(aggSpec).length ? getAggregateFromServer(serverQuery(path, cspec), aggSpec) : null, getCountFromServer(serverQuery(path, cspec))]);
    const out: any = { count: cnt.data().count };
    for (const k of Object.keys(aggSpec)) out[k] = Number((agg?.data() as any)?.[k] || 0);
    return out;
  }
  const p = plan(cspec);
  const s = await getDocs(serverQuery(path, p.server));
  const rows = applyClient(s.docs.map((d) => rowOf<any>(d, spec.group)), p.client);
  const val = (r: any, f: string) => f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), r);
  const out: any = { count: rows.length };
  for (const [k, f] of Object.entries(fields.sum || {})) out[k] = rows.reduce((a, r) => a + Number(val(r, f) || 0), 0);
  for (const [k, f] of Object.entries(fields.avg || {})) { const vs = rows.map((r) => val(r, f)).filter((v) => typeof v === 'number') as number[]; out[k] = vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : 0; }
  return out;
}

export function withId<T>(s: { id: string; data: () => DocumentData | undefined }): T {
  return { id: s.id, ...(s.data() as any) } as T;
}

export function col(path: string) { return collection(db(), path); }
/** Doc reference; without an id → a new auto-id doc in that collection. */
export function ref(path: string, id?: string) { return id ? doc(db(), path, id) : doc(collection(db(), path)); }

// ---------- read policy ----------
// Mirrors firestore.rules for the signed-in panel user so the app never sends reads the rules deny (no 403 noise, no
// broken widgets): set by PanelProvider from the custom claims / role permissions.
export type ReadPolicy = (path: string, id?: string) => boolean;
let readPolicy: ReadPolicy = () => true;
export function setReadPolicy(fn: ReadPolicy) { readPolicy = fn; }
export function canRead(path: string, id?: string) { return readPolicy(path, id); }
class ReadDenied extends Error { code = 'permission-denied'; constructor(path: string) { super(`Not permitted to read ${path}`); } }
function assertRead(path: string) { if (!readPolicy(path)) throw new ReadDenied(path); }

export async function fetchDoc<T>(path: string, id: string): Promise<T | null> {
  if (!readPolicy(path, id)) return null;
  const s = await getDoc(doc(db(), path, id));
  return s.exists() ? withId<T>(s) : null;
}
export async function fetchList<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  return runQuery<T>(path, constraints);
}
export async function fetchGroup<T>(group: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  return runQuery<T>(group, constraints, { group: true });
}
/** Fetch docs by id (chunks of 30 via `in` on documentId would need FieldPath; plain gets are fine for small sets). */
export async function fetchByIds<T>(path: string, ids: string[]): Promise<T[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const res = await Promise.all(uniq.map((id) => fetchDoc<T>(path, id)));
  return res.filter(Boolean) as T[];
}

/** Strip undefined values (Firestore rejects them). */
const isPlain = (v: any) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
export function clean<T>(o: T): T {
  if (Array.isArray(o)) return o.filter((v) => v !== undefined).map((v) => (isPlain(v) || Array.isArray(v) ? clean(v) : v)) as any;
  if (!isPlain(o)) return o;
  const out: any = {};
  for (const [k, v] of Object.entries(o as any)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) || Array.isArray(v) ? clean(v) : v;
  }
  return out;
}

/** Create (id null → auto id) or overwrite/merge a doc. Returns the id. */
export async function saveDoc(path: string, id: string | null | undefined, data: Record<string, any>, opts: { merge?: boolean } = { merge: true }): Promise<string> {
  const payload = clean({ ...data, updated_at: serverTimestamp() });
  if (!id) {
    const r = await addDoc(collection(db(), path), { ...payload, created_at: serverTimestamp() });
    return r.id;
  }
  const r = doc(db(), path, id);
  if (opts.merge) {
    const exists = (await getDoc(r)).exists();
    await setDoc(r, exists ? payload : { ...payload, created_at: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(r, { ...payload, created_at: data.created_at ?? serverTimestamp() });
  }
  return id;
}
export async function patchDoc(path: string, id: string, data: Record<string, any>) {
  await updateDoc(doc(db(), path, id), clean({ ...data, updated_at: serverTimestamp() }));
}
export async function removeDoc(path: string, id: string) { await deleteDoc(doc(db(), path, id)); }
export async function batchUpdate(updates: { path: string; id: string; data: Record<string, any> }[]) {
  for (let i = 0; i < updates.length; i += 400) {
    const b = writeBatch(db());
    for (const u of updates.slice(i, i + 400)) b.update(doc(db(), u.path, u.id), clean({ ...u.data, updated_at: serverTimestamp() }));
    await b.commit();
  }
}

// ---------- react-query wrappers ----------
export function useDocQ<T>(path: string, id: string | null | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['doc', path, id], queryFn: () => fetchDoc<T>(path, id as string), enabled: !!id && opts.enabled !== false });
}
export function useListQ<T>(key: QueryKey, path: string, constraints: QueryConstraint[] = [], opts: { enabled?: boolean; staleTime?: number } = {}) {
  return useQuery({ queryKey: ['list', path, ...(key as any[])], queryFn: () => fetchList<T>(path, ...constraints), enabled: opts.enabled !== false, staleTime: opts.staleTime });
}
export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefix: any[]) => qc.invalidateQueries({ queryKey: prefix.length ? prefix : undefined });
}

// ---------- realtime ----------
export function useLiveDoc<T>(path: string, id: string | null | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id || !readPolicy(path, id)) { setData(null); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(doc(db(), path, id), (s) => { setData(s.exists() ? withId<T>(s) : null); setLoading(false); }, () => setLoading(false));
  }, [path, id]);
  return { data, loading };
}
export interface LiveQuery { path: string; constraints: QueryConstraint[]; group?: boolean }
export function useLiveQuery<T>(lq: LiveQuery | null, deps: any[]) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!lq) { setData([]); setLoading(false); return; }
    if (!readPolicy(lq.path)) { setData([]); setLoading(false); setError(new ReadDenied(lq.path)); return; }
    setLoading(true);
    const p = planQuery(lq.path, lq.constraints, { group: lq.group });
    return onSnapshot(serverQuery(lq.path, p.server), (s) => {
      const rows = s.docs.map((d) => rowOf<T>(d, lq.group));
      setData(p.exact ? rows : applyClient(rows, p.client)); setLoading(false); setError(null);
    }, (e) => { setError(e); setLoading(false); });
  }, deps);
  return { data, loading, error };
}
/** Live query descriptor for useLiveQuery (planned like every other query). */
export function q(path: string, ...constraints: QueryConstraint[]): LiveQuery { return { path, constraints }; }

// ---------- shared lookups (cached 5 min) ----------
const LOOKUP = { staleTime: 5 * 60 * 1000 };
export const useCountries = () => useQuery({ queryKey: ['lookup', 'countries'], queryFn: () => fetchList<Country>('countries'), ...LOOKUP, select: (r) => [...r].sort((a, b) => a.name.localeCompare(b.name)) });
export const useZones = () => useQuery({ queryKey: ['lookup', 'zones'], queryFn: () => fetchList<Zone>('zones'), ...LOOKUP, select: (r) => [...r].sort((a, b) => a.name.localeCompare(b.name)) });
export const useStores = () => useQuery({ queryKey: ['lookup', 'stores'], queryFn: () => fetchList<Store>('stores'), ...LOOKUP, select: (r) => [...r].sort((a, b) => a.name.localeCompare(b.name)) });
export const useCategories = () => useQuery({ queryKey: ['lookup', 'categories'], queryFn: () => fetchList<Category>('categories'), ...LOOKUP, select: (r) => [...r].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) });
export const useBrands = () => useQuery({ queryKey: ['lookup', 'brands'], queryFn: () => fetchList<Brand>('brands'), ...LOOKUP, select: (r) => [...r].sort((a, b) => a.name.localeCompare(b.name)) });
export const useTaxes = () => useQuery({ queryKey: ['lookup', 'taxes'], queryFn: () => fetchList<Tax>('taxes'), ...LOOKUP });
export const useAttributes = () => useQuery({ queryKey: ['lookup', 'attributes'], queryFn: () => fetchList<Attribute>('attributes'), ...LOOKUP });
export const useLanguages = () => useQuery({ queryKey: ['lookup', 'languages'], queryFn: () => fetchList<Language>('languages'), ...LOOKUP });
export const useRoles = (scope?: 'admin' | 'store', storeId?: string | null) => useQuery({
  queryKey: ['lookup', 'roles', scope, storeId],
  queryFn: () => fetchList<RoleDoc>('roles', ...(scope ? [where('scope', '==', scope)] : []), ...(storeId ? [where('store_id', '==', storeId)] : [])),
  ...LOOKUP,
});
