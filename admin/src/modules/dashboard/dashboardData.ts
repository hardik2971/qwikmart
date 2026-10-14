'use client';
// Data layer for the admin / store dashboard (port of Admin\DashboardController).
// Aggregates come from `stats_daily/{scope}_{yyyy-mm-dd}` docs (written by the onOrderWritten trigger, dates in Asia/Kolkata);
// counters use getCountFromServer; "top N" lists use orderBy on the counters maintained by triggers.
import { useQuery } from '@tanstack/react-query';
import { Timestamp, type QueryConstraint } from 'firebase/firestore';
import { countDocs, fetchByIds, fetchList, where, orderBy, limit } from '@/lib/firestore';
import type { Order, Product, StatsDaily, Store, StoreStock, UserDoc, Zone } from '@/lib/types';

export type RangeKey = 'today' | 'week' | 'month' | 'year' | 'custom';
export const RANGE_LABELS: Record<RangeKey, string> = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', custom: 'Custom' };

const TZ = 'Asia/Kolkata';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- IST calendar-date helpers (dates are UTC-midnight Date objects standing for an IST calendar day) ----
export function istToday(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parseDay(s);
}
export function parseDay(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); }
export function dayStr(d: Date): string { return d.toISOString().slice(0, 10); }
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
/** IST midnight of a calendar day as an instant (for Timestamp queries). */
export function istStart(day: string): Date { return new Date(`${day}T00:00:00+05:30`); }
export function istEnd(day: string): Date { return new Date(`${day}T23:59:59.999+05:30`); }

export interface Range { key: RangeKey; from: string; to: string; prevFrom: string; prevTo: string; days: number }
export function computeRange(key: RangeKey, customFrom?: string, customTo?: string): Range {
  const t = istToday();
  let a: Date; let b: Date;
  switch (key) {
    case 'today': a = t; b = t; break;
    case 'week': { const dow = (t.getUTCDay() + 6) % 7; a = addDays(t, -dow); b = addDays(a, 6); break; } // Monday..Sunday
    case 'month': a = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)); b = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)); break;
    case 'custom': a = customFrom ? parseDay(customFrom) : addDays(t, -30); b = customTo ? parseDay(customTo) : t; break;
    default: a = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); b = new Date(Date.UTC(t.getUTCFullYear(), 11, 31));
  }
  if (a > b) [a, b] = [b, a];
  const days = diffDays(a, b) + 1;
  const prevTo = addDays(a, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { key, from: dayStr(a), to: dayStr(b), prevFrom: dayStr(prevFrom), prevTo: dayStr(prevTo), days };
}

// ---- aggregation ----
export interface Agg {
  orders: number; revenue: number; delivery_charges: number; tax: number; units: number; cancelled: number; returned: number;
  by_status: Record<string, number>; by_mode: Record<string, { orders: number; revenue: number }>;
  by_category: Record<string, { revenue: number; units: number }>;
}
const n = (v: any) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
export function aggregate(docs: StatsDaily[]): Agg {
  const a: Agg = { orders: 0, revenue: 0, delivery_charges: 0, tax: 0, units: 0, cancelled: 0, returned: 0, by_status: {}, by_mode: {}, by_category: {} };
  for (const d of docs) {
    a.orders += n(d.orders); a.revenue += n(d.revenue); a.delivery_charges += n(d.delivery_charges); a.tax += n(d.tax);
    a.units += n(d.units); a.cancelled += n(d.cancelled); a.returned += n(d.returned);
    for (const [k, v] of Object.entries(d.by_status || {})) a.by_status[k] = (a.by_status[k] || 0) + n(v);
    for (const [k, v] of Object.entries(d.by_mode || {})) {
      const m = (a.by_mode[k] ||= { orders: 0, revenue: 0 }); m.orders += n(v?.orders); m.revenue += n(v?.revenue);
    }
    for (const [k, v] of Object.entries(d.by_category || {})) {
      const c = (a.by_category[k] ||= { revenue: 0, units: 0 }); c.revenue += n(v?.revenue); c.units += n(v?.units);
    }
  }
  return a;
}

export function growth(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export interface Trend { labels: string[]; revenue: number[]; orders: number[] }
export function buildTrend(docs: StatsDaily[], r: Range): Trend {
  const labels: string[] = []; const keys: string[] = [];
  const rev: Record<string, number> = {}; const cnt: Record<string, number> = {};
  if (r.key === 'today') {
    for (let h = 0; h < 24; h++) { keys.push(String(h)); labels.push(`${String(h).padStart(2, '0')}:00`); }
    for (const d of docs) for (const [h, v] of Object.entries(d.by_hour || {})) {
      const k = String(Number(h)); rev[k] = (rev[k] || 0) + n(v?.revenue); cnt[k] = (cnt[k] || 0) + n(v?.orders);
    }
  } else if (r.key === 'year' || r.days > 92) {
    const a = parseDay(r.from); const b = parseDay(r.to);
    let y = a.getUTCFullYear(); let m = a.getUTCMonth();
    while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
      keys.push(`${y}-${String(m + 1).padStart(2, '0')}`); labels.push(`${MON[m]} ${String(y).slice(2)}`);
      m++; if (m > 11) { m = 0; y++; }
    }
    for (const d of docs) { const k = String(d.date || '').slice(0, 7); rev[k] = (rev[k] || 0) + n(d.revenue); cnt[k] = (cnt[k] || 0) + n(d.orders); }
  } else {
    for (let d = parseDay(r.from); d <= parseDay(r.to); d = addDays(d, 1)) {
      keys.push(dayStr(d)); labels.push(`${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]}`);
    }
    for (const d of docs) { const k = String(d.date || ''); rev[k] = (rev[k] || 0) + n(d.revenue); cnt[k] = (cnt[k] || 0) + n(d.orders); }
  }
  return { labels, revenue: keys.map((k) => Math.round((rev[k] || 0) * 100) / 100), orders: keys.map((k) => cnt[k] || 0) };
}

// ---- fetchers ----
/** stats_daily docs for the given scopes and date range (scopes chunked by 30 for `in`). */
export async function fetchStats(scopes: string[], from: string, to: string): Promise<StatsDaily[]> {
  if (!scopes.length) return [];
  const out: StatsDaily[] = [];
  for (let i = 0; i < scopes.length; i += 30) {
    const chunk = scopes.slice(i, i + 30);
    const scopeC = chunk.length === 1 ? where('scope', '==', chunk[0]) : where('scope', 'in', chunk);
    out.push(...(await fetchList<StatsDaily>('stats_daily', scopeC, where('date', '>=', from), where('date', '<=', to))));
  }
  return out;
}

async function count(path: string, ...c: QueryConstraint[]): Promise<number> {
  try { return await countDocs(path, c); } catch { return 0; }
}
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> { try { return await p; } catch (e) { console.warn('[dashboard]', e); return fallback; } }

export interface DashFilter { storeId: string | null; countryId: string; zoneId: string; zones: Zone[]; /** permission check — widgets the role cannot read are skipped (no 403s) */ can?: (perm: string) => boolean }

export function scopesFor(f: DashFilter): string[] {
  if (f.storeId) return [`store_${f.storeId}`];
  if (f.zoneId) return [`zone_${f.zoneId}`];
  if (f.countryId) return f.zones.filter((z) => z.country_id === f.countryId).map((z) => `zone_${z.id}`);
  return ['all'];
}

export interface InventoryRow { key: string; product_id: string; name: string; variant: string; sku?: string; stock: number; thumb?: string }
export interface DashboardData {
  cur: Agg; prev: Agg; today: Agg; trend: Trend; todayReturns: number;
  counts: { customers: number | null; products: number; stores: number; coupons: number; riders: number };
  rangeCustomers: number | null;
  topStores: Store[]; topProducts: Product[]; topCustomers: { id: string; name: string; phone?: string; orders: number; spent: number }[];
  inventory: { total: number; in: number; low: number; out: number }; lowStock: InventoryRow[];
  recent: Order[];
}

const zero = aggregate([]);

export function useDashboard(f: DashFilter, r: Range, enabled: boolean) {
  const scopes = scopesFor(f);
  return useQuery({
    queryKey: ['dashboard', f.storeId, f.countryId, f.zoneId, scopes.join(','), r.from, r.to],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardData> => {
      const todayStr = dayStr(istToday());
      const store = f.storeId;
      const can = (perm: string) => (f.can ? f.can(perm) : true);
      const geo: QueryConstraint[] = store ? [] : f.zoneId ? [where('zone_id', '==', f.zoneId)] : f.countryId ? [where('country_id', '==', f.countryId)] : [];

      const [curDocs, prevDocs, todayDocs] = await Promise.all([
        safe(fetchStats(scopes, r.from, r.to), []),
        safe(fetchStats(scopes, r.prevFrom, r.prevTo), []),
        safe(fetchStats(scopes, todayStr, todayStr), []),
      ]);

      // Today returns (return_requests created today)
      const todayStart = Timestamp.fromDate(istStart(todayStr));
      const todayReturns = !can('return.list') ? 0 : await count('return_requests', ...(store ? [where('store_id', '==', store)] : []), where('created_at', '>=', todayStart));

      // Counters
      let storeZone: string | null = null;
      if (store) storeZone = (await safe(fetchByIds<Store>('stores', [store]), []))[0]?.zone_id || null;
      const [customers, products, stores, coupons, riders] = await Promise.all([
        store || !can('customer.list') ? Promise.resolve(null) : count('users', where('type', '==', 'customer'), where('status', '==', 'active')),
        store ? count('products', where('in_stock_store_ids', 'array-contains', store), where('status', '==', 'active')) : count('products', where('status', '==', 'active')),
        store ? Promise.resolve(1) : count('stores', where('status', '==', 'active'), ...(f.countryId ? [where('country_id', '==', f.countryId)] : [])),
        !can('promo_code.list') ? Promise.resolve(0) : count('promo_codes', where('status', '==', 'active'), ...(store ? [where('store_id', '==', store)] : [])),
        !can('delivery_boy.list') ? Promise.resolve(0) : count('delivery_boys', where('approval_status', '==', 'approved'), where('status', '==', 'active'),
          ...(store ? (storeZone ? [where('zone_id', '==', storeZone)] : []) : [...(f.countryId ? [where('country_id', '==', f.countryId)] : []), ...(f.zoneId ? [where('zone_id', '==', f.zoneId)] : [])])),
      ]);

      // Top lists
      const topStores = store ? [] : await safe(fetchList<Store>('stores', ...geo, orderBy('revenue', 'desc'), limit(5)), []);
      const rated = await safe(fetchList<Product>('products', where('status', '==', 'active'), orderBy('rating_avg', 'desc'), limit(store ? 30 : 10)), []);
      const topProducts = rated.filter((p) => n(p.rating_count) > 0 && (!store || !p.store_id || p.store_id === store)).slice(0, 5);

      let topCustomers: DashboardData['topCustomers'] = [];
      let rangeCustomers: number | null = null;
      if (store) {
        // Store panel: aggregate the store's orders in the range (users collection is not readable by store users).
        const orders = await safe(fetchList<Order>('orders', where('store_id', '==', store),
          where('created_at', '>=', Timestamp.fromDate(istStart(r.from))), where('created_at', '<=', Timestamp.fromDate(istEnd(r.to))),
          orderBy('created_at', 'desc'), limit(500)), []);
        const by: Record<string, { id: string; name: string; phone?: string; orders: number; spent: number }> = {};
        for (const o of orders) {
          if (!o.user_id || o.status === 'payment_pending') continue;
          const row = (by[o.user_id] ||= { id: o.user_id, name: o.customer?.name || 'Customer', phone: o.customer?.phone, orders: 0, spent: 0 });
          row.orders++;
          if (!['cancelled', 'returned'].includes(o.status)) row.spent += n(o.totals?.grand_total ?? o.totals?.total);
        }
        rangeCustomers = Object.keys(by).length;
        topCustomers = Object.values(by).sort((a, b) => b.orders - a.orders || b.spent - a.spent).slice(0, 5);
      } else if (can('customer.list')) {
        const users = await safe(fetchList<UserDoc>('users', where('type', '==', 'customer'), orderBy('total_spent', 'desc'), limit(5)), []);
        topCustomers = users.map((u) => ({ id: u.id, name: u.name || 'Customer', phone: u.phone, orders: n(u.orders_count), spent: n(u.total_spent) }));
      }

      // Inventory health
      const inventory = { total: 0, in: 0, low: 0, out: 0 };
      let lowRows: InventoryRow[] = [];
      if (store) {
        const stocks = await safe(fetchList<StoreStock>('store_stocks', where('store_id', '==', store), limit(3000)), []);
        const lows: StoreStock[] = [];
        for (const s of stocks) {
          const st = n(s.stock); const alert = n(s.low_stock_alert);
          inventory.total++;
          if (st <= 0) inventory.out++; else if (st <= alert) inventory.low++; else inventory.in++;
          if (st <= alert) lows.push(s);
        }
        lows.sort((a, b) => n(a.stock) - n(b.stock));
        const top = lows.slice(0, 6);
        const prods = await safe(fetchByIds<Product>('products', top.map((s) => s.product_id)), []);
        lowRows = top.map((s) => {
          const p = prods.find((x) => x.id === s.product_id); const v = p?.variants?.find((x) => x.id === s.variant_id);
          return { key: s.id, product_id: s.product_id, name: p ? (p.name?.en || Object.values(p.name || {})[0] || 'Product') : 'Product', variant: v?.name || '', sku: v?.sku, stock: n(s.stock), thumb: p?.thumbnail || p?.images?.[0] };
        });
      } else {
        const prods = await safe(fetchList<Product>('products', ...(can('product.list') ? [] : [where('status', '==', 'active')]), limit(2000)), []);
        const lows: InventoryRow[] = [];
        for (const p of prods) for (const v of p.variants || []) {
          const st = n(v.stock); const alert = n(v.low_stock_alert);
          inventory.total++;
          if (st <= 0) inventory.out++; else if (st <= alert) inventory.low++; else inventory.in++;
          if (st <= alert) lows.push({ key: `${p.id}_${v.id}`, product_id: p.id, name: p.name?.en || Object.values(p.name || {})[0] || 'Product', variant: v.name || '', sku: v.sku, stock: st, thumb: p.thumbnail || p.images?.[0] });
        }
        lowRows = lows.sort((a, b) => a.stock - b.stock).slice(0, 6);
      }

      // Recent orders
      const recent = !can('order.list') ? [] : await safe(fetchList<Order>('orders', ...(store ? [where('store_id', '==', store)] : geo), orderBy('created_at', 'desc'), limit(6)), []);

      return {
        cur: aggregate(curDocs), prev: aggregate(prevDocs), today: aggregate(todayDocs), trend: buildTrend(r.key === 'today' ? todayDocs : curDocs, r), todayReturns,
        counts: { customers, products, stores, coupons, riders }, rangeCustomers,
        topStores, topProducts, topCustomers, inventory, lowStock: lowRows, recent,
      };
    },
    placeholderData: (prev) => prev,
  });
}

export const EMPTY_AGG = zero;
