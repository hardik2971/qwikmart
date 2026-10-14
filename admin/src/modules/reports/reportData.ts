// Report builders — port of Admin/ReportController (sales, products, stores, delivery-boys, tax, modes).
// Sources: stats_daily (`${scope}_${yyyy-mm-dd}`, scope all | store_{id} | zone_{id}) for period series,
// orders range queries (created_at between) for per-product / per-store / per-rider / per-tax breakdowns.
import { Timestamp } from 'firebase/firestore';
import type { ApexOptions } from 'apexcharts';
import type { LucideIcon } from 'lucide-react';
import {
  DollarSign, ShoppingBag, Receipt, Percent, Truck, BadgePercent, CircleX, Package, Boxes, ShoppingCart, Store as StoreIcon, Landmark, Trophy,
  Bike, PackageCheck, Wallet, Banknote, Gauge, Layers, Calculator, Zap, PieChart,
} from 'lucide-react';
import { fetchList, where, orderBy, limit } from '@/lib/firestore';
import { money, toDate, tr, ymd } from '@/lib/format';
import type { DeliveryEarning, Order, StatsDaily, Store, Tax, Zone } from '@/lib/types';

export const REPORT_TYPES: Record<string, [string, string]> = {
  sales: ['Sales Report', 'Revenue, orders and order values over time'],
  products: ['Product Sales', 'Best selling products by units and revenue'],
  stores: ['Store Report', 'Revenue and commission per store'],
  'delivery-boys': ['Delivery Boy Report', 'Deliveries, cash and earnings per delivery boy'],
  tax: ['Tax Report', 'Tax collected per tax rate'],
  modes: ['Quick vs eCommerce', 'Compare quick commerce and eCommerce performance'],
};
export const PRESETS: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', '30d': 'Last 30 Days' };
/** Statuses excluded from revenue (FIREBASE_BACKEND.md §8). */
export const NON_REVENUE = ['payment_pending', 'cancelled', 'returned'];
export const MAX_ORDERS = 10000;

export interface ReportCtx {
  from: Date; to: Date; preset: string; days: number; monthly: boolean; mode: '' | 'quick' | 'ecommerce';
  countryId: string; zoneId: string; storeId: string;
}
export type Fmt = 'money' | 'int' | 'percent' | 'decimal';
export interface ReportCol { key: string; label: string; format?: Fmt; bold?: boolean; image?: string; sort?: boolean }
export interface ReportCard { label: string; value: string; icon: LucideIcon; color: string; growth?: number | null }
export interface ModeStats { label: string; orders: number; revenue: number; aov: number; delivered: number; cancelled: number; customers: number; avg_minutes: number | null }
export interface Report {
  cards: ReportCard[];
  chart: { title: string; type: 'area' | 'line' | 'bar'; series: any[]; options: ApexOptions; height: number };
  columns: ReportCol[];
  rows: Record<string, any>[];
  search: string | false;
  defaultSort?: string;
  hideMode?: boolean;
  modes?: { quick: ModeStats; ecommerce: ModeStats };
  donut?: { series: number[]; labels: string[] };
  source: string;
  truncated?: boolean;
}
export interface Lookups { stores: Store[]; zones: Zone[]; taxes: Tax[] }

// ---------------------------------------------------------------- context
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function buildCtx(sp: { get(k: string): string | null }, opts: { storeId?: string | null; countryId?: string }): ReportCtx {
  const now = new Date();
  let preset = sp.get('range') || '';
  let from: Date | null = null; let to: Date | null = null;
  if (preset === 'today') { from = startOfDay(now); to = endOfDay(now); }
  else if (preset === 'week') { const d = startOfDay(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = d; to = endOfDay(now); }
  else if (preset === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = endOfDay(now); }
  else if (preset === 'year') { from = new Date(now.getFullYear(), 0, 1); to = endOfDay(now); }
  if (!from || !to) {
    const pf = sp.get('from'); const pt = sp.get('to');
    const parse = (s: string | null) => { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const a = parse(pf); const b = parse(pt);
    from = a ? startOfDay(a) : startOfDay(new Date(now.getTime() - 29 * 86400000));
    to = b ? endOfDay(b) : endOfDay(now);
    preset = a || b ? 'custom' : '30d';
  }
  if (from > to) { const f = startOfDay(to); to = endOfDay(from); from = f; }
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
  const mode = sp.get('mode');
  return {
    from, to, preset, days, monthly: days > 62, mode: mode === 'quick' || mode === 'ecommerce' ? mode : '',
    countryId: opts.storeId ? '' : sp.get('country_id') === null ? opts.countryId ?? '' : sp.get('country_id') === 'all' ? '' : String(sp.get('country_id')),
    zoneId: opts.storeId ? '' : sp.get('zone_id') || '',
    storeId: opts.storeId || sp.get('store_id') || '',
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function periods(ctx: ReportCtx): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (ctx.monthly) {
    const d = new Date(ctx.from.getFullYear(), ctx.from.getMonth(), 1);
    while (d <= ctx.to) { out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }); d.setMonth(d.getMonth() + 1); }
  } else {
    const d = startOfDay(ctx.from);
    while (d <= ctx.to) { out.push({ key: ymd(d), label: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}` }); d.setDate(d.getDate() + 1); }
  }
  return out;
}
const periodKey = (ctx: ReportCtx, d: Date) => (ctx.monthly ? ymd(d).slice(0, 7) : ymd(d));
const periodLabel = (ctx: ReportCtx, key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return ctx.monthly ? `${MONTHS[m - 1]} ${y}` : `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};

// ---------------------------------------------------------------- data access
export function statsScope(ctx: ReportCtx): string | null {
  if (ctx.storeId) return `store_${ctx.storeId}`;
  if (ctx.zoneId) return `zone_${ctx.zoneId}`;
  if (ctx.countryId) return null; // no country scope in stats_daily → use orders
  return 'all';
}
export async function fetchStats(scope: string, from: Date, to: Date): Promise<StatsDaily[]> {
  return fetchList<StatsDaily>('stats_daily', where('scope', '==', scope), where('date', '>=', ymd(from)), where('date', '<=', ymd(to)));
}
export async function fetchOrders(ctx: ReportCtx, from = ctx.from, to = ctx.to): Promise<{ orders: Order[]; truncated: boolean }> {
  const eq = ctx.storeId ? where('store_id', '==', ctx.storeId) : ctx.zoneId ? where('zone_id', '==', ctx.zoneId) : ctx.countryId ? where('country_id', '==', ctx.countryId) : null;
  const list = await fetchList<Order>('orders', ...(eq ? [eq] : []),
    where('created_at', '>=', Timestamp.fromDate(from)), where('created_at', '<=', Timestamp.fromDate(to)), orderBy('created_at', 'desc'), limit(MAX_ORDERS));
  const orders = list.filter((o) => (!ctx.storeId || o.store_id === ctx.storeId) && (!ctx.zoneId || o.zone_id === ctx.zoneId) && (!ctx.countryId || o.country_id === ctx.countryId));
  return { orders, truncated: list.length >= MAX_ORDERS };
}

// ---------------------------------------------------------------- helpers
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const grand = (o: Order) => n(o.totals?.grand_total ?? o.totals?.total);
export const isRevenue = (o: Order) => !NON_REVENUE.includes(o.status);
const byMode = (ctx: ReportCtx, o: Order) => !ctx.mode || o.mode === ctx.mode;
const growth = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : null) : ((cur - prev) / prev) * 100);
const fmtNum = (v: number, d = 0) => v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pctStr = (v: number) => `${Number(v.toFixed(2))}%`;
const short = (s: string, l = 32) => (s.length > l ? s.slice(0, l - 1) + '…' : s);
const moneyAxis = { labels: { formatter: (v: number) => money(v) } };
const intAxis = { labels: { formatter: (v: number) => String(Math.round(v)) } };
export const maskPhone = (p?: string) => (p && p.length > 6 ? p.slice(0, 3) + '•'.repeat(Math.max(0, p.length - 6)) + p.slice(-3) : p || '—');

interface Bucket { orders: number; revenue: number; tax: number; delivery: number; units: number; cancelled: number; subtotal: number; discount: number; wallet: number; q_orders: number; q_revenue: number; e_orders: number; e_revenue: number }
const emptyBucket = (): Bucket => ({ orders: 0, revenue: 0, tax: 0, delivery: 0, units: 0, cancelled: 0, subtotal: 0, discount: 0, wallet: 0, q_orders: 0, q_revenue: 0, e_orders: 0, e_revenue: 0 });

function bucketsFromStats(ctx: ReportCtx, stats: StatsDaily[]): Map<string, Bucket> {
  const m = new Map<string, Bucket>();
  for (const s of stats) {
    const k = ctx.monthly ? s.date.slice(0, 7) : s.date;
    const b = m.get(k) || emptyBucket();
    b.orders += n(s.orders); b.revenue += n(s.revenue); b.tax += n(s.tax); b.delivery += n(s.delivery_charges); b.units += n(s.units); b.cancelled += n(s.cancelled);
    b.q_orders += n(s.by_mode?.quick?.orders); b.q_revenue += n(s.by_mode?.quick?.revenue);
    b.e_orders += n(s.by_mode?.ecommerce?.orders); b.e_revenue += n(s.by_mode?.ecommerce?.revenue);
    m.set(k, b);
  }
  return m;
}
function bucketsFromOrders(ctx: ReportCtx, orders: Order[], applyMode: boolean): Map<string, Bucket> {
  const m = new Map<string, Bucket>();
  for (const o of orders) {
    if (applyMode && !byMode(ctx, o)) continue;
    if (o.status === 'payment_pending') continue;
    const d = toDate(o.created_at); if (!d) continue;
    const k = periodKey(ctx, d);
    const b = m.get(k) || emptyBucket();
    b.orders++;
    if (o.status === 'cancelled') b.cancelled++;
    if (isRevenue(o)) {
      const g = grand(o); const t = o.totals || ({} as any);
      b.revenue += g; b.tax += n(t.tax_amount); b.delivery += n(t.delivery_charge) + n(t.surge_charge); b.subtotal += n(t.subtotal);
      b.discount += n(t.discount) + n(t.promo_discount); b.wallet += n(t.wallet_used);
      b.units += (o.items || []).reduce((s, i) => s + n(i.qty), 0);
      if (o.mode === 'quick') { b.q_orders++; b.q_revenue += g; } else if (o.mode === 'ecommerce') { b.e_orders++; b.e_revenue += g; }
    }
    m.set(k, b);
  }
  return m;
}
const sumB = (m: Map<string, Bucket>) => { const t = emptyBucket(); m.forEach((b) => { (Object.keys(t) as (keyof Bucket)[]).forEach((k) => { t[k] += b[k]; }); }); return t; };
function previousRange(ctx: ReportCtx): [Date, Date] {
  const len = ctx.to.getTime() - ctx.from.getTime();
  const pTo = new Date(ctx.from.getTime() - 1000);
  return [new Date(pTo.getTime() - len), pTo];
}

// ---------------------------------------------------------------- builders
export async function buildReport(type: string, ctx: ReportCtx, lk: Lookups): Promise<Report> {
  switch (type) {
    case 'products': return products(ctx);
    case 'stores': return stores(ctx, lk);
    case 'delivery-boys': return deliveryBoys(ctx, lk);
    case 'tax': return tax(ctx, lk);
    case 'modes': return modes(ctx);
    default: return sales(ctx);
  }
}

async function sales(ctx: ReportCtx): Promise<Report> {
  const scope = statsScope(ctx);
  const useStats = !!scope && !ctx.mode;
  const per = periods(ctx);
  let buckets: Map<string, Bucket>; let prev: Bucket; let truncated = false;
  if (useStats) {
    const [pf, pt] = previousRange(ctx);
    const [cur, old] = await Promise.all([fetchStats(scope!, ctx.from, ctx.to), fetchStats(scope!, pf, pt)]);
    buckets = bucketsFromStats(ctx, cur); prev = sumB(bucketsFromStats(ctx, old));
  } else {
    const [pf, pt] = previousRange(ctx);
    const [cur, old] = await Promise.all([fetchOrders(ctx), fetchOrders(ctx, pf, pt)]);
    truncated = cur.truncated;
    buckets = bucketsFromOrders(ctx, cur.orders, true); prev = sumB(bucketsFromOrders(ctx, old.orders, true));
  }
  const t = sumB(buckets);
  const keys = [...buckets.keys()].sort().reverse();
  const cards: ReportCard[] = [
    { label: 'Total Revenue', value: money(t.revenue), icon: DollarSign, color: 'green', growth: growth(t.revenue, prev.revenue) },
    { label: 'Total Orders', value: fmtNum(t.orders), icon: ShoppingBag, color: 'blue', growth: growth(t.orders, prev.orders) },
    { label: 'Avg Order Value', value: money(t.orders ? t.revenue / Math.max(1, t.orders - t.cancelled) : 0), icon: Receipt, color: 'purple' },
    { label: 'Tax Collected', value: money(t.tax), icon: Percent, color: 'orange' },
    { label: 'Delivery Charges', value: money(t.delivery), icon: Truck, color: 'cyan' },
    useStats ? { label: 'Units Sold', value: fmtNum(t.units), icon: Package, color: 'pink' } : { label: 'Discounts Given', value: money(t.discount), icon: BadgePercent, color: 'pink' },
    { label: 'Cancelled Orders', value: fmtNum(t.cancelled), icon: CircleX, color: 'red' },
  ];
  const columns: ReportCol[] = useStats
    ? [
      { key: 'period', label: ctx.monthly ? 'Month' : 'Date', bold: true }, { key: 'orders', label: 'Orders', format: 'int', sort: true },
      { key: 'units', label: 'Units', format: 'int', sort: true }, { key: 'tax', label: 'Tax', format: 'money', sort: true },
      { key: 'delivery', label: 'Delivery', format: 'money', sort: true }, { key: 'cancelled', label: 'Cancelled', format: 'int', sort: true },
      { key: 'revenue', label: 'Revenue', format: 'money', bold: true, sort: true },
    ]
    : [
      { key: 'period', label: ctx.monthly ? 'Month' : 'Date', bold: true }, { key: 'orders', label: 'Orders', format: 'int', sort: true },
      { key: 'subtotal', label: 'Subtotal', format: 'money', sort: true }, { key: 'discount', label: 'Discount', format: 'money', sort: true },
      { key: 'tax', label: 'Tax', format: 'money', sort: true }, { key: 'delivery', label: 'Delivery', format: 'money', sort: true },
      { key: 'wallet', label: 'Wallet Used', format: 'money', sort: true }, { key: 'revenue', label: 'Revenue', format: 'money', bold: true, sort: true },
    ];
  return {
    cards, columns, search: false, truncated,
    rows: keys.map((k) => ({ _key: k, period: periodLabel(ctx, k), ...buckets.get(k)! })),
    source: useStats ? `stats_daily (${scope})` : 'orders',
    chart: {
      title: 'Revenue & Orders', type: 'line', height: 330,
      series: [
        { name: 'Revenue', type: 'area', data: per.map((p) => Math.round((buckets.get(p.key)?.revenue || 0) * 100) / 100) },
        { name: 'Orders', type: 'line', data: per.map((p) => buckets.get(p.key)?.orders || 0) },
      ],
      options: {
        xaxis: { categories: per.map((p) => p.label) },
        yaxis: [{ title: { text: 'Revenue' }, ...moneyAxis }, { opposite: true, title: { text: 'Orders' }, ...intAxis }],
        colors: ['#0E9623', '#3B82F6'], stroke: { curve: 'smooth', width: [2.5, 2.5] },
        fill: { type: ['gradient', 'solid'], gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
        tooltip: { shared: true, intersect: false, y: { formatter: (v: number, o: any) => (o?.seriesIndex === 0 ? money(v) : String(v)) } },
      },
    },
  };
}

async function products(ctx: ReportCtx): Promise<Report> {
  const { orders, truncated } = await fetchOrders(ctx);
  const rev = orders.filter((o) => isRevenue(o) && byMode(ctx, o));
  const map = new Map<string, { id: string; name: string; image?: string; units: number; orders: Set<string>; revenue: number; tax: number }>();
  for (const o of rev) for (const it of o.items || []) {
    const id = it.product_id || it.name;
    const r = map.get(id) || { id, name: tr(it.name as any) || id, image: it.image, units: 0, orders: new Set<string>(), revenue: 0, tax: 0 };
    r.units += n(it.qty); r.orders.add(o.id); r.revenue += n(it.total); r.tax += n(it.tax_amount); if (!r.image && it.image) r.image = it.image;
    map.set(id, r);
  }
  const rows = [...map.values()].map((r) => ({ _key: r.id, name: r.name, image: r.image, units: r.units, orders: r.orders.size, avg: r.units ? r.revenue / r.units : 0, tax: r.tax, revenue: r.revenue }))
    .sort((a, b) => b.units - a.units);
  const units = rows.reduce((s, r) => s + r.units, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const ordersWithItems = new Set(rev.filter((o) => (o.items || []).length).map((o) => o.id)).size;
  const top = rows.slice(0, 10);
  return {
    truncated, source: 'orders', search: 'Search product', defaultSort: 'units',
    cards: [
      { label: 'Units Sold', value: fmtNum(units), icon: Package, color: 'blue' },
      { label: 'Product Revenue', value: money(revenue), icon: DollarSign, color: 'green' },
      { label: 'Products Sold', value: fmtNum(rows.length), icon: Boxes, color: 'purple' },
      { label: 'Avg Units / Order', value: fmtNum(ordersWithItems ? units / ordersWithItems : 0, 1), icon: ShoppingCart, color: 'orange' },
    ],
    columns: [
      { key: 'name', label: 'Product', image: 'image', bold: true }, { key: 'units', label: 'Units Sold', format: 'int', sort: true },
      { key: 'orders', label: 'Orders', format: 'int', sort: true }, { key: 'avg', label: 'Avg Price', format: 'money' },
      { key: 'tax', label: 'Tax', format: 'money' }, { key: 'revenue', label: 'Revenue', format: 'money', sort: true, bold: true },
    ],
    rows,
    chart: {
      title: 'Top 10 Products by Units', type: 'bar', height: 360,
      series: [{ name: 'Units', data: top.map((r) => r.units) }],
      options: { plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } }, xaxis: { categories: top.map((r) => short(r.name)) }, colors: ['#0E9623'], dataLabels: { enabled: true } },
    },
  };
}

async function stores(ctx: ReportCtx, lk: Lookups): Promise<Report> {
  const { orders, truncated } = await fetchOrders(ctx);
  const map = new Map<string, { orders: number; delivered: number; cancelled: number; revenue: number }>();
  for (const o of orders) {
    if (!o.store_id || !byMode(ctx, o)) continue;
    const r = map.get(o.store_id) || { orders: 0, delivered: 0, cancelled: 0, revenue: 0 };
    if (isRevenue(o)) { r.orders++; r.revenue += grand(o); }
    if (o.status === 'delivered') r.delivered++;
    if (o.status === 'cancelled') r.cancelled++;
    map.set(o.store_id, r);
  }
  const rows = [...map.entries()].map(([id, r]) => {
    const s = lk.stores.find((x) => x.id === id);
    const pct = n(s?.commission_percent);
    return { _key: id, name: s?.name || `#${id}`, image: s?.logo, zone: lk.zones.find((z) => z.id === s?.zone_id)?.name || '—', ...r, avg: r.orders ? r.revenue / r.orders : 0, commission_percent: pct, commission: (r.revenue * pct) / 100 };
  }).sort((a, b) => b.revenue - a.revenue);
  const top = rows.slice(0, 15);
  return {
    truncated, source: 'orders', search: 'Search store', defaultSort: 'revenue',
    cards: [
      { label: 'Stores With Sales', value: fmtNum(rows.filter((r) => r.orders > 0).length), icon: StoreIcon, color: 'blue' },
      { label: 'Total Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), icon: DollarSign, color: 'green' },
      { label: 'Platform Commission', value: money(rows.reduce((s, r) => s + r.commission, 0)), icon: Landmark, color: 'purple' },
      { label: 'Top Store', value: rows[0]?.name || '-', icon: Trophy, color: 'orange' },
    ],
    columns: [
      { key: 'name', label: 'Store', image: 'image', bold: true }, { key: 'zone', label: 'Zone' },
      { key: 'orders', label: 'Orders', format: 'int', sort: true }, { key: 'delivered', label: 'Delivered', format: 'int', sort: true },
      { key: 'cancelled', label: 'Cancelled', format: 'int', sort: true }, { key: 'avg', label: 'Avg Order', format: 'money' },
      { key: 'commission_percent', label: 'Commission %', format: 'percent' }, { key: 'commission', label: 'Commission', format: 'money', sort: true },
      { key: 'revenue', label: 'Revenue', format: 'money', sort: true, bold: true },
    ],
    rows,
    chart: {
      title: 'Revenue per Store', type: 'bar', height: 340,
      series: [{ name: 'Revenue', data: top.map((r) => Math.round(r.revenue * 100) / 100) }],
      options: { plotOptions: { bar: { borderRadius: 5, columnWidth: '45%' } }, xaxis: { categories: top.map((r) => short(r.name, 20)) }, yaxis: moneyAxis, colors: ['#0E9623'], tooltip: { y: { formatter: (v: number) => money(v) } } },
    },
  };
}

async function deliveryBoys(ctx: ReportCtx, lk: Lookups): Promise<Report> {
  const [{ orders, truncated }, earnings] = await Promise.all([
    fetchOrders(ctx),
    fetchList<DeliveryEarning>('delivery_earnings', where('created_at', '>=', Timestamp.fromDate(ctx.from)), where('created_at', '<=', Timestamp.fromDate(ctx.to))).catch(() => [] as DeliveryEarning[]),
  ]);
  const filtered = !!(ctx.storeId || ctx.zoneId || ctx.countryId || ctx.mode);
  const orderIds = new Set(orders.filter((o) => byMode(ctx, o)).map((o) => o.id));
  const earn = new Map<string, number>();
  for (const e of earnings) {
    if (filtered && (!e.order_id || !orderIds.has(e.order_id))) continue;
    earn.set(e.delivery_boy_id, (earn.get(e.delivery_boy_id) || 0) + n(e.amount));
  }
  const map = new Map<string, { name: string; phone?: string; avatar?: string; zone: string; assigned: number; delivered: number; cancelled: number; cod: number }>();
  for (const o of orders) {
    if (!o.delivery_boy_id || !byMode(ctx, o)) continue;
    const r = map.get(o.delivery_boy_id) || { name: o.delivery_boy?.name || `#${o.delivery_boy_id}`, phone: o.delivery_boy?.phone, avatar: o.delivery_boy?.avatar, zone: lk.zones.find((z) => z.id === o.zone_id)?.name || '—', assigned: 0, delivered: 0, cancelled: 0, cod: 0 };
    r.assigned++;
    if (o.status === 'delivered') { r.delivered++; if (o.payment_method === 'cod') r.cod += grand(o); }
    if (o.status === 'cancelled') r.cancelled++;
    map.set(o.delivery_boy_id, r);
  }
  const rows = [...map.entries()].map(([id, r]) => ({ _key: id, ...r, phone: maskPhone(r.phone), image: r.avatar, earnings: earn.get(id) || 0 })).sort((a, b) => b.delivered - a.delivered);
  const deliveries = rows.reduce((s, r) => s + r.delivered, 0);
  const top = rows.slice(0, 12);
  return {
    truncated, source: 'orders + delivery_earnings', search: 'Search name or phone', defaultSort: 'delivered',
    cards: [
      { label: 'Active Delivery Boys', value: fmtNum(rows.length), icon: Bike, color: 'blue' },
      { label: 'Total Deliveries', value: fmtNum(deliveries), icon: PackageCheck, color: 'green' },
      { label: 'Total Earnings', value: money(rows.reduce((s, r) => s + r.earnings, 0)), icon: Wallet, color: 'purple' },
      { label: 'COD Collected', value: money(rows.reduce((s, r) => s + r.cod, 0)), icon: Banknote, color: 'orange' },
      { label: 'Avg Deliveries / Boy', value: fmtNum(rows.length ? deliveries / rows.length : 0, 1), icon: Gauge, color: 'cyan' },
    ],
    columns: [
      { key: 'name', label: 'Delivery Boy', image: 'image', bold: true }, { key: 'phone', label: 'Phone' }, { key: 'zone', label: 'Zone' },
      { key: 'assigned', label: 'Assigned', format: 'int', sort: true }, { key: 'delivered', label: 'Delivered', format: 'int', sort: true },
      { key: 'cancelled', label: 'Cancelled', format: 'int', sort: true }, { key: 'cod', label: 'COD Collected', format: 'money', sort: true },
      { key: 'earnings', label: 'Earnings', format: 'money', sort: true, bold: true },
    ],
    rows,
    chart: {
      title: 'Deliveries & Earnings', type: 'line', height: 340,
      series: [{ name: 'Deliveries', type: 'column', data: top.map((r) => r.delivered) }, { name: 'Earnings', type: 'line', data: top.map((r) => Math.round(r.earnings * 100) / 100) }],
      options: {
        xaxis: { categories: top.map((r) => short(r.name, 18)) },
        yaxis: [{ title: { text: 'Deliveries' }, ...intAxis }, { opposite: true, title: { text: 'Earnings' }, ...moneyAxis }],
        plotOptions: { bar: { borderRadius: 4, columnWidth: '45%' } }, stroke: { width: [0, 3], curve: 'smooth' }, colors: ['#0E9623', '#F59E0B'],
        tooltip: { shared: true, intersect: false, y: { formatter: (v: number, o: any) => (o?.seriesIndex === 1 ? money(v) : String(v)) } },
      },
    },
  };
}

async function tax(ctx: ReportCtx, lk: Lookups): Promise<Report> {
  const { orders, truncated } = await fetchOrders(ctx);
  const rev = orders.filter((o) => isRevenue(o) && byMode(ctx, o));
  const per = periods(ctx);
  const rateName = (pct: number) => {
    if (pct <= 0) return 'No Tax';
    const t = lk.taxes.find((x) => Math.abs(n(x.percent) - pct) < 0.05);
    return t ? `${t.name} (${pctStr(n(t.percent))})` : `Tax (${pctStr(pct)})`;
  };
  const groups = new Map<string, { name: string; percent: number; items: number; orders: Set<string>; taxable: number; tax: number; byPeriod: Map<string, number> }>();
  let totalTax = 0; let taxable = 0;
  for (const o of rev) {
    totalTax += n(o.totals?.tax_amount);
    const d = toDate(o.created_at); const pk = d ? periodKey(ctx, d) : '';
    for (const it of o.items || []) {
      const tx = n(it.tax_amount); const base = n(it.total) - tx;
      const pct = base > 0 && tx > 0 ? Math.round((tx / base) * 10000) / 100 : 0;
      const nm = rateName(pct);
      const g = groups.get(nm) || { name: nm, percent: pct, items: 0, orders: new Set<string>(), taxable: 0, tax: 0, byPeriod: new Map() };
      g.items += n(it.qty); g.orders.add(o.id); g.taxable += base; g.tax += tx; g.byPeriod.set(pk, (g.byPeriod.get(pk) || 0) + tx);
      groups.set(nm, g); taxable += base;
    }
  }
  const list = [...groups.values()].sort((a, b) => b.tax - a.tax);
  const series = list.filter((g) => g.tax > 0).map((g) => ({ name: g.name, data: per.map((p) => Math.round((g.byPeriod.get(p.key) || 0) * 100) / 100) }));
  return {
    truncated, source: 'orders', search: false, defaultSort: 'tax',
    cards: [
      { label: 'Tax Collected', value: money(totalTax), icon: Percent, color: 'green' },
      { label: 'Taxable Sales', value: money(taxable), icon: Receipt, color: 'blue' },
      { label: 'Tax Rates Used', value: fmtNum(list.filter((g) => g.tax > 0).length), icon: Layers, color: 'purple' },
      { label: 'Effective Rate', value: `${fmtNum(taxable > 0 ? (totalTax / taxable) * 100 : 0, 2)}%`, icon: Calculator, color: 'orange' },
    ],
    columns: [
      { key: 'name', label: 'Tax', bold: true }, { key: 'percent', label: 'Rate', format: 'percent' }, { key: 'items', label: 'Items', format: 'int', sort: true },
      { key: 'orders', label: 'Orders', format: 'int', sort: true }, { key: 'taxable', label: 'Taxable Amount', format: 'money', sort: true },
      { key: 'tax', label: 'Tax Collected', format: 'money', bold: true, sort: true },
    ],
    rows: list.map((g) => ({ _key: g.name, name: g.name, percent: g.percent, items: g.items, orders: g.orders.size, taxable: g.taxable, tax: g.tax })),
    chart: {
      title: `Tax Collected per Rate (${ctx.monthly ? 'monthly' : 'daily'})`, type: 'bar', height: 330,
      series: series.length ? series : [{ name: 'Tax', data: per.map(() => 0) }],
      options: {
        chart: { stacked: true }, plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } }, xaxis: { categories: per.map((p) => p.label) }, yaxis: moneyAxis,
        colors: ['#0E9623', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899'], tooltip: { y: { formatter: (v: number) => money(v) } },
      },
    },
  };
}

async function modes(ctx: ReportCtx): Promise<Report> {
  const scope = statsScope(ctx);
  const [{ orders, truncated }, stats] = await Promise.all([fetchOrders(ctx), scope ? fetchStats(scope, ctx.from, ctx.to) : Promise.resolve(null)]);
  const mk = (m: 'quick' | 'ecommerce', label: string): ModeStats => {
    const list = orders.filter((o) => o.mode === m);
    const rev = list.filter(isRevenue);
    const revenue = rev.reduce((s, o) => s + grand(o), 0);
    const mins = list.filter((o) => o.status === 'delivered' && o.delivered_at).map((o) => ((toDate(o.delivered_at)?.getTime() ?? 0) - (toDate(o.created_at)?.getTime() ?? 0)) / 60000).filter((x) => x > 0);
    return {
      label, orders: rev.length, revenue, aov: rev.length ? revenue / rev.length : 0, delivered: list.filter((o) => o.status === 'delivered').length,
      cancelled: list.filter((o) => o.status === 'cancelled').length, customers: new Set(list.map((o) => o.user_id)).size,
      avg_minutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    };
  };
  const ms = { quick: mk('quick', 'Quick Commerce'), ecommerce: mk('ecommerce', 'eCommerce') };
  const buckets = stats ? bucketsFromStats(ctx, stats) : bucketsFromOrders(ctx, orders, false);
  const per = periods(ctx);
  const total = ms.quick.revenue + ms.ecommerce.revenue;
  const keys = [...buckets.keys()].sort().reverse();
  return {
    truncated, source: stats ? `stats_daily (${scope}) + orders` : 'orders', search: false, hideMode: true,
    modes: ms,
    donut: { series: [Math.round(ms.quick.revenue * 100) / 100, Math.round(ms.ecommerce.revenue * 100) / 100], labels: ['Quick', 'eCommerce'] },
    cards: [
      { label: 'Total Revenue', value: money(total), icon: DollarSign, color: 'green' },
      { label: 'Quick Revenue', value: money(ms.quick.revenue), icon: Zap, color: 'teal' },
      { label: 'eCommerce Revenue', value: money(ms.ecommerce.revenue), icon: Package, color: 'orange' },
      { label: 'Quick Share', value: `${fmtNum(total ? (ms.quick.revenue / total) * 100 : 0, 1)}%`, icon: PieChart, color: 'purple' },
    ],
    columns: [
      { key: 'period', label: ctx.monthly ? 'Month' : 'Date', bold: true }, { key: 'q_orders', label: 'Quick Orders', format: 'int', sort: true },
      { key: 'q_revenue', label: 'Quick Revenue', format: 'money', sort: true }, { key: 'e_orders', label: 'eCom Orders', format: 'int', sort: true },
      { key: 'e_revenue', label: 'eCom Revenue', format: 'money', sort: true }, { key: 'revenue', label: 'Total Revenue', format: 'money', bold: true, sort: true },
    ],
    rows: keys.map((k) => { const b = buckets.get(k)!; return { _key: k, period: periodLabel(ctx, k), q_orders: b.q_orders, q_revenue: b.q_revenue, e_orders: b.e_orders, e_revenue: b.e_revenue, revenue: b.q_revenue + b.e_revenue }; }),
    chart: {
      title: 'Revenue Trend: Quick vs eCommerce', type: 'line', height: 330,
      series: [
        { name: 'Quick Revenue', data: per.map((p) => Math.round((buckets.get(p.key)?.q_revenue || 0) * 100) / 100) },
        { name: 'eCommerce Revenue', data: per.map((p) => Math.round((buckets.get(p.key)?.e_revenue || 0) * 100) / 100) },
      ],
      options: { xaxis: { categories: per.map((p) => p.label) }, yaxis: moneyAxis, stroke: { curve: 'smooth', width: 3 }, colors: ['#0E9623', '#F59E0B'], tooltip: { y: { formatter: (v: number) => money(v) } } },
    },
  };
}

export function fmtCell(v: any, f?: Fmt): string {
  if (f === 'money') return money(v);
  if (f === 'int') return fmtNum(n(v));
  if (f === 'percent') return pctStr(n(v));
  if (f === 'decimal') return fmtNum(n(v), 2);
  return v === null || v === undefined || v === '' ? '—' : String(v);
}
