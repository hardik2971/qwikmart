'use client';
// Cash Collection — port of admin/cash-collections/index.blade.php. Tabs: riders holding cash (collect → collectCash) and the
// cash_collections ledger. Store panel: riders of the store's zone only.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { Banknote, Bike, Plus } from 'lucide-react';
import { useCountries, where } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { CashCollection } from '@/lib/types';
import { fmtDateTime, money, num } from '@/lib/format';
import { cx, Forbidden, Loading, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { DataTable, opts } from '@/components/ui/DataTable';
import { LocalTable, useAll } from '@/modules/locations/LocalTable';
import { loadRiders, UserCell, useStoreZone, type Rider } from './shared';
import { CollectCashModal, type CashTarget } from './RiderMoneyModals';

export default function CashCollectionsPage() {
  const { can } = useAuth();
  const { p, countryId, isStore } = usePanel();
  const sp = useSearchParams();
  const router = useRouter();
  // store users cannot read the cash ledger (firestore.rules) → riders holding cash + Collect only
  const tab = sp.get('tab') === 'transactions' && !isStore ? 'transactions' : 'pending';
  const { zoneId, loading: zLoading } = useStoreZone();
  const { data: countries = [] } = useCountries();
  const scope = isStore ? (zoneId ? [where('zone_id', '==', zoneId)] : null) : countryId ? [where('country_id', '==', countryId)] : [];
  const { rows: riders, loading, error, reload } = useAll(() => (scope ? loadRiders(...scope) : Promise.resolve([] as Rider[])), [isStore, zoneId, countryId]);
  const holding = useMemo(() => riders.filter((r) => Number(r.cash_in_hand) > 0), [riders]);
  const total = holding.reduce((s, r) => s + Number(r.cash_in_hand || 0), 0);
  const riderMap = useMemo(() => Object.fromEntries(riders.map((r) => [r.id, r])), [riders]);
  const [modal, setModal] = useState<{ initial: CashTarget | null } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const boyFilter = sp.get('delivery_boy_id') || '';

  if (!can('delivery_boy.list')) return <Forbidden />;
  if (isStore && zLoading) return <Loading />;
  const targets: CashTarget[] = holding.map((r) => ({ id: r.id, name: r.name, cash: Number(r.cash_in_hand || 0) }));
  const setTab = (t: string) => router.replace(p(`/cash-collections?tab=${t}`));

  // Store panel: ledger limited to the zone's riders (Firestore `in` supports 30 values).
  const storeIds = riders.map((r) => r.id).slice(0, 30);
  const txConstraints = [
    ...(isStore ? [where('delivery_boy_id', 'in', storeIds.length ? storeIds : ['__none__'])] : []),
    ...(from ? [where('created_at', '>=', Timestamp.fromDate(new Date(from + 'T00:00:00')))] : []),
    ...(to ? [where('created_at', '<=', Timestamp.fromDate(new Date(to + 'T23:59:59')))] : []),
  ];

  return (
    <div>
      <PageHeader title="Cash Collection List" subtitle={isStore ? 'Cash on delivery collected by delivery boys for your orders' : undefined}>
        {can('delivery_boy.update') && <button type="button" className="btn-primary" data-testid="add-cash-collection" onClick={() => setModal({ initial: null })}><Plus className="w-4 h-4" /> Add Cash Collection</button>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <StatCard label="Total Cash in Hand (pending)" value={money(total)} icon={Banknote} color="red" />
        <StatCard label="Delivery Boys Holding Cash" value={num(holding.length)} icon={Bike} color="orange" />
      </div>

      <div className="flex gap-1 mb-3 border-b border-line dark:border-dark-line">
        <button type="button" className={cx('tab', tab === 'pending' && 'tab-active')} onClick={() => setTab('pending')}>Pending Collections</button>
        {!isStore && <button type="button" className={cx('tab', tab === 'transactions' && 'tab-active')} onClick={() => setTab('transactions')}>Transactions</button>}
      </div>

      {tab === 'pending' ? (
        <LocalTable<Rider>
          rows={holding} loading={loading} error={error} onRefresh={reload} search="Search delivery boy" defaultSort={{ field: 'cash_in_hand', dir: 'desc' }}
          searchText={(r) => `${r.name ?? ''} ${r.phone ?? ''} ${r.email ?? ''}`} empty="No delivery boy is holding cash."
          filters={!isStore && !countryId ? [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name) }] : []}
          columns={[
            { key: 'name', header: 'Name', sort: 'name', render: (r) => <UserCell user={r} href={p(`/delivery-boys/view/${r.id}`)} /> },
            { key: 'phone', header: 'Mobile', render: (r) => <span className="whitespace-nowrap">{r.phone || '—'}</span> },
            { key: 'cash_in_hand', header: 'Cash in Hand', sort: 'cash_in_hand', render: (r) => <span className="font-bold text-red-500">{money(r.cash_in_hand)}</span> },
            ...(isStore ? [] : [{ key: 'wallet', header: 'Wallet Balance', render: (r: Rider) => <span className="font-bold text-primary">{money(r.user?.wallet_balance)}</span> }]),
            {
              key: 'action', header: 'Action', align: 'right', render: (r) => can('delivery_boy.update')
                ? <button type="button" className="btn-primary btn-sm" onClick={() => setModal({ initial: { id: r.id, name: r.name, cash: Number(r.cash_in_hand || 0) } })}>Collect</button> : null,
            },
          ]}
        />
      ) : (
        <DataTable<CashCollection>
          path="cash_collections" constraints={txConstraints} deps={[isStore, storeIds.join(','), from, to]} refreshKey={refreshKey}
          initialFilters={boyFilter ? { delivery_boy_id: boyFilter } : {}} empty="No cash transactions found."
          filters={[
            { key: 'delivery_boy_id', placeholder: 'All delivery boys', options: opts(riders, (r) => r.name || r.id) },
            { key: 'type', placeholder: 'All Types', options: [{ value: 'collected_from_customer', label: 'Collected from customer' }, { value: 'submitted_to_admin', label: 'Submitted to admin' }] },
          ]}
          filterExtra={<>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-40 !py-2" title="From" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-40 !py-2" title="To" />
          </>}
          columns={[
            { key: 'boy', header: 'Delivery Boy', render: (t) => { const r = riderMap[t.delivery_boy_id]; return r ? <Link href={p(`/delivery-boys/view/${r.id}`)} className="font-medium hover:text-primary">{r.name}</Link> : <span className="text-muted">{t.delivery_boy_id}</span>; } },
            { key: 'order', header: 'Order', render: (t) => (t.order_id ? <Link href={p(`/orders/view/${t.order_id}`)} className="text-primary font-semibold">#{t.order_id}</Link> : '—') },
            { key: 'type', header: 'Type', render: (t) => <StatusPill status={t.type} label={t.type === 'submitted_to_admin' ? 'Submitted to admin' : 'Collected from customer'} /> },
            { key: 'amount', header: 'Amount', render: (t) => <span className={`font-bold ${t.type === 'submitted_to_admin' ? 'text-primary' : 'text-red-500'}`}>{money(t.amount)}</span> },
            { key: 'message', header: 'Message', className: 'text-xs max-w-[240px]', render: (t) => t.message || '—' },
            { key: 'created_at', header: 'Date', sort: 'created_at', render: (t) => <span className="text-xs text-muted whitespace-nowrap">{fmtDateTime(t.created_at)}</span> },
          ]}
        />
      )}

      <CollectCashModal open={!!modal} onClose={() => setModal(null)} boys={targets} initial={modal?.initial} onDone={() => { reload(); setRefreshKey((k) => k + 1); }} />
    </div>
  );
}
