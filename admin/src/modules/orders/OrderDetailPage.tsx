'use client';
// Order detail — port of admin/orders/show.blade.php (OrderController@show/updateStatus/assign/invoice).
// The order doc is live (onSnapshot) so status / rider changes made by callables, riders or triggers appear instantly.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { QueryConstraint } from 'firebase/firestore';
import {
  ArrowLeft, Bike, ChevronLeft, ChevronRight, CreditCard, Download, Eye, EyeOff, History, KeyRound, Map as MapIcon, MapPin, MessageCircle,
  Navigation, Receipt, RefreshCw, Save, ShoppingCart, Trash2, Undo2, User, UserCheck, X,
} from 'lucide-react';
import { fetchList, limit, orderBy, useDocQ, useListQ, useLiveDoc, useStores, useZones, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { adminUpdateOrderStatus, assignDeliveryBoy, deleteOrder, getInvoiceUrl, updatePaymentStatus } from '@/lib/callables';
import { fmtDateTime, imgUrl, money, timeAgo } from '@/lib/format';
import type { Chat, Order, OrderStatus, ReturnRequest, UserDoc } from '@/lib/types';
import { Avatar, Card, Empty, Forbidden, Loading, StatusPill, cx } from '@/components/ui';
import { PointsMap } from '@/components/map';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import {
  FINAL_STATUSES, ModePill, PAYMENT_STATUSES, RETURN_STATUSES, STATUS_HEX, TRANSITIONS, openAsync, orderStatusLabel, paymentMethodLabel, useMaskPhone, useZoneRiders,
} from './shared';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { p, storeId, isStore, countryId } = usePanel();
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const mask = useMaskPhone();

  const { data: order, loading } = useLiveDoc<Order>('orders', id);
  const { data: otpDoc } = useLiveDoc<{ delivery_otp?: string | number }>(`orders/${id}/secret`, order ? 'otp' : null);
  const { data: customer } = useDocQ<UserDoc>('users', order?.user_id);
  const { data: zones = [] } = useZones();
  const { data: stores = [] } = useStores();
  const scope: QueryConstraint[] = storeId ? [where('store_id', '==', storeId)] : [];
  const { data: returns = [] } = useListQ<ReturnRequest>(['order-returns', id, storeId], 'return_requests', [where('order_id', '==', id), ...scope], { enabled: !!order });
  const { data: chats = [] } = useListQ<Chat>(['order-chat', id, storeId], 'chats', [where('order_id', '==', id), ...scope, limit(1)], { enabled: !!order });

  const zone = zones.find((z) => z.id === order?.zone_id) || null;
  const store = stores.find((s) => s.id === order?.store_id) || null;
  const selfPickup = order?.delivery_type === 'self_pickup';
  const final = !!order && FINAL_STATUSES.includes(order.status);
  const canUpdate = can('order.update');

  const { data: riders = [], isLoading: ridersLoading } = useZoneRiders(order?.zone_id, !!order && !selfPickup && !final && canUpdate);

  // previous / next order (by created_at within the same scope)
  const [nav, setNav] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  const createdKey = (order?.created_at as any)?.seconds ?? null;
  useEffect(() => {
    if (!order?.created_at) return;
    let alive = true;
    const base: QueryConstraint[] = [...scope, ...(!isStore && countryId ? [where('country_id', '==', countryId)] : [])];
    const one = async (dir: 'prev' | 'next') => {
      try {
        const s = await fetchList<Order>('orders', ...base, where('created_at', dir === 'prev' ? '<' : '>', order.created_at), orderBy('created_at', dir === 'prev' ? 'desc' : 'asc'), limit(1));
        return s[0]?.id ?? null;
      } catch { return null; }
    };
    Promise.all([one('prev'), one('next')]).then(([prev, next]) => alive && setNav({ prev, next }));
    return () => { alive = false; };
  }, [id, createdKey, storeId, countryId]);

  // ---- actions
  const nextStatuses = useMemo(() => (order ? TRANSITIONS[order.status] ?? [] : []), [order?.status]);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [riderId, setRiderId] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [payStatus, setPayStatus] = useState('');
  const [txnId, setTxnId] = useState('');

  useEffect(() => { setNewStatus((nextStatuses.filter((s) => s !== 'cancelled')[0] as OrderStatus) || ''); setNote(''); }, [order?.status]);
  useEffect(() => { setRiderId(order?.delivery_boy_id || ''); }, [order?.delivery_boy_id]);
  useEffect(() => { setPayStatus(order?.payment_status || ''); setTxnId(order?.transaction_id || ''); }, [order?.payment_status, order?.transaction_id]);

  if (!can('order.list') && !can('order.view')) return <Forbidden />;
  if (loading) return <Loading />;
  if (!order || (storeId && order.store_id !== storeId)) return <div className="card"><Empty text="Order not found." /></div>;

  const updateStatus = async () => {
    if (!newStatus) return;
    if (!(await confirm({ title: `Mark this order as ${orderStatusLabel(newStatus)}?`, confirmText: 'Update' }))) return;
    setBusy('status');
    try {
      await adminUpdateOrderStatus({ order_id: order.id, status: newStatus, note: note.trim() || undefined });
      toast(`Order status updated to ${orderStatusLabel(newStatus)}.`);
      setNote('');
    } catch (e: any) { toast(e?.message || 'Could not update status', 'error'); }
    setBusy('');
  };

  const cancel = async () => {
    if (!reason.trim()) { toast('Please provide a cancellation reason.', 'error'); return; }
    setBusy('cancel');
    try {
      await adminUpdateOrderStatus({ order_id: order.id, status: 'cancelled', note: reason.trim() });
      toast('Order cancelled.');
      setCancelOpen(false); setReason('');
    } catch (e: any) { toast(e?.message || 'Could not cancel order', 'error'); }
    setBusy('');
  };

  const assign = async () => {
    if (!riderId) { toast('Select a delivery boy', 'error'); return; }
    setBusy('assign');
    try {
      await assignDeliveryBoy({ order_id: order.id, delivery_boy_id: riderId });
      toast('Delivery boy assigned.');
    } catch (e: any) { toast(e?.message || 'Could not assign delivery boy', 'error'); }
    setBusy('');
  };

  const savePayment = async () => {
    if (!payStatus) return;
    setBusy('payment');
    try {
      await updatePaymentStatus({ order_id: order.id, payment_status: payStatus as any, transaction_id: txnId.trim() || undefined });
      toast('Payment status updated.');
    } catch (e: any) { toast(e?.message || 'Could not update payment status', 'error'); }
    setBusy('');
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this order?', message: 'The order is removed permanently and dashboard totals are adjusted. This cannot be undone.', danger: true, confirmText: 'Delete' }))) return;
    setBusy('delete');
    try {
      await deleteOrder({ order_id: order.id });
      toast('Order deleted.');
      router.replace(p(selfPickup ? '/self-pickup' : '/orders'));
    } catch (e: any) { toast(e?.message || 'Could not delete the order', 'error'); setBusy(''); }
  };

  const invoice = async () => {
    setBusy('invoice');
    try { await openAsync(async () => (await getInvoiceUrl({ order_id: order.id })).url); } catch (e: any) { toast(e?.message || 'Could not generate invoice', 'error'); }
    setBusy('');
  };

  const a = order.address;
  const addrLine = [a?.address_line, a?.landmark, a?.city, a?.state, a?.pincode].filter(Boolean).join(', ');
  const hasPin = typeof a?.lat === 'number' && typeof a?.lng === 'number';
  const mapUrl = hasPin ? `https://www.google.com/maps/search/?api=1&query=${a!.lat},${a!.lng}` : null;
  const points = [
    ...(hasPin && !selfPickup ? [{ lat: a!.lat as number, lng: a!.lng as number, label: 'H', color: '#0E9623', popup: `Customer: ${a?.name || order.customer?.name || ''}` }] : []),
    ...(typeof store?.lat === 'number' && typeof store?.lng === 'number' ? [{ lat: store.lat, lng: store.lng, label: 'S', color: '#3B82F6', popup: `Store: ${store.name}` }] : []),
    ...(order.rider && typeof order.rider.lat === 'number' ? [{ lat: order.rider.lat, lng: order.rider.lng, label: 'R', color: '#F97316', popup: `Rider: ${order.delivery_boy?.name || ''}` }] : []),
  ];

  const t = order.totals ?? ({} as Order['totals']);
  const sumRows: [string, number | undefined, boolean][] = [
    ['Subtotal', t.subtotal, false],
    ['Discount', t.discount, true],
    [`Promo${order.promo_code ? ` (${order.promo_code})` : ''}`, t.promo_discount, true],
    ['Delivery Charge', t.delivery_charge, false],
    ['Surge Charge', t.surge_charge, false],
    ['Additional Charges', t.additional_charges, false],
    ['Tax', t.tax_amount, false],
    ['Wallet Used', t.wallet_used, true],
  ];
  const toCollect = order.payment_method === 'cod' && order.payment_status !== 'paid' && !['cancelled', 'returned'].includes(order.status) ? Number(t.total || 0) : 0;
  const nonCancel = nextStatuses.filter((s) => s !== 'cancelled');
  const otp = otpDoc?.delivery_otp != null ? String(otpDoc.delivery_otp) : '';
  const timeline = [...(order.timeline ?? [])];
  const chat = chats[0];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={p(selfPickup ? '/self-pickup' : '/orders')} className="icon-btn" title="Back"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">{order.order_number}</h1>
              <StatusPill status={order.status} label={orderStatusLabel(order.status)} />
              <ModePill mode={order.mode} />
              {selfPickup && <StatusPill status="self_pickup" label="Self Pickup" />}
            </div>
            <p className="text-sm text-muted mt-0.5">Placed {fmtDateTime(order.created_at)}{store ? ` · ${store.name}` : ''}{zone ? ` · ${zone.name}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chat && can('chat.list') && (
            <Link href={`${p('/chat')}?chat=${chat.id}`} className="btn-soft"><MessageCircle className="w-4 h-4" /> Chat with customer</Link>
          )}
          {!chat && can('chat.reply') && order.user_id && (
            <Link href={`${p('/chat')}?start_user=${order.user_id}&start_order=${order.id}`} className="btn-soft" data-testid="start-chat"><MessageCircle className="w-4 h-4" /> Message customer</Link>
          )}
          {!isStore && can('order.delete') && ['cancelled', 'payment_pending'].includes(order.status) && (
            <button type="button" className="btn-outline !text-red-500 !border-red-300" onClick={remove} disabled={busy === 'delete'} data-testid="delete-order"><Trash2 className="w-4 h-4" /> {busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
          )}
          <button type="button" className="btn-soft" onClick={invoice} disabled={busy === 'invoice'} data-testid="invoice"><Download className="w-4 h-4" /> {busy === 'invoice' ? 'Generating…' : 'Invoice PDF'}</button>
          <div className="flex items-center gap-1">
            <Link href={nav.prev ? p(`/orders/view/${nav.prev}`) : '#'} className={cx('btn-outline btn-sm', !nav.prev && 'opacity-40 pointer-events-none')}><ChevronLeft className="w-4 h-4" /> Previous</Link>
            <Link href={nav.next ? p(`/orders/view/${nav.next}`) : '#'} className={cx('btn-outline btn-sm', !nav.next && 'opacity-40 pointer-events-none')}>Next <ChevronRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="xl:col-span-2 space-y-5 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card title="Customer" icon={User}>
              <dl className="space-y-2.5 text-sm">
                <Row label="Name"><span className="font-semibold text-navy dark:text-white">{customer?.name || order.customer?.name || 'Guest'}</span></Row>
                <Row label="Email"><span className="break-all">{customer?.email || order.customer?.email || '-'}</span></Row>
                <Row label="Mobile">{mask(customer?.phone || order.customer?.phone)}</Row>
                {customer && <Row label="Wallet">{money(customer.wallet_balance ?? 0)}</Row>}
              </dl>
            </Card>

            <Card title="Delivery Address" icon={MapPin} actions={mapUrl ? <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn-soft btn-sm"><Navigation className="w-4 h-4" /> Delivery Location</a> : undefined}>
              {selfPickup && <p className="text-sm mb-3 text-muted">Customer will collect this order from <b className="text-navy dark:text-white">{store?.name || 'the store'}</b>.</p>}
              <dl className="space-y-2.5 text-sm">
                <Row label="Name">
                  <span className="font-semibold text-navy dark:text-white">{a?.name || order.customer?.name || '-'}</span>
                  {a?.label && <span className="pill bg-slate-100 text-slate-600 ml-1">{a.label}</span>}
                </Row>
                <Row label="Mobile">{mask(a?.phone || order.customer?.phone)}</Row>
                <div><dt className="text-muted">Address</dt><dd className="mt-1">{addrLine || '-'}</dd></div>
              </dl>
            </Card>
          </div>

          {points.length > 0 && (
            <Card title="Live Map" icon={MapIcon} subtitle={<span className="inline-flex flex-wrap gap-3"><Legend color="#0E9623" text="Customer" /><Legend color="#3B82F6" text="Store" /><Legend color="#F97316" text={`Rider${order.rider?.updated_at ? ` · ${timeAgo(order.rider.updated_at)}` : ''}`} /></span>}>
              <PointsMap points={points} polygon={zone?.polygon} height={300} />
            </Card>
          )}

          <Card title="Items" icon={ShoppingCart} padding={false} subtitle={`${(order.items ?? []).length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th className="!text-right">Total</th></tr></thead>
                <tbody>
                  {(order.items ?? []).map((it, i) => {
                    const unit = it.sale_price != null && Number(it.sale_price) < Number(it.price) ? it.sale_price : it.price;
                    return (
                      <tr key={`${it.variant_id}-${i}`}>
                        <td>
                          <div className="flex items-center gap-3">
                            <img src={imgUrl(it.image, it.name)} className="w-11 h-11 rounded-lg object-cover border border-line bg-slate-50" alt="" />
                            <div className="min-w-0">
                              <div className="font-medium text-navy dark:text-white">{it.name}</div>
                              <div className="text-xs text-muted">{it.variant_name || '-'}</div>
                              {it.status && ['return_requested', 'returned'].includes(it.status) && <StatusPill status={it.status} className="mt-1" />}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {money(unit)}
                          {it.sale_price != null && Number(it.sale_price) < Number(it.price) && <div className="text-xs text-muted line-through">{money(it.price)}</div>}
                        </td>
                        <td>× {it.qty}</td>
                        <td className="!text-right font-semibold whitespace-nowrap">{money(it.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Payment Summary" icon={Receipt}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <dl className="space-y-2 text-sm">
                {sumRows.filter(([label, amt]) => label === 'Subtotal' || Number(amt || 0) > 0).map(([label, amt, minus]) => (
                  <div key={label} className="flex justify-between"><dt className="text-muted">{label}</dt><dd className={minus ? 'text-red-500' : ''}>{minus ? '- ' : ''}{money(amt)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-line dark:border-dark-line pt-2 text-base font-extrabold text-navy dark:text-white"><dt>Total</dt><dd>{money(t.total)}</dd></div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Payment Method</dt><dd className="font-medium">{paymentMethodLabel(order.payment_method)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Payment Status</dt><dd><StatusPill status={order.payment_status} label={PAYMENT_STATUSES[order.payment_status]} /></dd></div>
                {order.transaction_id && <div className="flex justify-between gap-3"><dt className="text-muted">Transaction ID</dt><dd className="font-mono text-xs break-all text-right">{order.transaction_id}</dd></div>}
                {toCollect > 0 && <div className="flex justify-between"><dt className="text-muted">To Collect (COD)</dt><dd className="font-bold text-amber-600">{money(toCollect)}</dd></div>}
                {order.notes && <div><dt className="text-muted">Order Notes</dt><dd className="mt-1">{order.notes}</dd></div>}
                {order.cancel_reason && (
                  <div><dt className="text-muted">Cancel Reason</dt><dd className="mt-1 text-red-600">{order.cancel_reason} {order.cancelled_by && <span className="text-muted">({order.cancelled_by.charAt(0).toUpperCase() + order.cancelled_by.slice(1)})</span>}</dd></div>
                )}
              </dl>
            </div>
          </Card>

          {returns.length > 0 && (
            <Card title="Return Requests" icon={Undo2} padding={false}>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Return No</th><th>Qty</th><th>Refund</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {returns.map((r) => (
                      <tr key={r.id}>
                        <td className="font-semibold">{r.return_number}</td>
                        <td>{r.qty}</td>
                        <td>{money(r.refund_amount)}</td>
                        <td><StatusPill status={r.status} label={RETURN_STATUSES[r.status]} /></td>
                        <td className="!text-right"><Link href={p(`/returns/view/${r.id}`)} className="icon-btn"><Eye className="w-4 h-4" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5 min-w-0">
          <Card title="Update Status" icon={RefreshCw}>
            {!nextStatuses.length ? (
              <p className="text-sm text-muted">This order is <b>{orderStatusLabel(order.status)}</b>. No further status changes are possible.</p>
            ) : !canUpdate ? (
              <p className="text-sm text-muted">You don&apos;t have permission to update orders.</p>
            ) : (
              <div className="space-y-3">
                {nonCancel.length > 0 && (
                  <>
                    <select className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value as OrderStatus)} data-testid="status-select">
                      {nonCancel.map((s) => <option key={s} value={s}>{orderStatusLabel(s)}</option>)}
                    </select>
                    <textarea className="input" rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
                    <button type="button" className="btn-primary w-full justify-center" onClick={updateStatus} disabled={!newStatus || busy === 'status'} data-testid="update-status">
                      <RefreshCw className={cx('w-4 h-4', busy === 'status' && 'animate-spin')} /> {newStatus ? `Mark as ${orderStatusLabel(newStatus)}` : 'Update'}
                    </button>
                  </>
                )}
                {nextStatuses.includes('cancelled') && (
                  <button type="button" className="btn-outline w-full justify-center !text-red-500 !border-red-300" onClick={() => setCancelOpen(true)} data-testid="cancel-order">
                    <X className="w-4 h-4" /> Cancel Order
                  </button>
                )}
              </div>
            )}
          </Card>

          {!selfPickup && (
            <Card title="Assign Delivery Boy" icon={Bike}>
              {order.delivery_boy_id && (
                <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-primary-50 dark:bg-dark-line">
                  <Avatar src={order.delivery_boy?.avatar} name={order.delivery_boy?.name} className="w-10 h-10" />
                  <div className="min-w-0">
                    <div className="font-semibold text-navy dark:text-white">{order.delivery_boy?.name || 'Delivery Boy'}</div>
                    <div className="text-xs text-muted">
                      {mask(order.delivery_boy?.phone)}{order.delivery_boy?.vehicle_number ? ` · ${order.delivery_boy.vehicle_number}` : ''}{order.assigned_at ? ` · assigned ${timeAgo(order.assigned_at)}` : ''}
                    </div>
                  </div>
                </div>
              )}
              {final ? (
                <p className="text-sm text-muted">Assignment is locked for {orderStatusLabel(order.status).toLowerCase()} orders.</p>
              ) : !canUpdate ? (
                !order.delivery_boy_id && <p className="text-sm text-muted">No delivery boy assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)} data-testid="rider-select">
                    <option value="">{ridersLoading ? 'Loading…' : 'Select delivery boy'}</option>
                    {order.delivery_boy_id && !riders.some((r) => r.id === order.delivery_boy_id) && <option value={order.delivery_boy_id}>{order.delivery_boy?.name || 'Current delivery boy'}</option>}
                    {riders.map((r) => <option key={r.id} value={r.id}>{r.is_online ? '● ' : '○ '}{r.name} {r.is_online ? '(Online)' : '(Offline)'}</option>)}
                  </select>
                  {!ridersLoading && !riders.length && <p className="text-xs text-amber-600">No approved &amp; active delivery boys in this zone.</p>}
                  <button type="button" className="btn-primary w-full justify-center" onClick={assign} disabled={!riderId || busy === 'assign' || riderId === order.delivery_boy_id} data-testid="assign-rider">
                    <UserCheck className="w-4 h-4" /> {busy === 'assign' ? 'Assigning…' : 'Update'}
                  </button>
                </div>
              )}
            </Card>
          )}

          <Card title="Payment Status" icon={CreditCard}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between items-center"><dt className="text-muted">Status</dt><dd><StatusPill status={order.payment_status} label={PAYMENT_STATUSES[order.payment_status]} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Method</dt><dd>{paymentMethodLabel(order.payment_method)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Transaction ID</dt><dd className="font-mono text-xs break-all text-right">{order.transaction_id || '-'}</dd></div>
            </dl>
            {canUpdate && (
              <div className="mt-4 space-y-3 border-t border-line pt-4 dark:border-dark-line">
                <select className="input" value={payStatus} onChange={(e) => setPayStatus(e.target.value)} data-testid="payment-status-select">
                  {Object.entries(PAYMENT_STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input className="input font-mono text-xs" placeholder="Transaction ID (optional)" value={txnId} onChange={(e) => setTxnId(e.target.value)} maxLength={191} />
                <button type="button" className="btn-primary w-full justify-center" onClick={savePayment}
                  disabled={busy === 'payment' || (payStatus === order.payment_status && txnId.trim() === (order.transaction_id || ''))} data-testid="update-payment">
                  <Save className="w-4 h-4" /> {busy === 'payment' ? 'Saving…' : 'Update Payment'}
                </button>
              </div>
            )}
          </Card>

          {otp && (
            <Card title={selfPickup ? 'Pickup OTP' : 'Delivery OTP'} icon={KeyRound}>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3">
                  <div className="text-3xl font-extrabold tracking-[0.4em] text-primary" data-testid="otp-value">{showOtp ? otp : '•'.repeat(otp.length)}</div>
                  <button type="button" className="icon-btn" onClick={() => setShowOtp((v) => !v)} title={showOtp ? 'Hide' : 'Reveal'} data-testid="reveal-otp">
                    {showOtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted mt-2">Customer shares this code at handover.</p>
              </div>
            </Card>
          )}

          <Card title="Status Timeline" icon={History}>
            {!timeline.length ? (
              <p className="text-sm text-muted">No status history yet.</p>
            ) : (
              <ol className="relative border-l-2 border-line dark:border-dark-line ml-2 space-y-5">
                {timeline.map((h, i) => (
                  <li key={i} className="ml-5">
                    <span className="absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white dark:border-dark-card" style={{ background: STATUS_HEX[h.status] ?? '#94A3B8' }} />
                    <div className="font-semibold text-sm text-navy dark:text-white">{h.label || orderStatusLabel(h.status)}</div>
                    {h.note && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{h.note}</div>}
                    <div className="text-xs text-muted mt-0.5">{fmtDateTime(h.at)}{h.by ? ` · ${h.by}` : ''}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Order" size="md">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Cancellation reason <span className="text-red-500">*</span></label>
            <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} autoFocus data-testid="cancel-reason" />
          </div>
          <p className="text-xs text-muted">Wallet amount used and online payments will be refunded to the customer&apos;s wallet; stock is restored.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setCancelOpen(false)}>Close</button>
            <button type="button" className="btn-danger" onClick={cancel} disabled={busy === 'cancel' || !reason.trim()} data-testid="confirm-cancel"><X className="w-4 h-4" /> {busy === 'cancel' ? 'Cancelling…' : 'Cancel Order'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;
}
function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{text}</span>;
}
