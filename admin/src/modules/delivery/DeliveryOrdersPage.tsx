'use client';
// My Orders — port of delivery/orders/index.blade.php (realtime tabs Available / Active / History).
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bike, History, Inbox, Radar, Search } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { acceptOrder } from '@/lib/callables';
import { errMsg } from '@/lib/format';
import type { Order } from '@/lib/types';
import { Loading, PageHeader, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ApprovalNotice, OrderCard, RiderGate, useStoreMap } from './shared';
import { useRiderOrders } from './useRiderOrders';

type Tab = 'available' | 'active' | 'history';
const TABS: [Tab, string, typeof Radar][] = [['available', 'Available', Radar], ['active', 'Active', Bike], ['history', 'History', History]];

export default function DeliveryOrdersPage() {
  return <RiderGate>{(r) => <Orders {...r} />}</RiderGate>;
}

function Orders({ uid, boy, approved, zoneId }: any) {
  const sp = useSearchParams();
  const router = useRouter();
  const { p } = usePanel();
  const toast = useToast();
  const stores = useStoreMap();
  const type = (['available', 'active', 'history'].includes(sp.get('type') || '') ? sp.get('type') : 'available') as Tab;
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const data = useRiderOrders(uid, zoneId, approved);
  const counts: Record<Tab, number> = { available: data.available.length, active: data.active.length, history: data.history.length };

  const t = term.trim().toLowerCase();
  const rows = (data[type] as Order[]).filter((o) => !t || (o.order_number || '').toLowerCase().includes(t) || (o.customer?.name || '').toLowerCase().includes(t) || (o.address?.name || '').toLowerCase().includes(t));

  const accept = async (o: Order) => {
    setBusy(true);
    try { await acceptOrder({ order_id: o.id }); toast('Order accepted'); router.push(p(`/orders/view/${o.id}`)); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="My Orders" subtitle="Accept, pick up and deliver orders in your zone" />
      <ApprovalNotice boy={boy} />
      <div className="card mb-5">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {TABS.map(([key, lbl, Ic]) => (
              <button key={key} type="button" onClick={() => router.replace(p(`/orders?type=${key}`))} className={cx('tab whitespace-nowrap', type === key && 'tab-active')} data-testid={`tab-${key}`}>
                <Ic className="w-4 h-4 inline -mt-0.5" /> {lbl}
                <span className={cx('ml-1 inline-flex min-w-[20px] justify-center rounded-full px-1.5 text-[11px]', type === key ? 'bg-primary-50 text-primary' : 'bg-slate-100 dark:bg-slate-700')}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Order # or customer" className="input !py-2 !pl-9" />
          </label>
        </div>
      </div>

      {data.loading && !rows.length ? <Loading /> : !rows.length ? (
        <div className="card py-16 text-center text-muted flex flex-col items-center gap-2">
          <Inbox className="w-10 h-10 text-slate-300" />
          {data.error ? 'Could not load orders.' : type === 'available' ? (approved ? 'No orders are waiting for pickup in your zone right now.' : 'Orders will appear here once your account is approved.') : type === 'active' ? 'You have no active deliveries.' : 'No delivery history yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {rows.map((o) => <OrderCard key={o.id} order={o} type={type} store={o.store_id ? stores[o.store_id] : null} onAccept={accept} busy={busy} />)}
        </div>
      )}
    </div>
  );
}
