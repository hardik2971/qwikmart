// Firestore query planner — keeps every query the panels send inside the composite indexes that are actually deployed
// (firebase/firestore.indexes.json, copied to ./firestoreIndexes.json by `npm run sync-indexes` / prebuild).
//
// Production Firestore rejects a query that needs a composite index which does not exist ("The query requires an index").
// The emulator never enforces indexes, so this is checked here instead: `plan()` returns the query that is sent to the
// server (always servable) plus the part that has to be applied client-side (dropped filters, range, sort, limit) on a
// bounded result set. Pure module (no Firebase imports) so it can be unit-tested with plain Node.
import INDEXES from './firestoreIndexes.json';

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
export interface QFilter { field: string; op: Op; value?: unknown; /** must stay server-side (security rules depend on it) */ required?: boolean }
export interface QOrder { field: string; dir: 'asc' | 'desc' }
export interface QSpec { collection: string; group?: boolean; filters: QFilter[]; orderBy: QOrder[]; limit?: number | null }
export interface QPlan {
  server: QSpec;
  /** applied in the browser after the server query (empty → server result is final) */
  client: { filters: QFilter[]; orderBy: QOrder[]; limit: number | null };
  /** true when the server query is exactly the requested one (cursor pagination / server counts are valid) */
  exact: boolean;
  /** server limit used when part of the query runs client-side */
  bound: number | null;
}

interface IndexField { fieldPath: string; order?: 'ASCENDING' | 'DESCENDING'; arrayConfig?: 'CONTAINS' }
interface CompositeIndex { collectionGroup: string; queryScope?: 'COLLECTION' | 'COLLECTION_GROUP'; fields: IndexField[] }
interface FieldOverride { collectionGroup: string; fieldPath: string; indexes: { order?: string; arrayConfig?: string; queryScope?: string }[] }
const REG = INDEXES as unknown as { indexes: CompositeIndex[]; fieldOverrides?: FieldOverride[] };

export const DEFAULT_BOUND = 1000;
const EQ_OPS: Op[] = ['==', 'in'];
const ARRAY_OPS: Op[] = ['array-contains', 'array-contains-any'];
const RANGE_OPS: Op[] = ['!=', '<', '<=', '>', '>=', 'not-in'];
const isEq = (f: QFilter) => EQ_OPS.includes(f.op);
const isArr = (f: QFilter) => ARRAY_OPS.includes(f.op);
const isRange = (f: QFilter) => RANGE_OPS.includes(f.op);
const isDocId = (field: string) => field === '__name__' || field === 'documentId';

/** Single-field index availability (automatic for collection scope unless a field override replaces it). */
function singleField(collection: string, group: boolean, field: string, kind: 'order' | 'array'): boolean {
  if (isDocId(field)) return true;
  const ov = (REG.fieldOverrides || []).find((o) => o.collectionGroup === collection && o.fieldPath === field);
  const scope = group ? 'COLLECTION_GROUP' : 'COLLECTION';
  if (!ov) return !group; // automatic single-field indexes exist for collection scope only
  return ov.indexes.some((i) => (i.queryScope || 'COLLECTION') === scope && (kind === 'array' ? i.arrayConfig === 'CONTAINS' : !!i.order));
}

/** Ordering implied by the query: range field first (Firestore requires it), then explicit orderBy. */
function effectiveOrder(spec: QSpec): QOrder[] | null {
  const ranges = spec.filters.filter(isRange);
  const rangeFields = [...new Set(ranges.map((r) => r.field))];
  if (rangeFields.length > 1) return null; // multiple inequality fields → not supported by this planner
  const order = spec.orderBy.filter((o) => !isDocId(o.field));
  if (rangeFields.length) {
    const rf = rangeFields[0];
    if (order.length && order[0].field !== rf) return null; // invalid in Firestore
    return order.length ? order : [{ field: rf, dir: 'asc' }];
  }
  return order;
}

/** Can Firestore serve this query with the deployed indexes? */
export function servable(spec: QSpec): boolean {
  const order = effectiveOrder(spec);
  if (!order) return false;
  const filters = spec.filters.filter((f) => !isDocId(f.field));
  // Firestore query validity: at most one array-contains(-any) clause; one disjunctive (in / array-contains-any / not-in) family
  if (filters.filter(isArr).length > 1) return false;
  if (filters.some((f) => f.op === 'array-contains-any') && filters.some((f) => f.op === 'in' || f.op === 'not-in')) return false;
  if (filters.filter((f) => f.op === 'not-in').length > 1 || (filters.some((f) => f.op === 'not-in') && filters.some((f) => f.op === '!='))) return false;
  const eqLike = filters.filter((f) => !isRange(f));
  const fields = new Set([...filters.map((f) => f.field), ...order.map((o) => o.field)]);
  const g = !!spec.group;
  const c = spec.collection;

  // --- no composite index needed
  if (!filters.length && order.length <= 1) return order.every((o) => singleField(c, g, o.field, 'order'));
  if (fields.size === 1) {
    const f = [...fields][0];
    return filters.every((x) => singleField(c, g, f, isArr(x) ? 'array' : 'order')) && (!order.length || singleField(c, g, f, 'order'));
  }
  if (!order.length && eqLike.length === filters.length && filters.every(isEq)) {
    // equality-only: index merge (zig-zag join) of single-field indexes
    return filters.every((f) => singleField(c, g, f.field, 'order'));
  }

  // --- composite index: equality/array fields (any order) followed by the ordering fields
  const scope = g ? 'COLLECTION_GROUP' : 'COLLECTION';
  const eqFields = eqLike.filter((f) => !order.some((o) => o.field === f.field));
  if (new Set(eqFields.map((f) => f.field)).size !== eqFields.length) return false;
  return REG.indexes.some((ix) => {
    if (ix.collectionGroup !== c || (ix.queryScope || 'COLLECTION') !== scope) return false;
    const fs = ix.fields.filter((f) => f.fieldPath !== '__name__');
    if (fs.length !== eqFields.length + order.length) return false;
    const head = fs.slice(0, eqFields.length);
    const tail = fs.slice(eqFields.length);
    const headOk = eqFields.every((f) => head.some((h) => h.fieldPath === f.field && (isArr(f) ? h.arrayConfig === 'CONTAINS' : !!h.order)));
    const tailOk = order.every((o, i) => tail[i].fieldPath === o.field && tail[i].order === (o.dir === 'asc' ? 'ASCENDING' : 'DESCENDING'));
    return headOk && tailOk;
  });
}

function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  const n = Math.min(items.length, 10);
  for (let m = (1 << n) - 1; m >= 0; m--) out.push(items.filter((_, i) => i < n && m & (1 << i)));
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Plan a query. When the requested query is servable it is sent as-is; otherwise the largest servable subset of the
 * (non-required) equality / array filters is sent with a bounded limit and the rest is applied client-side.
 */
export function plan(spec: QSpec, bound = DEFAULT_BOUND): QPlan {
  const lim = spec.limit ?? null;
  if (servable(spec)) return { server: spec, client: { filters: [], orderBy: [], limit: null }, exact: true, bound: null };

  const required = spec.filters.filter((f) => f.required);
  const optional = spec.filters.filter((f) => !f.required && !isRange(f));
  const ranges = spec.filters.filter((f) => !f.required && isRange(f));
  const requiredRanges = required.filter(isRange);

  type Cand = { filters: QFilter[]; orderBy: QOrder[]; score: number };
  const cands: Cand[] = [];
  for (const sub of subsets(optional)) {
    // keep range + ordering server-side when possible, else drop them
    const variants: { filters: QFilter[]; orderBy: QOrder[]; keep: number }[] = [
      { filters: [...required, ...sub, ...ranges], orderBy: spec.orderBy, keep: 2 },
      { filters: [...required, ...sub, ...ranges], orderBy: [], keep: 1 },
      { filters: [...required, ...sub], orderBy: requiredRanges.length ? spec.orderBy.filter((o) => requiredRanges.some((r) => r.field === o.field)) : [], keep: 0 },
    ];
    for (const v of variants) {
      const s: QSpec = { ...spec, filters: v.filters, orderBy: v.orderBy, limit: bound };
      if (servable(s)) cands.push({ filters: v.filters, orderBy: v.orderBy, score: sub.length * 10 + v.keep });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) {
    // last resort: required filters only (equality) — still the safest shape
    const server: QSpec = { ...spec, filters: required.filter((f) => !isRange(f)), orderBy: [], limit: bound };
    return { server, client: { filters: spec.filters.filter((f) => !server.filters.includes(f)), orderBy: spec.orderBy, limit: lim }, exact: false, bound };
  }
  const server: QSpec = { ...spec, filters: best.filters, orderBy: best.orderBy, limit: bound };
  const clientFilters = spec.filters.filter((f) => !best.filters.includes(f));
  const sameOrder = best.orderBy.length === spec.orderBy.length;
  return { server, client: { filters: clientFilters, orderBy: sameOrder && !clientFilters.length ? [] : spec.orderBy, limit: lim }, exact: false, bound };
}

// ---------- client-side evaluation ----------
const getPath = (row: any, path: string) => (isDocId(path) ? row?.id : path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row));
function cmpVal(v: any): any {
  if (v == null) return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v?.seconds === 'number' && typeof v?.nanoseconds === 'number') return v.seconds * 1000 + v.nanoseconds / 1e6;
  return v;
}
const eqv = (a: any, b: any) => cmpVal(a) === cmpVal(b);

export function matches(row: any, f: QFilter): boolean {
  const v = getPath(row, f.field);
  const x = f.value as any;
  switch (f.op) {
    case '==': return eqv(v, x) || (v === undefined && x === null);
    case '!=': return v !== undefined && !eqv(v, x);
    case '<': return v != null && cmpVal(v) < cmpVal(x);
    case '<=': return v != null && cmpVal(v) <= cmpVal(x);
    case '>': return v != null && cmpVal(v) > cmpVal(x);
    case '>=': return v != null && cmpVal(v) >= cmpVal(x);
    case 'in': return Array.isArray(x) && x.some((y) => eqv(v, y));
    case 'not-in': return v !== undefined && Array.isArray(x) && !x.some((y) => eqv(v, y));
    case 'array-contains': return Array.isArray(v) && v.some((y) => eqv(y, x));
    case 'array-contains-any': return Array.isArray(v) && Array.isArray(x) && v.some((y) => x.some((z) => eqv(y, z)));
    default: return true;
  }
}

export function applyClient<T>(rows: T[], client: QPlan['client']): T[] {
  let out = client.filters.length ? rows.filter((r) => client.filters.every((f) => matches(r, f))) : [...rows];
  if (client.orderBy.length) {
    out = out.filter((r) => client.orderBy.every((o) => getPath(r, o.field) !== undefined)); // orderBy excludes docs without the field
    out.sort((a, b) => {
      for (const o of client.orderBy) {
        const x = cmpVal(getPath(a, o.field)); const y = cmpVal(getPath(b, o.field));
        if (x === y) continue;
        const r = x == null ? -1 : y == null ? 1 : x > y ? 1 : -1;
        return o.dir === 'asc' ? r : -r;
      }
      return 0;
    });
  }
  return client.limit != null ? out.slice(0, client.limit) : out;
}
