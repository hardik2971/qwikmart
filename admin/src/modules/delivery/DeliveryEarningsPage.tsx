'use client';
// Earnings — port of delivery/earnings/index.blade.php.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarRange, ClipboardList, Sun, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { q, useLiveQuery, where, orderBy, limit } from '@/lib/firestore';
import { fmtDateTime, money, toDate } from '@/lib/format';
import type { DeliveryBoy, DeliveryEarning, Order } from '@/lib/types';
import { Card, Loading, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { Chart } from '@/components/ui/Chart';
import { SearchBox } from '@/components/form/fields';
import { fetchReadable, orderTotal, RiderGate } from './shared';

const PAGE = 20;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DeliveryEarningsPage() {
  return <RiderGate>{(r) => <Earnings uid={r.uid} boy={r.boy} />}</RiderGate>;
}

function Earnings({ uid, boy }: { uid: string; boy: DeliveryBoy }) {
  const { p } = usePanel();
  const { data, loading, error } = useLiveQuery<DeliveryEarning>(q('delivery_earnings', where('delivery_boy_id', '==', uid), orderBy('created_at', 'desc'), limit(1000)), [uid]);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const ids = [...new Set(data.slice(0, 200).map((e) => e.order_id).filter(Boolean))].sort().join(',');
  useEffect(() => { if (ids) fetchReadable<Order>('orders', ids.split(',')).then(setOrders); }, [ids]);

  const totals = useMemo(() => {
    const now = new Date(); const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const w0 = new Date(d0); w0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (f: (e: DeliveryEarning) => boolean) => data.filter(f).reduce((s, e) => s + Number(e.amount || 0), 0);
    const at = (e: DeliveryEarning) => toDate(e.created_at)?.getTime() ?? 0;
    return {
      today: sum((e) => at(e) >= d0.getTime()), week: sum((e) => at(e) >= w0.getTime()), month: sum((e) => at(e) >= m0.getTime()), all: sum(() => true),
      pending: sum((e) => e.status === 'pending'), paid: sum((e) => e.status !== 'pending'),
      deliveries: data.filter((e) => e.type === 'commission' && e.order_id).length,
      byType: { commission: sum((e) => e.type === 'commission'), bonus: sum((e) => e.type === 'bonus'), salary: sum((e) => e.type === 'salary') },
    };
  }, [data]);

  const chart = useMemo(() => {
    const labels: string[] = []; const values: number[] = [];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 29);
    const buckets: Record<string, number> = {};
    for (const e of data) { const d = toDate(e.created_at); if (d && d >= start) { const k = d.toDateString(); buckets[k] = (buckets[k] || 0) + Number(e.amount || 0); } }
    for (let i = 0; i < 30; i++) { const d = new Date(start); d.setDate(start.getDate() + i); labels.push(`${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`); values.push(Math.round((buckets[d.toDateString()] || 0) * 100) / 100); }
    return { labels, values };
  }, [data]);

  const t = term.trim().toLowerCase();
  const rows = data.filter((e) => (!type || e.type === type) && (!status || (status === 'pending' ? e.status === 'pending' : e.status !== 'pending'))
    && (!t || (orders[e.order_id || '']?.order_number || e.order_id || '').toLowerCase().includes(t)));
  const commission = boy.commission_type === 'percent' ? `${Number(boy.commission_value || 0)}% of order value` : `${money(boy.commission_value)} per delivery`;
  const sym = money(0).replace(/[\d.,\s]/g, '');
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div>
      <PageHeader title="Earnings" subtitle={`Commission: ${commission}`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
        <StatCard label="Today" value={money(totals.today)} icon={Sun} color="green" />
        <StatCard label="This Week" value={money(totals.week)} icon={CalendarDays} color="blue" />
        <StatCard label="This Month" value={money(totals.month)} icon={CalendarRange} color="purple" />
        <StatCard label="All Time" value={money(totals.all)} icon={Trophy} color="orange" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <Card title="Earnings Trend" subtitle="Last 30 days" icon={TrendingUp} className="xl:col-span-2 min-w-0">
          <div className="-mx-2 min-h-[260px]">
            <Chart type="area" height={260} series={[{ name: 'Earnings', data: chart.values }]} options={{
              chart: { foreColor: dark ? '#94A3B8' : '#7C8DB5' },
              xaxis: { categories: chart.labels, tickAmount: 10, axisBorder: { show: false }, axisTicks: { show: false } },
              yaxis: { min: 0, labels: { formatter: (v: number) => sym + Math.round(v) } }, colors: ['#0E9623'],
              stroke: { curve: 'smooth', width: 3 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
              dataLabels: { enabled: false }, grid: { borderColor: dark ? '#334155' : '#E6EAF2', strokeDashArray: 4 },
              tooltip: { y: { formatter: (v: number) => sym + Number(v).toFixed(2) } },
            }} />
          </div>
        </Card>
        <Card title="Summary" icon={ClipboardList}>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Deliveries completed</dt><dd className="font-bold text-navy dark:text-white">{totals.deliveries}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Pending payout</dt><dd className="font-bold text-amber-600">{money(totals.pending)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid out</dt><dd className="font-bold text-primary">{money(totals.paid)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Avg per delivery</dt><dd className="font-bold text-navy dark:text-white">{money(totals.deliveries ? totals.byType.commission / totals.deliveries : 0)}</dd></div>
            <div className="flex justify-between pt-3 border-t border-line dark:border-dark-line"><dt className="text-muted">Commission</dt><dd className="font-semibold text-navy dark:text-white">{money(totals.byType.commission)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Bonus</dt><dd className="font-semibold text-navy dark:text-white">{money(totals.byType.bonus)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Salary</dt><dd className="font-semibold text-navy dark:text-white">{money(totals.byType.salary)}</dd></div>
            {Number(boy.salary || 0) > 0 && <div className="flex justify-between"><dt className="text-muted">Monthly salary</dt><dd className="font-bold text-navy dark:text-white">{money(boy.salary)}</dd></div>}
          </dl>
          <Link href={p('/wallet')} className="btn-soft w-full justify-center mt-5"><Wallet className="w-4 h-4" /> Go to Wallet</Link>
        </Card>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line dark:border-dark-line">
          <select value={type} onChange={(e) => { setType(e.target.value); setShown(PAGE); }} className="input !w-40 !py-2">
            <option value="">All Types</option><option value="commission">Commission</option><option value="bonus">Bonus</option><option value="salary">Salary</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setShown(PAGE); }} className="input !w-40 !py-2">
            <option value="">All Statuses</option><option value="pending">Pending</option><option value="paid">Paid / Credited</option>
          </select>
          <SearchBox value={term} onChange={setTerm} placeholder="Search order #" className="w-56 ml-auto" />
        </div>
        {loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Order</th><th>Order Total</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((e) => {
                  const o = e.order_id ? orders[e.order_id] : undefined;
                  return (
                    <tr key={e.id}>
                      <td className="font-semibold text-navy dark:text-white">#{e.id.slice(0, 8)}</td>
                      <td>{e.order_id ? <Link href={p(`/orders/view/${e.order_id}`)} className="font-medium text-primary hover:underline">{o?.order_number || e.order_id}</Link> : '-'}</td>
                      <td>{o ? money(orderTotal(o)) : '-'}</td>
                      <td className="capitalize">{e.type}</td>
                      <td className="font-bold text-primary">+{money(e.amount)}</td>
                      <td><StatusPill status={e.status} /></td>
                      <td className="whitespace-nowrap text-muted">{fmtDateTime(e.created_at)}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={7} className="!py-12 text-center text-muted">{error ? 'Could not load earnings.' : 'No earnings yet. Deliver orders to start earning.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && <div className="p-4 text-center border-t border-line dark:border-dark-line"><button type="button" className="btn-soft btn-sm" onClick={() => setShown(shown + PAGE)}>Load more</button></div>}
      </div>
    </div>
  );
}
