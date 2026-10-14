'use client';
// Orders list + Self Pickup list — port of admin/orders/index.blade.php (OrderController@index / @selfPickup).
// Store panel: scoped by store_id. Admin: header country (usePanel().countryId) or the country filter.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Timestamp, type QueryConstraint } from 'firebase/firestore';
import { CircleCheck, CircleX, ClipboardList, Clock, KeyRound, Loader, Check } from 'lucide-react';
import { where, countDocs } from '@/lib/firestore';
import { useStores, useZones } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { verifyPickupOtp } from '@/lib/callables';
import { fmtDateTime, money, num } from '@/lib/format';
import type { Order } from '@/lib/types';
import { DataTable, opts, type FilterDef } from '@/components/ui/DataTable';
import { Forbidden, PageHeader, RowActions, StatCard, StatusPill } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import {
  FINAL_STATUSES, ModePill, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, PENDING_GROUP, PROCESSING_GROUP, orderStatusLabel, paymentMethodLabel, useMaskPhone,
} from './shared';

type Counts = { total: number; pending: number; processing: number; delivered: number; cancelled: number };

export function OrdersList({ selfPickup = false }: { selfPickup?: boolean }) {
  const { p, storeId, isStore, countryId, countries } = usePanel();
  const { can } = useAuth();
  const search = useSearchParams();
  const mask = useMaskPhone();
  const { data: zones = [] } = useZones();
  const { data: stores = [] } = useStores();

  const [statusTab, setStatusTab] = useState(search.get('status') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [verify, setVerify] = useState<Order | null>(null);

  // base scope (stat strip + table)
  const base = useMemo<QueryConstraint[]>(() => {
    const cs: QueryConstraint[] = [];
    if (storeId) cs.push(where('store_id', '==', storeId));
    if (!isStore && countryId) cs.push(where('country_id', '==', countryId));
    if (selfPickup) cs.push(where('delivery_type', '==', 'self_pickup'));
    return cs;
  }, [storeId, isStore, countryId, selfPickup]);

  const dateCs = useMemo<QueryConstraint[]>(() => {
    const cs: QueryConstraint[] = [];
    if (from) cs.push(where('created_at', '>=', Timestamp.fromDate(new Date(`${from}T00:00:00`))));
    if (to) cs.push(where('created_at', '<=', Timestamp.fromDate(new Date(`${to}T23:59:59.999`))));
    return cs;
  }, [from, to]);

  useEffect(() => {
    if (isStore && !storeId) return;
    let alive = true;
    const cnt = async (extra: QueryConstraint[]) => {
      try { return await countDocs('orders', [...base, ...extra]); } catch { return 0; }
    };
    Promise.all([
      cnt([]), cnt([where('status', 'in', PENDING_GROUP)]), cnt([where('status', 'in', PROCESSING_GROUP)]),
      cnt([where('status', '==', 'delivered')]), cnt([where('status', '==', 'cancelled')]),
    ]).then(([total, pending, processing, delivered, cancelled]) => alive && setCounts({ total, pending, processing, delivered, cancelled }));
    return () => { alive = false; };
  }, [base, refresh, isStore, storeId]);

  if (!can('order.list')) return <Forbidden />;
  if (isStore && !storeId) return null;

  const scopedZones = countryId ? zones.filter((z) => z.country_id === countryId) : zones;
  const scopedStores = countryId ? stores.filter((s) => s.country_id === countryId) : stores;

  const filters: FilterDef[] = [
    ...(!isStore && !countryId ? [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name), className: '!w-40 !min-w-0' }] : []),
    ...(!isStore ? [
      { key: 'zone_id', placeholder: 'All Zones', options: opts(scopedZones, (z) => z.name), className: '!w-40 !min-w-0' },
      { key: 'store_id', placeholder: 'All Stores', options: opts(scopedStores, (s) => s.name), className: '!w-40 !min-w-0' },
    ] : []),
    { key: 'mode', placeholder: 'All modes', options: [{ value: 'quick', label: 'Quick' }, { value: 'ecommerce', label: 'eCommerce' }], className: '!w-36 !min-w-0' },
    {
      key: 'status', placeholder: 'All Statuses', className: '!w-44 !min-w-0',
      options: [{ value: 'pending', label: 'Pending (all)' }, { value: 'processing', label: 'Processing (all)' }, ...Object.entries(ORDER_STATUSES).map(([value, label]) => ({ value, label }))],
      toConstraints: (v) => [v === 'pending' ? where('status', 'in', PENDING_GROUP) : v === 'processing' ? where('status', 'in', PROCESSING_GROUP) : where('status', '==', v)],
    },
    { key: 'payment_method', placeholder: 'All Payments', options: Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label })), className: '!w-40 !min-w-0' },
    { key: 'payment_status', placeholder: 'Payment Status', options: Object.entries(PAYMENT_STATUSES).map(([value, label]) => ({ value, label })), className: '!w-40 !min-w-0' },
  ];

  const tab = (s: string) => () => setStatusTab((cur) => (cur === s ? '' : s));
  const dateActive = !!(from || to);

  return (
    <div>
      <PageHeader title={selfPickup ? 'Self Pickup Orders' : 'Orders'} subtitle={selfPickup ? 'Verify the customer OTP and hand over the order at the store' : undefined} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5">
        {([
          ['', 'Total', counts?.total, ClipboardList, 'blue'],
          ['pending', 'Pending', counts?.pending, Clock, 'orange'],
          ['processing', 'Processing', counts?.processing, Loader, 'cyan'],
          ['delivered', 'Delivered', counts?.delivered, CircleCheck, 'green'],
          ['cancelled', 'Cancelled', counts?.cancelled, CircleX, 'red'],
        ] as const).map(([key, label, value, Icon, color]) => (
          <button key={label} type="button" onClick={key ? tab(key) : () => setStatusTab('')} className={`text-left rounded-2xl ${statusTab === key && key ? 'ring-2 ring-primary' : ''}`} data-testid={`stat-${label.toLowerCase()}`}>
            <StatCard label={label} value={value == null ? '…' : num(value)} icon={Icon} color={color} />
          </button>
        ))}
      </div>

      <DataTable<Order>
        key={statusTab}
        path="orders"
        constraints={[...base, ...dateCs]}
        deps={[base, from, to]}
        refreshKey={refresh}
        initialFilters={statusTab ? { status: statusTab } : {}}
        filters={filters}
        filterExtra={(
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-auto !py-2" title="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-auto !py-2" title="To date" />
          </>
        )}
        search="Search by Order ID, customer"
        defaultSort={{ field: 'created_at', dir: 'desc' }}
        testId="orders-table"
        columns={[
          {
            key: 'order_number', header: 'Order No', sort: 'created_at',
            render: (o) => (
              <div>
                <Link href={p(`/orders/view/${o.id}`)} className="font-bold text-navy dark:text-white hover:text-primary whitespace-nowrap">{o.order_number || o.id}</Link>
                <div className="text-xs text-muted whitespace-nowrap">{fmtDateTime(o.created_at)}</div>
              </div>
            ),
          },
          {
            key: 'customer', header: 'Customer',
            render: (o) => (
              <div>
                <div className="font-medium text-primary">{o.customer?.name || 'Guest'}</div>
                <div className="text-xs text-muted">{mask(o.customer?.phone)}</div>
              </div>
            ),
          },
          {
            key: 'items', header: 'Items / Address', className: 'max-w-[240px]',
            render: (o) => {
              const items = o.items ?? [];
              const names = items.slice(0, 2).map((i) => i.name + (i.variant_name ? ` / ${i.variant_name}` : '')).join(', ');
              const more = Math.max(items.length - 2, 0);
              const city = [o.address?.city, o.address?.state].filter(Boolean).join(', ');
              return (
                <div className="max-w-[240px]">
                  <div className="truncate font-medium">{names || '-'}{more > 0 && <span className="text-muted"> +{more} more</span>}</div>
                  <div className="text-xs text-muted truncate">{city || (o.delivery_type === 'self_pickup' ? 'Self pickup' : '-')}</div>
                </div>
              );
            },
          },
          { key: 'mode', header: 'Mode', render: (o) => <ModePill mode={o.mode} /> },
          {
            key: 'payment', header: 'Payment',
            render: (o) => (
              <span className="pill border bg-slate-100 text-slate-600 border-slate-200 whitespace-nowrap" title={PAYMENT_STATUSES[o.payment_status] ?? o.payment_status}>
                {o.payment_method === 'cod' ? 'COD' : paymentMethodLabel(o.payment_method)}
              </span>
            ),
          },
          { key: 'amount', header: 'Amount', sort: dateActive ? undefined : 'totals.total', render: (o) => <span className="font-semibold text-navy dark:text-white whitespace-nowrap">{money(o.totals?.total)}</span> },
          { key: 'status', header: 'Status', render: (o) => <StatusPill status={o.status} label={orderStatusLabel(o.status)} /> },
          {
            key: 'actions', header: 'Actions', align: 'right',
            render: (o) => (
              <RowActions view={p(`/orders/view/${o.id}`)}>
                {selfPickup && !FINAL_STATUSES.includes(o.status) && o.status !== 'payment_pending' && can('order.update') && (
                  <button type="button" className="btn-primary btn-sm whitespace-nowrap" data-testid="verify-otp" onClick={() => setVerify(o)}>
                    <KeyRound className="w-4 h-4" /> Verify OTP
                  </button>
                )}
              </RowActions>
            ),
          },
        ]}
      />

      <VerifyPickupModal order={verify} onClose={() => setVerify(null)} onDone={() => { setVerify(null); setRefresh((r) => r + 1); }} />
    </div>
  );
}

export function VerifyPickupModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOtp(''); }, [order?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !otp.trim()) return;
    setBusy(true);
    try {
      const r = await verifyPickupOtp({ order_id: order.id, otp: otp.trim() });
      toast(r?.message || 'OTP verified. Order handed over.');
      onDone();
    } catch (err: any) { toast(err?.message || 'Invalid OTP. Please check with the customer.', 'error'); }
    setBusy(false);
  };

  return (
    <Modal open={!!order} onClose={onClose} title="Verify OTP & Handover" size="md">
      {order && (
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="rounded-xl bg-primary-50 dark:bg-dark-line p-4 text-sm">
            <div className="font-bold text-navy dark:text-white">{order.order_number}</div>
            <div className="text-muted">{order.customer?.name || 'Guest'} · {money(order.totals?.total)}</div>
          </div>
          <div>
            <label className="label">Customer OTP</label>
            <input
              type="text" inputMode="numeric" maxLength={6} required autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="input text-center text-lg tracking-[0.5em] font-bold" placeholder="••••••" data-testid="pickup-otp"
            />
            <p className="text-xs text-muted mt-1">Ask the customer for the 6-digit pickup OTP shown in their app.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy || !otp.trim()} data-testid="verify-handover"><Check className="w-4 h-4" /> {busy ? 'Verifying…' : 'Verify & Handover'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function OrdersPage() { return <OrdersList />; }
