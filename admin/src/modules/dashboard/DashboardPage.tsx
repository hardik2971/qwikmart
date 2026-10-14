'use client';
// Admin + Store dashboard — port of admin/dashboard/index.blade.php (reference screenshots 47 / 31).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Package, DollarSign, RotateCcw, CircleX, Clock, CircleCheck, Settings, PackageCheck, Hand, Truck, MapPin, ShoppingBag, ChartLine,
  Users, Box, Store as StoreIcon, Ticket, Bike, Zap, ChartPie, TriangleAlert, Star, Flag, Calendar, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { useDocQ, useZones } from '@/lib/firestore';
import { flagEmoji, fmtDate, fmtDateTime, greeting, imgUrl, money, num, tr } from '@/lib/format';
import type { Store } from '@/lib/types';
import { Card, MetricCard, StatCard, StatusPill, cx } from '@/components/ui';
import { Chart } from '@/components/ui/Chart';
import { useCategories } from '@/lib/firestore';
import { computeRange, dayStr, EMPTY_AGG, growth, istToday, RANGE_LABELS, useDashboard, type RangeKey } from './dashboardData';

const STATUSES: [string, string, LucideIcon, string][] = [
  ['payment_pending', 'Payment Pending', Clock, 'amber'],
  ['received', 'Received', CircleCheck, 'green'],
  ['processed', 'Processed', Settings, 'indigo'],
  ['shipped', 'Shipped', Package, 'blue'],
  ['ready_for_pickup', 'Ready For Pickup', PackageCheck, 'cyan'],
  ['picked_up', 'Picked Up', Hand, 'purple'],
  ['out_for_delivery', 'Out For Delivery', Truck, 'teal'],
  ['delivered', 'Delivered', MapPin, 'green'],
  ['cancelled', 'Cancelled', CircleX, 'red'],
  ['returned', 'Returned', RotateCcw, 'purple'],
];
const TILE: Record<string, string> = { amber: 'bg-amber-50 text-amber-500', green: 'bg-emerald-50 text-emerald-600', indigo: 'bg-indigo-50 text-indigo-500', blue: 'bg-blue-50 text-blue-500', cyan: 'bg-cyan-50 text-cyan-600', purple: 'bg-violet-50 text-violet-500', teal: 'bg-teal-50 text-teal-600', red: 'bg-red-50 text-red-500' };
const BAR: Record<string, string> = { amber: 'bg-amber-500', green: 'bg-primary', indigo: 'bg-indigo-500', blue: 'bg-blue-500', cyan: 'bg-cyan-500', purple: 'bg-violet-500', teal: 'bg-teal-500', red: 'bg-red-500' };

function maskPhone(p?: string) { if (!p) return '—'; return p.length > 6 ? p.slice(0, 3) + '*'.repeat(Math.max(0, p.length - 6)) + p.slice(-3) : p; }

export default function DashboardPage() {
  const { profile, user, can } = useAuth();
  const { p, storeId, isStore, countryId: headerCountry, countries, uiLang } = usePanel();
  const { data: zones = [] } = useZones();
  const { data: categories = [] } = useCategories();
  const { data: myStore } = useDocQ<Store>('stores', storeId);

  const [range, setRange] = useState<RangeKey>('year');
  const today = dayStr(istToday());
  const [cFrom, setCFrom] = useState(dayStr(new Date(istToday().getTime() - 30 * 86400000)));
  const [cTo, setCTo] = useState(today);
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: cFrom, to: cTo });
  const [countryId, setCountryId] = useState(headerCountry);
  const [zoneId, setZoneId] = useState('');
  useEffect(() => { setCountryId(headerCountry); setZoneId(''); }, [headerCountry]);

  const r = useMemo(() => computeRange(range, applied.from, applied.to), [range, applied.from, applied.to]);
  const zoneOpts = zones.filter((z) => !countryId || z.country_id === countryId);
  const { data, isLoading } = useDashboard({ storeId, countryId: isStore ? '' : countryId, zoneId: isStore ? '' : zoneId, zones, can }, r, !isStore || !!storeId);

  const d = data;
  const cur = d?.cur ?? EMPTY_AGG; const prev = d?.prev ?? EMPTY_AGG; const tday = d?.today ?? EMPTY_AGG;
  const sub = RANGE_LABELS[range];
  const name = isStore ? (myStore?.name || profile?.name || 'Store') : (profile?.name || user?.displayName || 'Admin');

  const statusCounts = cur.by_status || {};
  const maxStatus = Math.max(1, ...Object.values(statusCounts).map(Number));

  const custCur = isStore ? d?.rangeCustomers ?? 0 : d?.counts.customers ?? 0;
  const metrics: [string, string, LucideIcon, string, number | null, string | null][] = [
    ['TOTAL REVENUE', money(cur.revenue), DollarSign, 'green', growth(cur.revenue, prev.revenue), null],
    ['TOTAL ORDERS', num(cur.orders), ShoppingBag, 'blue', growth(cur.orders, prev.orders), null],
    ['DELIVERY CHARGES', money(cur.delivery_charges), Truck, 'cyan', growth(cur.delivery_charges, prev.delivery_charges), null],
    ['TAX COLLECTED', money(cur.tax), ChartLine, 'teal', null, 'from orders'],
    ['UNITS SOLD', num(cur.units), Package, 'purple', growth(cur.units, prev.units), null],
    ['ACTIVE CUSTOMERS', num(custCur), Users, 'purple', null, null],
    ['ACTIVE PRODUCTS', num(d?.counts.products ?? 0), Box, 'pink', null, null],
    ['ACTIVE STORES', num(d?.counts.stores ?? (isStore ? 1 : 0)), StoreIcon, 'teal', null, null],
    ['ACTIVE COUPONS', num(d?.counts.coupons ?? 0), Ticket, 'orange', null, null],
    ['DELIVERY STAFF', num(d?.counts.riders ?? 0), Bike, 'indigo', null, null],
  ];

  // category donut (top 6 by revenue)
  const cats = Object.entries(cur.by_category || {}).filter(([, v]) => v.revenue > 0).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);
  const catLabels = cats.map(([id]) => { const c = categories.find((x) => x.id === id); return c ? tr(c.name, uiLang) : 'Other'; });
  const catSeries = cats.map(([, v]) => Math.round(v.revenue * 100) / 100);

  const quick = cur.by_mode?.quick ?? { orders: 0, revenue: 0 };
  const ecom = cur.by_mode?.ecommerce ?? { orders: 0, revenue: 0 };
  const modeTotal = Math.max(1, quick.revenue + ecom.revenue);
  const inv = d?.inventory ?? { total: 0, in: 0, low: 0, out: 0 };
  const invTotal = Math.max(1, inv.total);

  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const axis = dark ? '#94a3b8' : '#7C8DB5';
  const gridC = dark ? '#334155' : '#EEF1F6';
  const sym = money(0).replace(/[\d.,\s]/g, '');
  const trend = d?.trend ?? { labels: [], revenue: [], orders: [] };

  return (
    <div>
      {/* Greeting + filters */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Welcome, {name}</h1>
          <p className="text-sm font-medium text-primary mt-0.5">{greeting()} · {fmtDate(new Date())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isStore && (
            <>
              <label className="relative">
                <Flag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={countryId} onChange={(e) => { setCountryId(e.target.value); setZoneId(''); }} className="input !py-2.5 !pl-9 !w-44" data-testid="dash-country">
                  <option value="">All Countries</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{flagEmoji(c.flag, c.iso2)} {c.name}</option>)}
                </select>
              </label>
              <label className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="input !py-2.5 !pl-9 !w-40" data-testid="dash-zone">
                  <option value="">All Zones</option>
                  {zoneOpts.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </label>
            </>
          )}
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={cFrom} max={today} onChange={(e) => setCFrom(e.target.value)} className="input !py-2 !w-40" />
              <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="input !py-2 !w-40" />
              <button type="button" className="btn-primary !py-2" data-testid="apply-range" onClick={() => setApplied({ from: cFrom, to: cTo })}>Apply</button>
            </div>
          )}
          <label className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="input !py-2.5 !pl-9 !w-44" data-testid="dash-range">
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => <option key={k} value={k}>{RANGE_LABELS[k]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today Orders" value={num(tday.orders)} icon={Package} color="blue" href={p('/orders')} />
        <StatCard label="Today Revenue" value={money(tday.revenue)} icon={DollarSign} color="green" />
        <StatCard label="Today Returns" value={num(d?.todayReturns ?? 0)} icon={RotateCcw} color="orange" href={p('/returns')} />
        <StatCard label="Today Cancelled" value={num(tday.cancelled)} icon={CircleX} color="red" />
      </div>

      {/* Trend + order status */}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Revenue & Orders Trend" subtitle={sub} className="xl:col-span-2 min-w-0">
          <div className="h-[330px] w-full relative">
            {isLoading && !d ? <div className="h-full flex items-center justify-center text-sm text-muted">Loading…</div> : (
              <Chart type="area" height={330}
                series={[{ name: 'Revenue', data: trend.revenue }, { name: 'Orders', data: trend.orders }]}
                options={{
                  chart: { foreColor: axis, zoom: { enabled: false }, toolbar: { show: false } },
                  colors: ['#0E9623', '#34C759'],
                  stroke: { curve: 'smooth', width: [2.5, 2] },
                  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.22, opacityTo: 0.02, stops: [0, 95] } },
                  legend: { position: 'top', horizontalAlign: 'right', markers: { shape: 'circle' } as any },
                  grid: { borderColor: gridC, strokeDashArray: 4 },
                  xaxis: { categories: trend.labels, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { fontSize: '11px' }, rotate: 0, hideOverlappingLabels: true } },
                  yaxis: [
                    { seriesName: 'Revenue', min: 0, labels: { formatter: (v: number) => Math.round(v).toLocaleString() } },
                    { seriesName: 'Orders', opposite: true, min: 0, labels: { formatter: (v: number) => String(Math.round(v)) } },
                  ],
                  tooltip: { shared: true, y: [{ formatter: (v: number) => sym + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }) }, { formatter: (v: number) => `${v} orders` }] as any },
                }} />
            )}
          </div>
        </Card>
        <Card title="Order Status" subtitle={sub}>
          <div className="space-y-3.5 max-h-[330px] overflow-y-auto scrollbar-thin pr-2">
            {STATUSES.map(([key, label, Icon, color]) => {
              const cnt = Number(statusCounts[key] || 0);
              return (
                <Link key={key} href={p(`/orders?status=${key}`)} className="flex items-center gap-3 group">
                  <span className={cx('w-9 h-9 shrink-0 rounded-lg flex items-center justify-center', TILE[color])}><Icon className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex justify-between text-[13px]"><span className="text-navy dark:text-slate-200 group-hover:text-primary">{label}</span><b className="text-navy dark:text-white">{num(cnt)}</b></span>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <span className={cx('block h-full rounded-full', BAR[color])} style={{ width: `${cnt ? Math.max(4, Math.round((cnt / maxStatus) * 100)) : 0}%` }} />
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Metric cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {metrics.map(([label, value, icon, color, g, suffix]) => <MetricCard key={label} label={label} value={value} icon={icon} color={color} growth={g} suffix={suffix} />)}
      </div>

      {/* Category / modes / inventory */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Sales by Category" subtitle={sub}>
          {catSeries.length ? (
            <div className="h-[300px]">
              <Chart type="donut" height={300} series={catSeries} options={{
                labels: catLabels, chart: { foreColor: axis },
                colors: ['#F59E0B', '#8B5CF6', '#0E9623', '#3B82F6', '#EC4899', '#14B8A6'],
                legend: { position: 'bottom', fontSize: '12px', horizontalAlign: 'center' }, dataLabels: { enabled: false },
                stroke: { width: 2, colors: [dark ? '#1E293B' : '#fff'] },
                plotOptions: { pie: { donut: { size: '62%', labels: { show: true, total: { show: true, label: 'Total', formatter: (w: any) => sym + w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) } } } } },
                tooltip: { y: { formatter: (v: number) => sym + Number(v).toLocaleString() } },
              }} />
            </div>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted text-sm"><ChartPie className="w-9 h-9 text-slate-300 mb-2" />No sales in this period</div>
          )}
        </Card>

        <Card title="Quick vs eCommerce" subtitle={sub}>
          <div className="grid grid-cols-2 gap-3">
            {([['Quick', quick, Zap, 'bg-primary-50 text-primary', 'bg-primary'], ['eCommerce', ecom, ShoppingBag, 'bg-orange-50 text-orange-500', 'bg-orange-400']] as const).map(([lbl, m, Ic, cls, bar]) => (
              <div key={lbl} className="rounded-xl border border-line dark:border-dark-line p-3.5">
                <div className="flex items-center gap-2">
                  <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center', cls)}><Ic className="w-4 h-4" /></span>
                  <span className="font-bold text-navy dark:text-white">{lbl}</span>
                </div>
                <div className="mt-3 text-lg font-extrabold text-navy dark:text-white">{money(m.revenue)}</div>
                <div className="text-xs text-muted">{num(m.orders)} orders</div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700"><div className={cx('h-full rounded-full', bar)} style={{ width: `${Math.round((m.revenue / modeTotal) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="h-[190px] mt-2">
            <Chart type="bar" height={190} series={[{ name: 'Orders', data: [quick.orders, ecom.orders] }]} options={{
              chart: { foreColor: axis }, colors: ['#0E9623', '#FB923C'],
              plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '45%', distributed: true } },
              legend: { show: false }, dataLabels: { enabled: true, style: { fontSize: '11px' } },
              grid: { borderColor: gridC, strokeDashArray: 4 }, xaxis: { categories: ['Quick', 'eCommerce'] },
            }} />
          </div>
        </Card>

        <Card title="Inventory Health" subtitle={`${num(inv.total)} Total SKUs`}>
          <div className="space-y-4">
            {([['In Stock', inv.in, CircleCheck, 'bg-emerald-50 text-emerald-600', 'bg-primary'], ['Low Stock', inv.low, TriangleAlert, 'bg-amber-50 text-amber-500', 'bg-amber-500'], ['Out of Stock', inv.out, CircleX, 'bg-red-50 text-red-500', 'bg-red-500']] as const).map(([lbl, v, Ic, cls, bar]) => (
              <div key={lbl} className="flex items-center gap-3">
                <span className={cx('w-9 h-9 rounded-lg flex items-center justify-center', cls)}><Ic className="w-4 h-4" /></span>
                <div className="flex-1">
                  <div className="flex justify-between text-[13px]"><span className="text-navy dark:text-slate-200">{lbl}</span><b className="text-navy dark:text-white">{num(v)}</b></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700"><div className={cx('h-full rounded-full', bar)} style={{ width: `${Math.round((v / invTotal) * 100)}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line dark:border-dark-line pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Low stock alerts</span>
              <Link href={p('/stock?stock=low')} className="text-xs font-semibold text-primary">Manage</Link>
            </div>
            <div className="space-y-2">
              {(d?.lowStock ?? []).length ? d!.lowStock.map((v) => (
                <div key={v.key} className="flex items-center gap-2.5">
                  <img src={imgUrl(v.thumb, 'P')} className="w-8 h-8 rounded-md object-cover bg-slate-50 border border-line" alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-navy dark:text-slate-200 truncate">{v.name}</div>
                    <div className="text-[11px] text-muted">{v.variant}{v.sku ? ` · ${v.sku}` : ''}</div>
                  </div>
                  <span className={cx('pill', v.stock <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>{v.stock <= 0 ? 'Out' : `${v.stock} left`}</span>
                </div>
              )) : <div className="text-sm text-muted">All items are well stocked.</div>}
            </div>
          </div>
        </Card>
      </div>

      {/* Top performers */}
      <div className={cx('mt-5 grid gap-5', isStore ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
        {!isStore && (
          <Card title="Highest Revenue Stores" subtitle="All Time">
            <div className="space-y-3.5">
              {(d?.topStores ?? []).length ? d!.topStores.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-navy dark:text-white flex items-center justify-center">{i + 1}</span>
                  <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center"><StoreIcon className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy dark:text-white truncate">{s.name || `Store #${s.id}`}</div>
                    <div className="text-xs text-muted">{num(s.orders_count)} Orders</div>
                  </div>
                  <b className="text-sm text-navy dark:text-white">{money(s.revenue)}</b>
                </div>
              )) : <div className="text-sm text-muted">No store sales yet.</div>}
            </div>
          </Card>
        )}

        <Card title="Top Rated Products">
          <div className="space-y-3.5">
            {(d?.topProducts ?? []).length ? d!.topProducts.map((pr) => (
              <div key={pr.id} className="flex items-center gap-3">
                <img src={imgUrl(pr.thumbnail || pr.images?.[0], 'P')} className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-line" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-navy dark:text-white truncate">{tr(pr.name, uiLang)}</div>
                  <div className="text-xs text-muted">{num(pr.rating_count)} Reviews</div>
                </div>
                <span className="pill bg-amber-50 text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{Number(pr.rating_avg || 0).toFixed(1)}</span>
              </div>
            )) : <div className="text-sm text-muted">No rated products yet.</div>}
          </div>
        </Card>

        <Card title="Top Customers" subtitle={isStore ? sub : 'All Time'}>
          <div className="space-y-3.5">
            {(d?.topCustomers ?? []).length ? d!.topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-navy dark:text-white flex items-center justify-center">{i + 1}</span>
                <span className="w-9 h-9 rounded-full bg-primary-50 text-primary flex items-center justify-center font-bold text-sm">{(c.name || 'C').slice(0, 1).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-navy dark:text-white truncate">{c.name}</div>
                  <div className="text-xs text-muted">{maskPhone(c.phone)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-navy dark:text-white">{num(c.orders)} Orders</div>
                  <div className="text-xs text-muted">{money(c.spent)}</div>
                </div>
              </div>
            )) : <div className="text-sm text-muted">No customer orders yet.</div>}
          </div>
        </Card>
      </div>

      {/* Recent orders */}
      <Card title="Recent Orders" className="mt-5" padding={false} actions={<Link href={p('/orders')} className="btn-soft btn-sm">View All</Link>}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Order</th><th>Customer</th><th>Mode</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {(d?.recent ?? []).length ? d!.recent.map((o) => (
                <tr key={o.id}>
                  <td><Link href={p(`/orders/view/${o.id}`)} className="font-semibold text-primary hover:underline">{o.order_number || o.id}</Link></td>
                  <td>{o.customer?.name || '—'}</td>
                  <td><StatusPill status={o.mode} /></td>
                  <td className="font-semibold text-navy dark:text-white">{money(o.totals?.grand_total ?? o.totals?.total)}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td className="whitespace-nowrap text-muted">{fmtDateTime(o.created_at)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="!py-10 text-center text-muted">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
