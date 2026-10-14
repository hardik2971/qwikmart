'use client';
// Order detail with the guided delivery workflow — port of delivery/orders/show.blade.php.
// Riders never read orders/{id}/secret/otp: the customer tells the OTP, which is verified by deliverOrder.
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bike, Check, CircleCheck, CircleDot, CircleX, ChefHat, CreditCard, Hourglass, KeyRound, MapPin, MessageSquare, Navigation, Package,
  PackageCheck, PartyPopper, Phone, RotateCcw, ShieldCheck, ShoppingBag, ShoppingBasket, Store as StoreIcon, Truck, X, type LucideIcon,
} from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useDocQ, useLiveDoc } from '@/lib/firestore';
import { acceptOrder, deliverOrder, rejectOrder, updateDeliveryStatus } from '@/lib/callables';
import { errMsg, fmtDateTime, imgUrl, money, statusLabel } from '@/lib/format';
import type { Order, Store } from '@/lib/types';
import { Card, Loading, PageHeader, StatusPill, cx } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { PointsMap } from '@/components/map';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { addressOf, amountToCollect, mapsUrl, orderTotal, RiderGate, storeOf } from './shared';

const STEPS: [string, LucideIcon][] = [['Accepted', Check], ['Picked Up', Package], ['Out for Delivery', Bike], ['Delivered', PackageCheck]];
const HIST_ICONS: Record<string, LucideIcon> = {
  payment_pending: CreditCard, received: ShoppingBag, processed: ChefHat, shipped: Truck, ready_for_pickup: StoreIcon,
  picked_up: Package, out_for_delivery: Bike, delivered: PackageCheck, cancelled: CircleX, returned: RotateCcw,
};

export default function DeliveryOrderViewPage() {
  return <RiderGate>{(r) => <View uid={r.uid} approved={r.approved} />}</RiderGate>;
}

function View({ uid, approved }: { uid: string; approved: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { p } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { data: order, loading } = useLiveDoc<Order>('orders', id);
  const { data: store } = useDocQ<Store>('stores', order?.store_id);
  const [busy, setBusy] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [cashOk, setCashOk] = useState(false);

  if (loading) return <Loading />;
  if (!order) {
    return (
      <div>
        <PageHeader title="Order" back={p('/orders')} />
        <div className="card py-16 text-center text-muted">This order was not found or is no longer available to you.</div>
      </div>
    );
  }

  const s = order.status;
  const mine = order.delivery_boy_id === uid;
  const collect = amountToCollect(order);
  const pickup = storeOf(store);
  const drop = addressOf(order);
  const reached = s === 'delivered' ? 4 : s === 'out_for_delivery' ? 3 : s === 'picked_up' ? 2 : mine ? 1 : 0;
  const backType = mine ? (['delivered', 'cancelled', 'returned'].includes(s) ? 'history' : 'active') : 'available';
  const items = order.items ?? [];
  const t = order.totals ?? ({} as Order['totals']);
  const discount = Number(t.discount || 0) + Number(t.promo_discount || 0);

  const run = async (fn: () => Promise<any>, msg: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); toast(msg); after?.(); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const doReject = async () => {
    const ok = await confirm({ title: mine ? 'Release this order?' : 'Skip this order?', message: mine ? 'It will be offered to other delivery partners.' : 'This order will be hidden from your available list.', danger: true, confirmText: 'Reject' });
    if (ok) run(() => rejectOrder({ order_id: order.id }), 'Order rejected', () => router.push(p('/orders?type=available')));
  };
  const doDeliver = async () => {
    if (otp.trim().length < 4) { toast('Enter the OTP shared by the customer', 'error'); return; }
    if (collect > 0 && !cashOk) { toast('Confirm that you collected the cash', 'error'); return; }
    await run(() => deliverOrder({ order_id: order.id, otp: otp.trim(), ...(collect > 0 ? { cash_collected: collect } : {}) }), 'Order delivered. Great job!', () => { setOtpOpen(false); setOtp(''); });
  };

  const points = [
    ...(pickup.lat != null && pickup.lng != null ? [{ lat: pickup.lat, lng: pickup.lng, label: 'S', color: '#0E9623', popup: pickup.name }] : []),
    ...(drop.lat != null && drop.lng != null ? [{ lat: drop.lat, lng: drop.lng, label: 'C', color: '#EF4444', popup: drop.name }] : []),
    ...(order.rider?.lat != null ? [{ lat: order.rider.lat, lng: order.rider.lng, label: 'R', color: '#3B82F6', popup: 'You' }] : []),
  ];

  return (
    <div>
      <PageHeader title={order.order_number || order.id} subtitle={`${statusLabel(s)} · ${order.mode === 'ecommerce' ? 'eCommerce' : 'Quick'} order`} back={p(`/orders?type=${backType}`)}>
        <StatusPill status={s} className="!text-sm !px-3 !py-1" />
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Next step */}
          <div className="card p-5">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-5">
              {STEPS.map(([lbl, Ic], i) => (
                <div key={lbl} className="flex flex-col items-center text-center gap-1.5">
                  <span className={cx('w-9 h-9 rounded-full flex items-center justify-center', i < reached ? 'bg-primary text-white' : i === reached ? 'bg-primary-50 text-primary ring-2 ring-primary' : 'bg-slate-100 text-slate-400 dark:bg-slate-700')}>
                    {i < reached ? <Check className="w-4 h-4" /> : <Ic className="w-4 h-4" />}
                  </span>
                  <span className={cx('text-[11px] sm:text-xs font-semibold', i < reached ? 'text-primary' : 'text-muted')}>{lbl}</span>
                </div>
              ))}
            </div>

            {s === 'cancelled' ? (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2"><CircleX className="w-5 h-5" /> This order was cancelled{order.cancel_reason ? `: ${order.cancel_reason}` : '.'}</div>
            ) : s === 'delivered' ? (
              <div className="rounded-xl bg-primary-50 border border-primary/30 text-primary-dark px-4 py-3 text-sm flex items-center gap-2"><PartyPopper className="w-5 h-5" /> Delivered {fmtDateTime(order.delivered_at)}. Great job!</div>
            ) : s === 'returned' ? (
              <div className="rounded-xl bg-violet-50 border border-violet-200 text-violet-700 px-4 py-3 text-sm flex items-center gap-2"><RotateCcw className="w-5 h-5" /> This order was returned.</div>
            ) : !mine ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="flex-1 text-sm text-muted">This order is waiting for a delivery partner in your zone. Accept it to start the pickup.</p>
                {approved ? (
                  <>
                    <button type="button" className="btn-outline w-full sm:w-auto !text-red-500" disabled={busy} onClick={doReject} data-testid="reject-order"><X className="w-4 h-4" /> Reject</button>
                    <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => run(() => acceptOrder({ order_id: order.id }), 'Order accepted')} data-testid="accept-order"><Check className="w-4 h-4" /> Accept Order</button>
                  </>
                ) : <span className="pill bg-amber-50 text-amber-700 border border-amber-200">Account approval pending</span>}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 text-sm">
                  {['received', 'processed'].includes(s) && <><p className="font-semibold text-navy dark:text-white">Waiting for the store</p><p className="text-muted">The store is preparing this order. You can pick it up once it is marked ready.</p></>}
                  {['ready_for_pickup', 'shipped'].includes(s) && <><p className="font-semibold text-navy dark:text-white">Ready for pickup</p><p className="text-muted">Go to {pickup.name} and collect the items.</p></>}
                  {s === 'picked_up' && <><p className="font-semibold text-navy dark:text-white">Order picked up</p><p className="text-muted">Start the trip to the customer.</p></>}
                  {s === 'out_for_delivery' && <><p className="font-semibold text-navy dark:text-white">On the way</p><p className="text-muted">Ask the customer for the 6-digit delivery OTP{collect > 0 ? ` and collect ${money(collect)} in cash` : ''}.</p></>}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {!['picked_up', 'out_for_delivery'].includes(s) && (
                    <button type="button" className="btn-outline w-full !text-red-500" disabled={busy} onClick={doReject} data-testid="reject-order"><X className="w-4 h-4" /> Reject</button>
                  )}
                  {['ready_for_pickup', 'shipped'].includes(s) && (
                    <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => run(() => updateDeliveryStatus({ order_id: order.id, status: 'picked_up' }), 'Marked as picked up')} data-testid="mark-picked-up"><Package className="w-4 h-4" /> Mark as Picked Up</button>
                  )}
                  {s === 'picked_up' && (
                    <>
                      <button type="button" className="btn-outline w-full sm:w-auto" disabled={busy} onClick={() => setOtpOpen(true)} data-testid="enter-otp"><KeyRound className="w-4 h-4" /> Enter OTP</button>
                      <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => run(() => updateDeliveryStatus({ order_id: order.id, status: 'out_for_delivery' }), 'Out for delivery')} data-testid="out-for-delivery"><Bike className="w-4 h-4" /> Out for Delivery</button>
                    </>
                  )}
                  {s === 'out_for_delivery' && (
                    <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => setOtpOpen(true)} data-testid="enter-otp"><KeyRound className="w-4 h-4" /> Enter OTP &amp; Deliver</button>
                  )}
                  {['received', 'processed'].includes(s) && (
                    <button type="button" className="btn-gray w-full opacity-60 cursor-not-allowed" disabled><Hourglass className="w-4 h-4" /> Mark as Picked Up</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pickup + delivery info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card p-5 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><StoreIcon className="w-4 h-4" /></span>
                <h3 className="card-title">Pickup Info</h3>
              </div>
              <p className="font-bold text-navy dark:text-white">{pickup.name}</p>
              <p className="text-sm text-muted mt-0.5 flex-1">{pickup.line}</p>
              <div className="flex gap-2 mt-4">
                {pickup.phone && <a href={`tel:${pickup.phone}`} className="icon-btn !w-10 !h-10 !text-primary !border-primary/30 !bg-primary-50" title="Call store"><Phone className="w-4 h-4" /></a>}
                <a href={mapsUrl(pickup.lat, pickup.lng, `${pickup.name} ${pickup.line}`)} target="_blank" rel="noopener noreferrer" className="btn-soft flex-1 justify-center"><Navigation className="w-4 h-4" /> Get Directions</a>
              </div>
            </div>
            <div className="card p-5 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center"><MapPin className="w-4 h-4" /></span>
                <h3 className="card-title">Delivery Info</h3>
              </div>
              <p className="font-bold text-navy dark:text-white">{drop.name}</p>
              {drop.phone && <p className="text-sm text-muted">Mobile: {mine ? drop.phone : drop.phone.slice(0, 3) + '******' + drop.phone.slice(-2)}</p>}
              <p className="text-sm text-muted mt-0.5 flex-1">{drop.line}</p>
              <div className="flex gap-2 mt-4">
                {mine && drop.phone && (
                  <>
                    <a href={`tel:${drop.phone}`} className="icon-btn !w-10 !h-10 !text-primary !border-primary/30 !bg-primary-50" title="Call customer"><Phone className="w-4 h-4" /></a>
                    <a href={`sms:${drop.phone}`} className="icon-btn !w-10 !h-10 !text-primary !border-primary/30 !bg-primary-50" title="Message customer"><MessageSquare className="w-4 h-4" /></a>
                  </>
                )}
                <a href={mapsUrl(drop.lat, drop.lng, drop.line)} target="_blank" rel="noopener noreferrer" className="btn-soft flex-1 justify-center"><Navigation className="w-4 h-4" /> Get Directions</a>
              </div>
            </div>
          </div>

          {points.length > 0 && (
            <Card title="Route" icon={MapPin} padding={false}>
              <div className="px-5 pb-5"><PointsMap points={points} height={280} /></div>
            </Card>
          )}

          {/* Items */}
          <Card title="Items" subtitle={`${items.reduce((a, i) => a + Number(i.qty || 0), 0)} units · ${items.length} products`} icon={ShoppingBasket} padding={false}>
            <div className="divide-y divide-line dark:divide-dark-line">
              {items.map((it, i) => (
                <div key={`${it.variant_id}_${i}`} className="flex items-center gap-3 px-5 py-3">
                  <img src={imgUrl(it.image, it.name || 'P')} className="w-12 h-12 rounded-lg object-cover border border-line dark:border-dark-line bg-slate-50" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-navy dark:text-white truncate">{it.name}</p>
                    <p className="text-xs text-muted">{it.variant_name || '—'} · {money(it.sale_price ?? it.price)} × {it.qty}</p>
                  </div>
                  <span className="text-sm font-bold text-navy dark:text-white">{money(it.total)}</span>
                </div>
              ))}
              {!items.length && <div className="px-5 py-6 text-sm text-muted">No items.</div>}
            </div>
          </Card>
        </div>

        {/* Right: payment + timeline */}
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="card-title mb-3">Payment</h3>
            {collect > 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Collect cash from customer</p>
                <p className="text-2xl font-extrabold text-amber-700">{money(collect)}</p>
              </div>
            ) : order.payment_method === 'cod' ? (
              <div className="rounded-xl bg-primary-50 border border-primary/30 px-4 py-3 mb-4 text-sm text-primary-dark font-semibold flex items-center gap-2"><CircleCheck className="w-4 h-4" /> Cash collected</div>
            ) : (
              <div className="rounded-xl bg-primary-50 border border-primary/30 px-4 py-3 mb-4 text-sm text-primary-dark font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Prepaid — nothing to collect</div>
            )}
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted">Payment method</dt><dd className="font-semibold text-navy dark:text-white">{order.payment_method === 'cod' ? 'Cash on Delivery' : statusLabel(order.payment_method)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Payment status</dt><dd><StatusPill status={order.payment_status} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery charge</dt><dd>{money(Number(t.delivery_charge || 0) + Number(t.surge_charge || 0))}</dd></div>
              {discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="text-primary">-{money(discount)}</dd></div>}
              {Number(t.wallet_used || 0) > 0 && <div className="flex justify-between"><dt className="text-muted">Wallet used</dt><dd>-{money(t.wallet_used)}</dd></div>}
              <div className="flex justify-between pt-2 border-t border-line dark:border-dark-line"><dt className="font-bold text-navy dark:text-white">Order total</dt><dd className="font-extrabold text-navy dark:text-white">{money(orderTotal(order))}</dd></div>
            </dl>
            {order.notes && <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-muted"><b className="text-navy dark:text-white">Note:</b> {order.notes}</div>}
          </div>

          <div className="card p-5">
            <h3 className="card-title mb-4">Track Order</h3>
            {!(order.timeline ?? []).length ? <p className="text-sm text-muted">No status updates yet.</p> : (
              <ol className="relative space-y-4">
                {(order.timeline ?? []).map((h, i, arr) => {
                  const last = i === arr.length - 1;
                  const Ic = HIST_ICONS[h.status] || CircleDot;
                  return (
                    <li key={i} className="relative flex gap-3">
                      {!last && <span className="absolute left-[17px] top-9 -bottom-4 border-l-2 border-dashed border-primary/40" />}
                      <span className={cx('relative z-10 w-9 h-9 shrink-0 rounded-full flex items-center justify-center', last ? 'bg-primary text-white' : 'bg-primary-50 text-primary')}><Ic className="w-4 h-4" /></span>
                      <div className={cx('flex-1 min-w-0', last && 'rounded-lg bg-primary-50 dark:bg-primary/10 px-3 py-2 -mt-1')}>
                        <p className="text-sm font-semibold text-navy dark:text-white">{h.label || statusLabel(h.status)}</p>
                        {h.note && <p className="text-xs text-muted">{h.note}</p>}
                        <p className="text-[11px] text-muted mt-0.5">{fmtDateTime(h.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      <Modal open={otpOpen && mine && ['picked_up', 'out_for_delivery'].includes(s)} onClose={() => setOtpOpen(false)} title="Confirm Delivery" size="md">
        <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); doDeliver(); }}>
          <div className="text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-primary-50 text-primary flex items-center justify-center mb-2"><KeyRound className="w-7 h-7" /></span>
            <p className="text-sm text-muted">Ask <b className="text-navy dark:text-white">{drop.name}</b> for the 6-digit delivery OTP.</p>
          </div>
          <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="••••••" required className="input text-center text-2xl tracking-[0.6em] font-bold" data-testid="otp-input" />
          {collect > 0 && (
            <label className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
              <input type="checkbox" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} className="mt-0.5 accent-primary" />
              <span>I have collected <b>{money(collect)}</b> in cash from the customer.</span>
            </label>
          )}
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy} data-testid="deliver-order"><PackageCheck className="w-4 h-4" /> Mark as Delivered</button>
        </form>
      </Modal>
    </div>
  );
}
