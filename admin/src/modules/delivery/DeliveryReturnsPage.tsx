'use client';
// Return Pickups — port of delivery/returns/index.blade.php.
import { useEffect, useState } from 'react';
import { Navigation, PackageCheck, Phone, RotateCcw, Search } from 'lucide-react';
import { q, useLiveQuery, where } from '@/lib/firestore';
import { returnPickedUp } from '@/lib/callables';
import { errMsg, fmtDate, statusLabel } from '@/lib/format';
import type { Order, ReturnRequest } from '@/lib/types';
import { Loading, PageHeader, StatusPill, Thumb, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { addressOf, fetchReadable, mapsUrl, RiderGate, sortByCreatedDesc, storeOf, useStoreMap } from './shared';

type Tab = 'pickup_assigned' | 'picked_up';

export default function DeliveryReturnsPage() {
  return <RiderGate>{(r) => <Returns uid={r.uid} />}</RiderGate>;
}

function Returns({ uid }: { uid: string }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const stores = useStoreMap();
  const [tab, setTab] = useState<Tab>('pickup_assigned');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error } = useLiveQuery<ReturnRequest>(q('return_requests', where('delivery_boy_id', '==', uid)), [uid]);
  const [orders, setOrders] = useState<Record<string, Order>>({});

  const ids = [...new Set(data.map((r) => r.order_id))].sort().join(',');
  useEffect(() => { if (ids) fetchReadable<Order>('orders', ids.split(',')).then(setOrders); }, [ids]);

  const counts = { pickup_assigned: data.filter((r) => r.status === 'pickup_assigned').length, picked_up: data.filter((r) => r.status !== 'pickup_assigned').length };
  const t = term.trim().toLowerCase();
  const rows = sortByCreatedDesc(data.filter((r) => (tab === 'pickup_assigned' ? r.status === 'pickup_assigned' : r.status !== 'pickup_assigned')
    && (!t || (r.return_number || '').toLowerCase().includes(t) || (r.order_number || '').toLowerCase().includes(t))));

  const pickedUp = async (r: ReturnRequest) => {
    if (!(await confirm({ title: 'Mark as picked up?', message: 'Confirm you have collected this return item?' }))) return;
    setBusy(r.id);
    try { await returnPickedUp({ return_id: r.id }); toast('Return marked as picked up'); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };

  return (
    <div>
      <PageHeader title="Return Pickups" subtitle="Collect returned items from customers and hand them back to the store" />
      <div className="card mb-5">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {([['pickup_assigned', 'To Pick Up'], ['picked_up', 'Picked Up']] as [Tab, string][]).map(([key, lbl]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={cx('tab whitespace-nowrap', tab === key && 'tab-active')}>
                {lbl} <span className={cx('ml-1 inline-flex min-w-[20px] justify-center rounded-full px-1.5 text-[11px]', tab === key ? 'bg-primary-50 text-primary' : 'bg-slate-100 dark:bg-slate-700')}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Return # or order #" className="input !py-2 !pl-9" />
          </label>
        </div>
      </div>

      {loading ? <Loading /> : !rows.length ? (
        <div className="card py-16 text-center text-muted flex flex-col items-center gap-2">
          <RotateCcw className="w-10 h-10 text-slate-300" />
          {error ? 'Could not load return pickups.' : tab === 'pickup_assigned' ? 'No return pickups assigned to you.' : 'No picked up returns yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {rows.map((r) => {
            const o = orders[r.order_id];
            const drop = o ? addressOf(o) : { name: 'Customer', phone: undefined, line: '-', lat: null, lng: null };
            const st = o?.store_id ? storeOf(stores[o.store_id]) : r.store_id && stores[r.store_id] ? storeOf(stores[r.store_id]) : null;
            const item = o?.items?.find((i) => i.variant_id === r.item_variant_id);
            return (
              <div key={r.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-navy dark:text-white">{r.return_number || r.id}</p>
                    <p className="text-xs text-muted">Order {r.order_number || o?.order_number || '-'} · {fmtDate(r.created_at)}</p>
                  </div>
                  <StatusPill status={r.status} label={statusLabel(r.status)} />
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
                  <Thumb src={item?.image} alt={r.item_name || item?.name || 'Item'} className="w-11 h-11" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy dark:text-white truncate">{r.item_name || item?.name || 'Item'}</p>
                    <p className="text-xs text-muted">Qty {r.qty} · {r.reason || '-'}</p>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Pickup from customer</p>
                  <p className="font-semibold text-navy dark:text-white">{drop.name} {drop.phone && <span className="text-muted font-normal">· {drop.phone}</span>}</p>
                  <p className="text-xs text-muted">{drop.line}</p>
                </div>
                {st && (
                  <div className="text-sm">
                    <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Return to store</p>
                    <p className="font-semibold text-navy dark:text-white">{st.name}</p>
                    <p className="text-xs text-muted">{st.line}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-3 mt-auto border-t border-line dark:border-dark-line">
                  {drop.phone && <a href={`tel:${drop.phone}`} className="icon-btn !w-9 !h-9 !text-primary" title="Call customer"><Phone className="w-4 h-4" /></a>}
                  <a href={mapsUrl(drop.lat, drop.lng, drop.line)} target="_blank" rel="noopener noreferrer" className="btn-soft btn-sm"><Navigation className="w-4 h-4" /> Directions</a>
                  {r.status === 'pickup_assigned' && (
                    <button type="button" className="btn-primary btn-sm ml-auto" disabled={busy === r.id} onClick={() => pickedUp(r)} data-testid="return-picked-up"><PackageCheck className="w-4 h-4" /> Mark Picked Up</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
