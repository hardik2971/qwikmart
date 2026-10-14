'use client';
// Delivery boy profile — port of admin/delivery-boys/show.blade.php: stats, profile, bank, documents, orders, earnings, cash collections.
// Actions: Approve (approveDeliveryBoy), Collect Cash (collectCash), Pay Earnings (payEarnings).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BadgeCheck, Banknote, Check, FileBadge, HandCoins, Hourglass, Landmark, MapPin, Package, PackageCheck, Pencil, Receipt, Send, TrendingUp, Wallet } from 'lucide-react';
import { approveDeliveryBoy } from '@/lib/callables';
import { fetchByIds, fetchList, limit, orderBy, useZones, useCountries, where, countDocs, aggregateDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { CashCollection, DeliveryEarning, Order, Store } from '@/lib/types';
import { errMsg, fmtDate, fmtDateTime, money, num, statusLabel, timeAgo } from '@/lib/format';
import { Avatar, Card, Empty, Forbidden, KV, Loading, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { PointsMap } from '@/components/map';
import { useToast } from '@/components/ui/toast';
import { isActive } from '@/modules/locations/LocalTable';
import { loadRider, RiderDocuments, type Rider } from './shared';
import { CollectCashModal, PayoutModal } from './RiderMoneyModals';

const cnt = (path: string, ...c: ReturnType<typeof where>[]) => countDocs(path, c).catch(() => 0);
const sumOf = (path: string, ...c: ReturnType<typeof where>[]) => aggregateDocs(path, c, { sum: { s: 'amount' } }).then((r) => Number(r.s || 0)).catch(() => 0);

export default function DeliveryBoyViewPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { can } = useAuth();
  const { p, isStore, storeId } = usePanel();
  const toast = useToast();
  const { data: zones = [] } = useZones();
  const { data: countries = [] } = useCountries();
  const [boy, setBoy] = useState<Rider | null | undefined>(undefined);
  const [stats, setStats] = useState({ orders: 0, delivered: 0, pending: 0, paid: 0, submitted: 0 });
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});
  const [earnings, setEarnings] = useState<DeliveryEarning[] | null>(null);
  const [cash, setCash] = useState<CashCollection[] | null>(null);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<'cash' | 'pay' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadRider(id).then(setBoy).catch(() => setBoy(null));
    const by = where('delivery_boy_id', '==', id);
    Promise.all([
      cnt('orders', by, ...(isStore ? [where('store_id', '==', storeId)] : [])), cnt('orders', by, where('status', '==', 'delivered'), ...(isStore ? [where('store_id', '==', storeId)] : [])),
      isStore ? 0 : sumOf('delivery_earnings', by, where('status', '==', 'pending')),
      isStore ? 0 : sumOf('delivery_earnings', by, where('status', 'in', ['paid', 'credited'])),
      isStore ? 0 : sumOf('cash_collections', by, where('type', '==', 'submitted_to_admin')),
    ]).then(([o, d, pe, pa, su]) => setStats({ orders: o, delivered: d, pending: pe, paid: pa, submitted: su }));
    fetchList<Order>('orders', where('delivery_boy_id', '==', id), ...(isStore ? [where('store_id', '==', storeId)] : []), orderBy('created_at', 'desc'), limit(10)).then(async (list) => {
      setOrders(list);
      const st = await fetchByIds<Store>('stores', list.map((o) => o.store_id || '')).catch(() => []);
      setStoreNames(Object.fromEntries(st.map((s) => [s.id, s.name])));
    }).catch(() => setOrders([]));
    if (!isStore) fetchList<DeliveryEarning>('delivery_earnings', where('delivery_boy_id', '==', id), orderBy('created_at', 'desc'), limit(10)).then(setEarnings).catch(() => setEarnings([]));
    if (!isStore) fetchList<CashCollection>('cash_collections', where('delivery_boy_id', '==', id), orderBy('created_at', 'desc'), limit(10)).then(setCash).catch(() => setCash([]));
  }, [id, tick, isStore]);

  if (!can('delivery_boy.list')) return <Forbidden />;
  if (boy === undefined) return <Loading />;
  if (!boy) return <Empty text="Delivery boy not found." />;
  const zone = zones.find((z) => z.id === boy.zone_id);
  const refresh = () => setTick((t) => t + 1);
  const approve = async () => {
    setBusy(true);
    try { await approveDeliveryBoy({ uid: boy.id, approve: true }); toast('Delivery boy approved'); refresh(); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const orderNo = (oid?: string | null) => (oid ? <Link href={p(`/orders/view/${oid}`)} className="text-primary font-semibold">#{orders?.find((o) => o.id === oid)?.order_number || oid}</Link> : '—');

  return (
    <div>
      <PageHeader title={boy.name || 'Delivery Boy'} subtitle="Delivery boy profile" back={p('/delivery-boys')}>
        {!isStore && can('delivery_boy.update') && (
          <>
            {boy.approval_status !== 'approved' && <button type="button" className="btn-primary" disabled={busy} onClick={approve} data-testid="approve"><Check className="w-4 h-4" /> Approve</button>}
            <button type="button" className="btn-outline" onClick={() => setModal('cash')} data-testid="open-collect-cash"><HandCoins className="w-4 h-4" /> Collect Cash</button>
            <button type="button" className="btn-outline" onClick={() => setModal('pay')} data-testid="open-pay-earnings"><Send className="w-4 h-4" /> Pay Earnings</button>
            <Link href={p(`/delivery-boys/edit/${boy.id}`)} className="btn-outline"><Pencil className="w-4 h-4" /> Edit</Link>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <StatCard label="Total Orders" value={num(stats.orders)} icon={Package} color="blue" />
        <StatCard label="Delivered" value={num(stats.delivered)} icon={PackageCheck} color="green" />
        <StatCard label="Cash in Hand" value={money(boy.cash_in_hand)} icon={Banknote} color="red" />
        <StatCard label="Wallet Balance" value={money(boy.user?.wallet_balance)} icon={Wallet} color="purple" />
        {!isStore && (
          <>
            <StatCard label="Total Earned" value={money(boy.earnings_total)} icon={TrendingUp} color="cyan" />
            <StatCard label="Pending Earnings" value={money(stats.pending)} icon={Hourglass} color="orange" />
            <StatCard label="Paid Earnings" value={money(stats.paid)} icon={BadgeCheck} color="green" />
            <StatCard label="Cash Submitted" value={money(stats.submitted)} icon={HandCoins} color="gray" />
          </>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col items-center text-center">
              <span className="relative">
                <Avatar src={boy.avatar} name={boy.name} className="w-20 h-20 border-4 border-primary-50" />
                <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${boy.is_online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </span>
              <p className="mt-3 font-bold text-navy dark:text-white text-lg">{boy.name}</p>
              <p className="text-xs text-muted">{boy.is_online ? 'Online' : 'Offline'}{boy.rating_count ? ` · ★ ${Number(boy.rating_avg || 0).toFixed(1)} (${boy.rating_count})` : ''}</p>
              <div className="mt-2 flex gap-1.5"><StatusPill status={boy.approval_status || 'pending'} /><StatusPill status={isActive(boy.status ?? 'active')} /></div>
            </div>
            <div className="mt-5">
              <KV label="Email">{boy.email || '—'}</KV>
              <KV label="Mobile">{boy.phone || '—'}</KV>
              <KV label="Date of Birth">{boy.dob ? fmtDate(boy.dob) : '—'}</KV>
              <KV label="Address">{boy.address || '—'}</KV>
              <KV label="Zone">{zone?.name || '—'}</KV>
              <KV label="Country">{countries.find((c) => c.id === boy.country_id)?.name || '—'}</KV>
              <KV label="Vehicle">{[boy.vehicle_type ? statusLabel(boy.vehicle_type) : '', boy.vehicle_number].filter(Boolean).join(' ') || '—'}</KV>
              <KV label="Commission">{boy.commission_type === 'percent' ? `${Number(boy.commission_value || 0)}% per order` : `${money(boy.commission_value)} per order`}</KV>
              <KV label="Salary">{Number(boy.salary) > 0 ? `${money(boy.salary)} / month` : '—'}</KV>
              <KV label="Last Location">{boy.location?.updated_at ? timeAgo(boy.location.updated_at) : '—'}</KV>
              <KV label="Joined">{fmtDate(boy.created_at)}</KV>
            </div>
          </Card>
          {!isStore && (
            <>
              <Card title="Bank Details" icon={Landmark}>
                <KV label="Bank">{boy.bank?.name || '—'}</KV>
                <KV label="Account">{boy.bank?.account || '—'}</KV>
                <KV label="IFSC">{boy.bank?.ifsc || '—'}</KV>
              </Card>
              <Card title="Documents" icon={FileBadge}><RiderDocuments boy={boy} /></Card>
            </>
          )}
          {boy.location?.lat != null && (
            <Card title="Current Location" icon={MapPin}>
              <PointsMap height={240} points={[{ lat: boy.location.lat, lng: boy.location.lng, label: 'R', popup: boy.name }]} polygon={zone?.polygon} />
            </Card>
          )}
        </div>

        <div className="xl:col-span-2 space-y-5">
          <Card title="Recent Orders" icon={Receipt} padding={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Order</th><th>Store</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {orders == null ? <tr><td colSpan={7}><Loading /></td></tr> : !orders.length ? <tr><td colSpan={7} className="!py-10 text-center text-muted">No orders yet.</td></tr>
                    : orders.map((o) => (
                      <tr key={o.id}>
                        <td><Link href={p(`/orders/view/${o.id}`)} className="font-semibold text-primary">#{o.order_number}</Link></td>
                        <td>{storeNames[o.store_id || ''] || '—'}</td>
                        <td>{o.customer?.name || 'Guest'}</td>
                        <td className="uppercase text-xs">{o.payment_method}</td>
                        <td className="font-semibold">{money(o.totals?.grand_total ?? o.totals?.total)}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td className="text-xs text-muted whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!isStore && (
            <Card title="Earnings" icon={TrendingUp} padding={false} actions={<Link href={p(`/delivery-earnings?tab=history&delivery_boy_id=${boy.id}`)} className="btn-outline btn-sm">View all</Link>}>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Order</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {earnings == null ? <tr><td colSpan={5}><Loading /></td></tr> : !earnings.length ? <tr><td colSpan={5} className="!py-10 text-center text-muted">No earnings yet.</td></tr>
                      : earnings.map((e) => (
                        <tr key={e.id}>
                          <td>{orderNo(e.order_id)}</td>
                          <td><StatusPill status={e.type === 'commission' ? 'info' : e.type === 'bonus' ? 'shipped' : 'pending'} label={statusLabel(e.type)} /></td>
                          <td className="font-semibold text-primary">{money(e.amount)}</td>
                          <td><StatusPill status={e.status === 'paid' || e.status === 'credited' ? 'success' : 'pending'} label={statusLabel(e.status)} /></td>
                          <td className="text-xs text-muted whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!isStore && (
          <Card title="Cash Collections" icon={Banknote} padding={false} actions={<Link href={p(`/cash-collections?tab=transactions&delivery_boy_id=${boy.id}`)} className="btn-outline btn-sm">View all</Link>}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Order</th><th>Type</th><th>Amount</th><th>Message</th><th>Date</th></tr></thead>
                <tbody>
                  {cash == null ? <tr><td colSpan={5}><Loading /></td></tr> : !cash.length ? <tr><td colSpan={5} className="!py-10 text-center text-muted">No cash collections yet.</td></tr>
                    : cash.map((c) => (
                      <tr key={c.id}>
                        <td>{orderNo(c.order_id)}</td>
                        <td><StatusPill status={c.type} label={c.type === 'submitted_to_admin' ? 'Submitted' : 'Collected'} /></td>
                        <td className={`font-semibold ${c.type === 'submitted_to_admin' ? 'text-primary' : 'text-red-500'}`}>{money(c.amount)}</td>
                        <td className="text-xs">{c.message || '—'}</td>
                        <td className="text-xs text-muted whitespace-nowrap">{fmtDateTime(c.created_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
          )}
        </div>
      </div>

      <CollectCashModal open={modal === 'cash'} onClose={() => setModal(null)} boys={[]} initial={{ id: boy.id, name: boy.name, cash: Number(boy.cash_in_hand || 0) }} onDone={refresh} />
      <PayoutModal open={modal === 'pay'} onClose={() => setModal(null)} boy={{ id: boy.id, name: boy.name }} pending={stats.pending} onDone={refresh} />
    </div>
  );
}
