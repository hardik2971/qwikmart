/**
 * stats_daily contribution of a single order (spec §3 "Analytics").
 *
 * This is the exact rule the migration uses; the onOrderWritten trigger should apply the same rule
 * incrementally (new contribution minus old contribution).
 *
 *   bucket       : order.created_at in STATS_TZ (Asia/Kolkata) -> `${scope}_${yyyy-mm-dd}`, hour 0..23
 *   scopes       : 'all', `store_${store_id}` (if any), `zone_${zone_id}` (if any)
 *   orders       : 1 for every order except status 'payment_pending'
 *   revenue      : totals.grand_total (= payable total + wallet_used) — only for REVENUE statuses (status NOT in
 *                  payment_pending | cancelled | returned = NON_REVENUE_STATUSES; spec §8, Laravel DashboardService)
 *   delivery_charges, tax : order delivery_charge / tax_amount — only for revenue statuses
 *   units        : Σ item.qty — only for revenue statuses
 *   cancelled    : 1 when status == 'cancelled';  returned: 1 when status == 'returned'
 *   by_status    : {[status]: 1}   (all statuses, including payment_pending)
 *   by_mode      : {[mode]: {orders, revenue}}  (same orders/revenue rules)
 *   by_category  : {[product.category_id]: {revenue: Σ item.total, units: Σ qty}} — only for revenue statuses
 *   by_hour      : {[hour]: {orders, revenue}}
 */
import { dayHour, num } from './common.js';

/** spec §8 NON_REVENUE_STATUSES (= Laravel DashboardService::REVENUE_EXCLUDED). */
export const NON_REVENUE_STATUSES = ['payment_pending', 'cancelled', 'returned'];
export const isRevenueStatus = (s: string) => !NON_REVENUE_STATUSES.includes(s);

export interface StatsItem {
  product_id: string | null;
  category_id: string | null;
  qty: number;
  total: number;
}
export interface StatsOrder {
  status: string;
  mode: string;
  created_at: Date;
  grand_total: number;
  delivery_charge: number;
  tax_amount: number;
  store_id: string | null;
  zone_id: string | null;
  items: StatsItem[];
}

export interface StatsDoc {
  date: string;
  scope: string;
  orders: number;
  revenue: number;
  delivery_charges: number;
  tax: number;
  units: number;
  cancelled: number;
  returned: number;
  by_status: Record<string, number>;
  by_mode: Record<string, { orders: number; revenue: number }>;
  by_category: Record<string, { revenue: number; units: number }>;
  by_hour: Record<string, { orders: number; revenue: number }>;
}

export function emptyStats(scope: string, date: string): StatsDoc {
  const by_hour: StatsDoc['by_hour'] = {};
  for (let h = 0; h < 24; h++) by_hour[String(h)] = { orders: 0, revenue: 0 };
  return {
    date,
    scope,
    orders: 0,
    revenue: 0,
    delivery_charges: 0,
    tax: 0,
    units: 0,
    cancelled: 0,
    returned: 0,
    by_status: {},
    by_mode: { quick: { orders: 0, revenue: 0 }, ecommerce: { orders: 0, revenue: 0 } },
    by_category: {},
    by_hour,
  };
}

export function statsScopes(o: Pick<StatsOrder, 'store_id' | 'zone_id'>): string[] {
  const s = ['all'];
  if (o.store_id) s.push(`store_${o.store_id}`);
  if (o.zone_id) s.push(`zone_${o.zone_id}`);
  return s;
}

/** Adds the order's contribution into the accumulator map (key = `${scope}_${date}`). */
export function addOrderToStats(acc: Map<string, StatsDoc>, o: StatsOrder) {
  const { day, hour } = dayHour(o.created_at);
  const counted = o.status !== 'payment_pending' ? 1 : 0;
  const inRevenue = isRevenueStatus(o.status); // counts towards revenue (not only 'delivered')
  const revenue = inRevenue ? o.grand_total : 0;
  for (const scope of statsScopes(o)) {
    const key = `${scope}_${day}`;
    let d = acc.get(key);
    if (!d) acc.set(key, (d = emptyStats(scope, day)));
    d.orders += counted;
    d.revenue = num(d.revenue + revenue);
    if (o.status === 'cancelled') d.cancelled += 1;
    if (o.status === 'returned') d.returned += 1;
    d.by_status[o.status] = (d.by_status[o.status] ?? 0) + 1;
    const m = (d.by_mode[o.mode] ??= { orders: 0, revenue: 0 });
    m.orders += counted;
    m.revenue = num(m.revenue + revenue);
    const h = d.by_hour[String(hour)];
    h.orders += counted;
    h.revenue = num(h.revenue + revenue);
    if (inRevenue) {
      d.delivery_charges = num(d.delivery_charges + o.delivery_charge);
      d.tax = num(d.tax + o.tax_amount);
      for (const it of o.items) {
        d.units += it.qty;
        if (it.category_id) {
          const c = (d.by_category[it.category_id] ??= { revenue: 0, units: 0 });
          c.revenue = num(c.revenue + it.total);
          c.units += it.qty;
        }
      }
    }
  }
}
