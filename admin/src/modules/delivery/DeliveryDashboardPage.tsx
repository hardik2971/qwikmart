'use client';
// Delivery boy dashboard — port of delivery/dashboard.blade.php + DeliveryPanel\DashboardController.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { Banknote, Bike, Coins, Inbox, MessagesSquare, PackageCheck, Radar, RotateCcw, TrendingUp, Wallet, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { q, useLiveQuery, useZones, where, orderBy } from '@/lib/firestore';
import { fmtDate, greeting, money, toDate, errMsg } from '@/lib/format';
import { acceptOrder, setOnline } from '@/lib/callables';
import type { DeliveryBoy, DeliveryEarning, Order } from '@/lib/types';
import { Card, StatCard, cx } from '@/components/ui';
import { Chart } from '@/components/ui/Chart';
import { useToast } from '@/components/ui/toast';
import { ApprovalNotice, OrderCard, RiderGate, useStoreMap } from './shared';
import { useRiderOrders } from './useRiderOrders';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function DeliveryDashboardPage() {
  return <RiderGate>{(r) => <Dashboard {...r} />}</RiderGate>;
}

function Dashboard({ uid, boy, approved, zoneId }: { uid: string; boy: DeliveryBoy; approved: boolean; zoneId: string | null }) {
  const { profile, user } = useAuth();
  const { p } = usePanel();
  const toast = useToast();
  const { data: zones = [] } = useZones();
  const stores = useStoreMap();
  const { available, active, history, loading } = useRiderOrders(uid, zoneId, approved);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'available' | 'active' | 'history' | null>(null);
  const curTab = tab ?? (active.length ? 'active' : 'available');

  const from7 = useMemo(() => { const d = startOfDay(new Date()); d.setDate(d.getDate() - 6); return d; }, []);
  const earn = useLiveQuery<DeliveryEarning>(q('delivery_earnings', where('delivery_boy_id', '==', uid), where('created_at', '>=', Timestamp.fromDate(from7)), orderBy('created_at', 'desc')), [uid, from7.getTime()]);

  const today0 = startOfDay(new Date()).getTime();
  const todayEarnings = earn.data.filter((e) => (toDate(e.created_at)?.getTime() ?? 0) >= today0).reduce((s, e) => s + Number(e.amount || 0), 0);
  const deliveredToday = history.filter((o) => o.status === 'delivered' && (toDate(o.delivered_at)?.getTime() ?? 0) >= today0).length;

  const chart = useMemo(() => {
    const labels: string[] = []; const values: number[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(from7); d.setDate(d.getDate() + i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      labels.push(`${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`);
      values.push(Math.round(earn.data.filter((e) => { const t = toDate(e.created_at); return t && t >= d && t < next; }).reduce((s, e) => s + Number(e.amount || 0), 0) * 100) / 100);
    }
    return { labels, values };
  }, [earn.data, from7]);

  const online = !!boy.is_online;
  const toggle = async () => {
    if (!online && !approved) { toast('Your account must be approved before you can go online.', 'error'); return; }
    setBusy(true);
    try { await setOnline({ is_online: !online }); toast(!online ? 'You are now online and can receive orders.' : 'You are now offline.'); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const accept = async (o: Order) => {
    setBusy(true);
    try { await acceptOrder({ order_id: o.id }); toast('Order accepted'); setTab('active'); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  const zone = zones.find((z) => z.id === boy.zone_id);
  const lists = { available, active, history: history.slice(0, 6) } as Record<string, Order[]>;
  const sym = money(0).replace(/[\d.,\s]/g, '');
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Welcome, {profile?.name || user?.displayName || 'Partner'}</h1>
          <p className="text-sm text-primary font-medium mt-0.5">{greeting()} · {fmtDate(new Date())}{zone ? ` · ${zone.name}` : ''}</p>
        </div>
        <div className="card flex items-center gap-3 px-4 py-2.5">
          <span className="relative flex w-2.5 h-2.5">
            {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />}
            <span className={cx('relative inline-flex rounded-full w-2.5 h-2.5', online ? 'bg-primary' : 'bg-slate-400')} />
          </span>
          <span className="text-sm font-semibold text-navy dark:text-white">{online ? 'You are Online' : 'You are Offline'}</span>
          <button type="button" className={cx('toggle', online && 'toggle-on')} title={online ? 'Go offline' : 'Go online'} disabled={busy || (!approved && !online)} onClick={toggle} data-testid="toggle-online">
            <span className="toggle-dot" />
          </button>
        </div>
      </div>

      <ApprovalNotice boy={boy} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
        <StatCard label="Today Earnings" value={money(todayEarnings)} icon={Coins} color="green" href={p('/earnings')} />
        <StatCard label="Cash in Hand" value={money(boy.cash_in_hand)} icon={Banknote} color="orange" href={p('/cash')} />
        <StatCard label="Active Orders" value={active.length} icon={Bike} color="blue" href={p('/orders?type=active')} />
        <StatCard label="Delivered Today" value={deliveredToday} icon={PackageCheck} color="purple" href={p('/orders?type=history')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h3 className="card-title">Orders</h3>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button type="button" className={cx('tab', curTab === 'available' && 'tab-active')} onClick={() => setTab('available')}>Available <span className="ml-1 text-xs opacity-70">{available.length}</span></button>
                <button type="button" className={cx('tab', curTab === 'active' && 'tab-active')} onClick={() => setTab('active')}>Active <span className="ml-1 text-xs opacity-70">{active.length}</span></button>
                <button type="button" className={cx('tab', curTab === 'history' && 'tab-active')} onClick={() => setTab('history')}>History</button>
              </div>
            </div>
            <div className="p-5">
              {loading && !lists[curTab].length ? <div className="py-12 text-center text-muted text-sm">Loading…</div> : !lists[curTab].length ? (
                <div className="py-12 text-center text-muted text-sm flex flex-col items-center gap-2">
                  {curTab === 'available' ? <Radar className="w-9 h-9 text-slate-300" /> : <Inbox className="w-9 h-9 text-slate-300" />}
                  {curTab === 'available'
                    ? (!approved ? 'Orders will appear here once your account is approved.' : online ? 'No orders waiting in your zone right now.' : 'Go online to start receiving orders.')
                    : curTab === 'active' ? 'No active deliveries. Accept an available order to get started.' : 'No completed deliveries yet.'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lists[curTab].slice(0, 6).map((o) => <OrderCard key={o.id} order={o} type={curTab} store={o.store_id ? stores[o.store_id] : null} onAccept={accept} busy={busy} />)}
                  </div>
                  <div className="mt-4 text-center">
                    <Link href={p(`/orders?type=${curTab}`)} className="text-sm font-semibold text-primary hover:underline">View all {curTab} orders →</Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <Card title="Earnings" subtitle="Last 7 days" icon={TrendingUp} actions={<Link href={p('/earnings')} className="btn-soft btn-sm">Details</Link>}>
            <div className="-mx-2 min-h-[220px]">
              <Chart type="bar" height={220} series={[{ name: 'Earnings', data: chart.values }]} options={{
                chart: { foreColor: dark ? '#94A3B8' : '#7C8DB5' },
                xaxis: { categories: chart.labels, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis: { labels: { formatter: (v: number) => sym + Math.round(v) } }, colors: ['#0E9623'],
                plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } }, dataLabels: { enabled: false },
                grid: { borderColor: dark ? '#334155' : '#E6EAF2', strokeDashArray: 4 },
                tooltip: { y: { formatter: (v: number) => sym + Number(v).toFixed(2) } },
              }} />
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-line dark:border-dark-line">
              <span className="text-muted">7-day total</span>
              <span className="font-extrabold text-navy dark:text-white">{money(chart.values.reduce((a, b) => a + b, 0))}</span>
            </div>
          </Card>

          <Card title="Quick Links" icon={Zap}>
            <div className="grid grid-cols-2 gap-3">
              {([['Return Pickups', RotateCcw, '/returns'], ['Wallet', Wallet, '/wallet'], ['Cash Collection', Banknote, '/cash'], ['Support Chat', MessagesSquare, '/chat']] as const).map(([lbl, Ic, href]) => (
                <Link key={href} href={p(href)} className="flex flex-col items-center gap-2 rounded-xl border border-line dark:border-dark-line p-3 text-center hover:border-primary hover:bg-primary-50/50 transition">
                  <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><Ic className="w-4 h-4" /></span>
                  <span className="text-xs font-semibold text-navy dark:text-white">{lbl}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
