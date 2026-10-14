'use client';
// Delivery Boy Earnings / Payouts — port of admin/delivery-earnings/index.blade.php.
// "By Delivery Boy" summary (pay pending / bonus / salary → payEarnings) + earning history ledger.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { BadgeCheck, Gift, History, Hourglass, Send, TrendingUp } from 'lucide-react';
import { fetchList, useCountries, useZones, where, aggregateDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { DeliveryEarning } from '@/lib/types';
import { fmtDateTime, money, statusLabel } from '@/lib/format';
import { cx, Forbidden, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { DataTable, opts } from '@/components/ui/DataTable';
import { LocalTable, useAll } from '@/modules/locations/LocalTable';
import { loadRiders, UserCell, type Rider } from './shared';
import { PayoutModal } from './RiderMoneyModals';

type Row = Rider & { pending_amount: number; paid_amount: number; total_earned: number; entries: number };
const sumOf = (...c: ReturnType<typeof where>[]) => aggregateDocs('delivery_earnings', c, { sum: { s: 'amount' } }).then((r) => Number(r.s || 0)).catch(() => 0);

export default function DeliveryEarningsPage() {
  const { can } = useAuth();
  const { p, countryId } = usePanel();
  const sp = useSearchParams();
  const router = useRouter();
  const tab = sp.get('tab') === 'history' ? 'history' : 'summary';
  const boyFilter = sp.get('delivery_boy_id') || '';
  const { data: countries = [] } = useCountries();
  const { data: zones = [] } = useZones();
  const [tick, setTick] = useState(0);
  const [totals, setTotals] = useState({ earned: 0, pending: 0, paid: 0, bonus: 0 });
  const [pay, setPay] = useState<{ boy: Row; mode: 'pending' | 'entry' } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { rows, loading, error, reload } = useAll<Row>(async () => {
    const [riders, pending] = await Promise.all([
      loadRiders(...(countryId ? [where('country_id', '==', countryId)] : [])),
      fetchList<DeliveryEarning>('delivery_earnings', where('status', '==', 'pending')),
    ]);
    const pend: Record<string, { a: number; n: number }> = {};
    pending.forEach((e) => { const x = (pend[e.delivery_boy_id] ??= { a: 0, n: 0 }); x.a += Number(e.amount || 0); x.n++; });
    return riders.map((r) => {
      const pa = pend[r.id]?.a || 0; const tot = Number(r.earnings_total || 0);
      return { ...r, pending_amount: Math.round(pa * 100) / 100, total_earned: tot, paid_amount: Math.max(0, Math.round((tot - pa) * 100) / 100), entries: pend[r.id]?.n || 0 };
    });
  }, [countryId, tick]);

  useEffect(() => {
    Promise.all([sumOf(), sumOf(where('status', '==', 'pending')), sumOf(where('status', 'in', ['paid', 'credited'])), sumOf(where('type', '==', 'bonus'))])
      .then(([earned, pending, paid, bonus]) => setTotals({ earned, pending, paid, bonus }));
  }, [tick]);

  const zName = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.name])), [zones]);
  const riderMap = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows]);
  if (!can('delivery_boy.list')) return <Forbidden />;
  const setTab = (t: string) => router.replace(p(`/delivery-earnings?tab=${t}`));
  const refresh = () => { setTick((t) => t + 1); reload(); };

  return (
    <div>
      <PageHeader title="Delivery Boy Earnings" subtitle="Commissions, bonuses and salary payouts" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <StatCard label="Total Earned" value={money(totals.earned)} icon={TrendingUp} color="blue" />
        <StatCard label="Pending Payout" value={money(totals.pending)} icon={Hourglass} color="orange" />
        <StatCard label="Paid" value={money(totals.paid)} icon={BadgeCheck} color="green" />
        <StatCard label="Bonuses" value={money(totals.bonus)} icon={Gift} color="purple" />
      </div>

      <div className="flex gap-1 mb-3 border-b border-line dark:border-dark-line">
        <button type="button" className={cx('tab', tab === 'summary' && 'tab-active')} onClick={() => setTab('summary')}>By Delivery Boy</button>
        <button type="button" className={cx('tab', tab === 'history' && 'tab-active')} onClick={() => setTab('history')}>Earning History</button>
      </div>

      {tab === 'summary' ? (
        <LocalTable<Row>
          rows={rows} loading={loading} error={error} onRefresh={refresh} search="Search delivery boy" defaultSort={{ field: 'pending_amount', dir: 'desc' }}
          searchText={(r) => `${r.name ?? ''} ${r.phone ?? ''} ${r.email ?? ''}`}
          filters={[
            ...(!countryId ? [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name) }] : []),
            { key: 'has', placeholder: 'All delivery boys', options: [{ value: 'has_pending', label: 'With pending payout' }], test: (r: Row) => r.pending_amount > 0 },
          ]}
          columns={[
            {
              key: 'name', header: 'Delivery Boy', sort: 'name', render: (r) => (
                <UserCell user={r} href={p(`/delivery-boys/view/${r.id}`)} sub={`${zName[r.zone_id || ''] ?? '—'} · ${r.commission_type === 'percent' ? `${Number(r.commission_value || 0)}%` : money(r.commission_value)}/order`} />
              ),
            },
            { key: 'entries', header: 'Pending Entries', sort: 'entries' },
            { key: 'total_earned', header: 'Total Earned', sort: 'total_earned', render: (r) => <span className="font-semibold">{money(r.total_earned)}</span> },
            { key: 'pending_amount', header: 'Pending', sort: 'pending_amount', render: (r) => <span className="font-semibold text-amber-600">{money(r.pending_amount)}</span> },
            { key: 'paid_amount', header: 'Paid', sort: 'paid_amount', render: (r) => <span className="font-semibold text-primary">{money(r.paid_amount)}</span> },
            {
              key: 'actions', header: 'Actions', align: 'right', render: (r) => (
                <div className="flex justify-end gap-1.5">
                  <Link href={p(`/delivery-earnings?tab=history&delivery_boy_id=${r.id}`)} className="icon-btn" title="History"><History className="w-4 h-4" /></Link>
                  {can('delivery_boy.update') && (
                    <>
                      <button type="button" className="icon-btn" title="Add bonus / salary" onClick={() => setPay({ boy: r, mode: 'entry' })}><Gift className="w-4 h-4" /></button>
                      <button type="button" className="btn-primary btn-sm" disabled={r.pending_amount <= 0} onClick={() => setPay({ boy: r, mode: 'pending' })}><Send className="w-3.5 h-3.5" /> Pay</button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <DataTable<DeliveryEarning>
          path="delivery_earnings" refreshKey={tick} initialFilters={boyFilter ? { delivery_boy_id: boyFilter } : {}}
          constraints={[
            ...(from ? [where('created_at', '>=', Timestamp.fromDate(new Date(from + 'T00:00:00')))] : []),
            ...(to ? [where('created_at', '<=', Timestamp.fromDate(new Date(to + 'T23:59:59')))] : []),
          ]}
          deps={[from, to]}
          filters={[
            { key: 'delivery_boy_id', placeholder: 'All delivery boys', options: opts(rows, (r) => r.name || r.id) },
            { key: 'type', placeholder: 'All Types', options: ['commission', 'bonus', 'salary'].map((t) => ({ value: t, label: statusLabel(t) })) },
            { key: 'status', placeholder: 'All Statuses', options: [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid / Credited' }], toConstraints: (v) => [v === 'paid' ? where('status', 'in', ['paid', 'credited']) : where('status', '==', v)] },
          ]}
          filterExtra={<>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-40 !py-2" title="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-40 !py-2" title="To date" />
          </>}
          columns={[
            { key: 'boy', header: 'Delivery Boy', render: (e) => { const r = riderMap[e.delivery_boy_id]; return r ? <Link href={p(`/delivery-boys/view/${r.id}`)} className="font-medium hover:text-primary">{r.name}</Link> : <span className="text-muted">{e.delivery_boy_id}</span>; } },
            { key: 'order', header: 'Order', render: (e) => (e.order_id ? <Link href={p(`/orders/view/${e.order_id}`)} className="text-primary font-semibold">#{e.order_id}</Link> : '—') },
            { key: 'type', header: 'Type', render: (e) => <StatusPill status={e.type === 'commission' ? 'info' : e.type === 'bonus' ? 'shipped' : 'pending'} label={statusLabel(e.type)} /> },
            { key: 'amount', header: 'Amount', render: (e) => <span className="font-semibold">{money(e.amount)}</span> },
            { key: 'status', header: 'Status', render: (e) => <StatusPill status={e.status === 'paid' || e.status === 'credited' ? 'success' : 'pending'} label={statusLabel(e.status)} /> },
            { key: 'created_at', header: 'Date', sort: 'created_at', render: (e) => <span className="text-xs text-muted whitespace-nowrap">{fmtDateTime(e.created_at)}</span> },
          ]}
        />
      )}

      <PayoutModal open={!!pay} onClose={() => setPay(null)} boy={pay ? { id: pay.boy.id, name: pay.boy.name } : null} pending={pay?.boy.pending_amount || 0} initialMode={pay?.mode} onDone={refresh} />
    </div>
  );
}
