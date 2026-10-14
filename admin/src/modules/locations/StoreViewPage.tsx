'use client';
// Store detail — port of admin/stores/show.blade.php: stats, details, owner, location map, recent orders.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { IndianRupee, Map as MapIcon, Package, Pencil, Receipt, ShoppingBag, Store as StoreIcon, UserRound, Users } from 'lucide-react';
import { fetchList, limit, orderBy, useCountries, useDocQ, useZones, where, countDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Order, Store, UserDoc } from '@/lib/types';
import { fmtDateTime, imgUrl, money, num, timeAgo } from '@/lib/format';
import { Avatar, Card, Empty, Forbidden, KV, Loading, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { PointsMap } from '@/components/map';
import { isActive } from './LocalTable';

const count = (path: string, ...c: ReturnType<typeof where>[]) => countDocs(path, c).catch(() => null);

export default function StoreViewPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { can } = useAuth();
  const { p } = usePanel();
  const { data: store, isLoading } = useDocQ<Store>('stores', id);
  const { data: owner } = useDocQ<UserDoc>('users', store?.owner_uid || null);
  const { data: zones = [] } = useZones();
  const { data: countries = [] } = useCountries();
  const [stats, setStats] = useState<{ products: number | null; staff: number | null; delivered: number | null }>({ products: null, staff: null, delivered: null });
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      count('products', where('store_id', '==', id)),
      count('users', where('type', '==', 'store'), where('store_id', '==', id)),
      count('orders', where('store_id', '==', id), where('status', '==', 'delivered')),
    ]).then(([products, staff, delivered]) => setStats({ products, staff, delivered }));
    fetchList<Order>('orders', where('store_id', '==', id), orderBy('created_at', 'desc'), limit(10)).then(setOrders).catch(() => setOrders([]));
  }, [id]);

  if (!can('store.list')) return <Forbidden />;
  if (isLoading) return <Loading />;
  if (!store) return <Empty text="Store not found." />;
  const zone = zones.find((z) => z.id === store.zone_id);
  const country = countries.find((c) => c.id === store.country_id);
  const hasPin = typeof store.lat === 'number' && typeof store.lng === 'number';

  return (
    <div>
      <PageHeader title={store.name} subtitle={[zone?.name, store.city, country?.name].filter(Boolean).join(' · ')} back={p('/stores')}>
        {can('store.update') && <Link href={p(`/stores/edit/${store.id}`)} className="btn-primary" data-testid="edit-store"><Pencil className="w-4 h-4" /> Edit Store</Link>}
      </PageHeader>

      {store.banner && <div className="card overflow-hidden mb-5"><img src={imgUrl(store.banner)} className="w-full h-40 object-cover" alt="" /></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <StatCard label="Total Orders" value={num(store.orders_count)} icon={ShoppingBag} color="blue" />
        <StatCard label="Revenue" value={money(store.revenue)} icon={IndianRupee} color="green" />
        <StatCard label="Products" value={stats.products == null ? '—' : num(stats.products)} icon={Package} color="purple" />
        <StatCard label="Staff Users" value={stats.staff == null ? '—' : num(stats.staff)} icon={Users} color="orange" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card title="Store Details" icon={StoreIcon}>
            <div className="flex items-center gap-3 mb-4">
              {store.logo ? <img src={imgUrl(store.logo)} className="w-14 h-14 rounded-xl object-cover border border-line" alt="" />
                : <span className="w-14 h-14 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center"><StoreIcon className="w-6 h-6" /></span>}
              <div>
                <p className="font-bold text-navy dark:text-white">{store.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <StatusPill status={isActive(store.status)} />
                  <StatusPill status={store.fulfillment_type} />
                  <StatusPill status={store.is_open === false ? 'closed' : 'open'} />
                </div>
              </div>
            </div>
            <KV label="Email">{store.email || '—'}</KV>
            <KV label="Phone">{store.phone || '—'}</KV>
            <KV label="Address">{store.address || '—'}</KV>
            <KV label="City">{store.city || '—'}</KV>
            <KV label="Zone">{zone?.name || '—'}</KV>
            <KV label="Country">{country?.name || '—'}</KV>
            <KV label="Hours">{store.opening_time ? `${store.opening_time.slice(0, 5)} – ${(store.closing_time || '').slice(0, 5)}` : '—'}</KV>
            <KV label="Commission">{Number(store.commission_percent || 0)}%</KV>
            <KV label="Location">{hasPin ? `${store.lat}, ${store.lng}` : '—'}</KV>
            <KV label="Delivered Orders">{stats.delivered == null ? '—' : num(stats.delivered)}</KV>
          </Card>

          <Card title="Owner" icon={UserRound}>
            {owner ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar src={owner.avatar} name={owner.name} className="w-12 h-12" />
                  <div className="min-w-0">
                    <p className="font-semibold text-navy dark:text-white">{owner.name}</p>
                    <p className="text-xs text-muted truncate">{owner.email}</p>
                    <p className="text-xs text-muted">{owner.phone || ''}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">Last login: {owner.last_login_at ? timeAgo(owner.last_login_at) : 'Never'}</p>
              </>
            ) : (
              <p className="text-sm text-muted">No owner login configured. {can('store.update') && <Link href={p(`/stores/edit/${store.id}`)} className="text-primary font-semibold">Add one</Link>}.</p>
            )}
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-5">
          <Card title="Location" icon={MapIcon}>
            {hasPin || (zone?.polygon?.length ?? 0) > 2
              ? <PointsMap height={300} points={hasPin ? [{ lat: store.lat!, lng: store.lng!, label: 'S', popup: store.name }] : []} polygon={zone?.polygon} />
              : <Empty text="No location set." />}
          </Card>
          <Card title="Recent Orders" icon={Receipt} padding={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Order</th><th>Customer</th><th>Mode</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {orders == null ? <tr><td colSpan={6}><Loading /></td></tr> : !orders.length ? <tr><td colSpan={6} className="!py-10 text-center text-muted">No orders yet.</td></tr>
                    : orders.map((o) => (
                      <tr key={o.id}>
                        <td><Link href={p(`/orders/view/${o.id}`)} className="font-semibold text-primary">#{o.order_number}</Link></td>
                        <td>{o.customer?.name || 'Guest'}</td>
                        <td><StatusPill status={o.mode} /></td>
                        <td className="font-semibold">{money(o.totals?.grand_total ?? o.totals?.total)}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td className="text-xs text-muted whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
