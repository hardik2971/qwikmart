'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Box,
  CheckCircle2,
  Copy,
  FileDown,
  Headset,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { STATUS_LABEL, STATUS_STYLE, formatDate } from '@/lib/format';
import type { OrderDetail, OrderItem } from '@/lib/types';
import { useCartKey, useCurrency, useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { EmptyState, Modal, Spinner, StatusPill } from '@/components/ui';
import { PAYMENT_BRANDS } from '@/components/icons';

const TrackingMap = dynamic(() => import('@/components/map/TrackingMap'), {
  ssr: false,
  loading: () => <div className="skeleton h-[360px] w-full" />,
});

const FLOW = ['received', 'processed', 'shipped', 'out_for_delivery', 'delivered'];
/** Position of any backend status on the 5-step FLOW (picked_up / ready_for_pickup sit between shipped and out_for_delivery). */
const FLOW_RANK: Record<string, number> = { payment_pending: -1, received: 0, processed: 1, shipped: 2, ready_for_pickup: 2, picked_up: 2, out_for_delivery: 3, delivered: 4, returned: 4 };
const ACTIVE = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
const CANCEL_REASONS = ['Ordered by mistake', 'Delivery is taking too long', 'Found a better price elsewhere', 'Need to change address', 'Other'];
const RETURN_REASONS = ['Damaged / defective product', 'Wrong item delivered', 'Expired / near expiry', 'Quality not as expected', 'Other'];

function invoiceHtml(o: OrderDetail, fmt: (n: number) => string) {
  const rows = o.items
    .map((i) => `<tr><td>${i.product_name}<br><small>${i.variant_name}</small></td><td>${i.qty}</td><td>${fmt(i.sale_price ?? i.price)}</td><td>${fmt(i.total)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><title>Invoice ${o.order_number}</title><style>
  body{font-family:system-ui,sans-serif;color:#344054;padding:32px;max-width:760px;margin:auto}h1{color:#0E9623;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #E6EAF2;padding:8px;text-align:left}
  .r{text-align:right}.tot td{font-weight:700}</style></head><body>
  <h1>QwikMart</h1><p>Tax Invoice · <b>${o.order_number}</b> · ${formatDate(o.created_at)}</p>
  <p><b>Bill to:</b> ${o.address_snapshot?.name ?? ''}<br>${o.address_snapshot?.address_line ?? ''} ${o.address_snapshot?.city ?? ''} ${o.address_snapshot?.pincode ?? ''}</p>
  <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}
  <tr><td colspan=3>Subtotal</td><td>${fmt(o.subtotal)}</td></tr>
  <tr><td colspan=3>Delivery</td><td>${fmt(o.delivery_charge)}</td></tr>
  ${o.promo_discount && !o.promo_is_cashback ? `<tr><td colspan=3>Coupon</td><td>-${fmt(o.promo_discount)}</td></tr>` : ''}
  ${o.wallet_used ? `<tr><td colspan=3>Wallet</td><td>-${fmt(o.wallet_used)}</td></tr>` : ''}
  <tr class=tot><td colspan=3>Total paid (${o.payment_method.toUpperCase()})</td><td>${fmt(o.total)}</td></tr></table>
  <p style="margin-top:24px;font-size:12px">Thank you for shopping with QwikMart!</p><script>window.print()</script></body></html>`;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const authed = useIsAuthed();
  const router = useRouter();
  const qc = useQueryClient();
  const cartKey = useCartKey();
  const { fmt } = useCurrency();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [reasonText, setReasonText] = useState('');
  const [returnItem, setReturnItem] = useState<OrderItem | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);

  // Firebase: live updates via onSnapshot (status, timeline, rider position, OTP); mock: polling
  const realtime = api.realtime && !!api.watchOrder;
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.order(id), enabled: authed, refetchInterval: realtime ? false : 10_000 });
  const o = q.data;
  const live = !!o && ACTIVE.includes(o.status) && o.delivery_type === 'delivery';
  const track = useQuery({
    queryKey: ['track', id],
    queryFn: () => api.trackOrder(id),
    enabled: authed && live,
    refetchInterval: realtime ? false : 5000,
  });
  useEffect(() => {
    if (!authed || !realtime || !api.watchOrder) return;
    return api.watchOrder(id, (order, t) => {
      qc.setQueryData(['order', id], order);
      qc.setQueryData(['track', id], t);
    });
  }, [authed, realtime, id, qc]);

  const cancel = useMutation({
    mutationFn: () => api.cancelOrder(id, reason === 'Other' ? reasonText || 'Other' : reason),
    onSuccess: () => {
      toast.success('Order cancelled');
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reorder = useMutation({
    mutationFn: () => api.reorder(id),
    onSuccess: ({ cart, message }) => {
      qc.setQueryData(cartKey, cart);
      toast.success(message || 'Items added to cart');
      router.push('/cart');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copyOtp = async () => {
    if (!o?.delivery_otp) return;
    await navigator.clipboard.writeText(o.delivery_otp).catch(() => null);
    toast.success('OTP copied');
  };
  const shareOtp = async () => {
    const text = `My QwikMart delivery OTP for ${o?.order_number} is ${o?.delivery_otp}`;
    if (navigator.share) await navigator.share({ text }).catch(() => null);
    else {
      await navigator.clipboard.writeText(text).catch(() => null);
      toast.success('Copied to clipboard');
    }
  };

  const invoice = async () => {
    if (!o) return;
    // getInvoiceUrl callable → signed PDF URL (generated on first request); the demo mock prints an HTML invoice
    const tab = window.open('', '_blank');
    try {
      const url = await api.invoiceUrl(o.id);
      if (url) {
        if (tab) tab.location.href = url;
        else window.location.href = url;
        return;
      }
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
      return;
    }
    const w = tab;
    if (w) {
      w.document.write(invoiceHtml(o, fmt));
      w.document.close();
    }
  };

  const crumbs = [{ label: 'My Orders', href: '/orders' }, { label: o?.order_number || `#${id}` }];

  if (q.isLoading || !authed)
    return (
      <AccountShell title="Order Detail" crumbs={crumbs}>
        <div className="space-y-4">
          <div className="skeleton h-28" />
          <div className="skeleton h-80" />
        </div>
      </AccountShell>
    );
  if (!o)
    return (
      <AccountShell title="Order Detail" crumbs={crumbs}>
        <EmptyState icon={<Package className="h-9 w-9" />} title="Order not found" action={<Link href="/orders" className="btn-primary">My Orders</Link>} />
      </AccountShell>
    );

  const flowIdx = FLOW_RANK[o.status] ?? FLOW.indexOf(o.status);
  // last timeline entry per FLOW step (backend statuses like picked_up fold into the nearest step)
  const stepEntry = (step: number) => [...o.timeline].reverse().find((t) => (FLOW_RANK[t.status] ?? -2) === step);
  const steps =
    o.status === 'cancelled'
      ? o.timeline
      : FLOW.map((s, i) => stepEntry(i) || { status: s, note: STATUS_LABEL[s], created_at: '', pending: i > flowIdx });

  return (
    <AccountShell title="Order Detail" crumbs={crumbs}>
      <div className="space-y-5">
        {/* header */}
        <div className="card flex flex-wrap items-center justify-between gap-4 border-s-4 border-s-primary p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-primary-50 text-primary">
              <Box className="h-6 w-6" />
            </span>
            <div>
              <div className="text-xs text-muted">Order Number</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-extrabold text-ink">{o.order_number}</span>
                <StatusPill label={STATUS_LABEL[o.status] || o.status} className={STATUS_STYLE[o.status]} />
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {formatDate(o.created_at)} · <span className="capitalize">{o.mode}</span> · {o.delivery_type === 'self_pickup' ? 'Self pickup' : 'Delivery'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {o.delivery_otp && o.status !== 'cancelled' && o.status !== 'delivered' && (
              <span className="rounded-btn border border-line px-3 py-2 text-sm">
                <span className="text-xs text-muted">OTP </span>
                <span className="font-extrabold tracking-widest text-primary">{o.delivery_otp}</span>
              </span>
            )}
            <button onClick={invoice} className="btn-ghost">
              <FileDown className="h-4 w-4" /> Get Invoice
            </button>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            {live && (
              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold">
                    <Truck className="h-5 w-5 text-primary" /> Live Tracking
                  </h2>
                  {track.data?.eta_minutes != null && (
                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary">
                      {track.data.eta_minutes > 0 ? `Arriving in ~${track.data.eta_minutes} min` : 'Arriving soon'}
                    </span>
                  )}
                </div>
                {track.data ? <TrackingMap track={track.data} /> : <div className="skeleton h-[360px]" />}
                {o.delivery_boy && (
                  <div className="mt-3 flex items-center gap-3 rounded-btn bg-soft p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">{o.delivery_boy.name[0]}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-ink">I&apos;m {o.delivery_boy.name}, your delivery partner</div>
                      <div className="text-xs text-muted">Live location updates as your order moves</div>
                    </div>
                    <a href={`tel:${o.delivery_boy.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white" aria-label="Call">
                      <Phone className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </section>
            )}

            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <MapPin className="h-5 w-5 text-primary" /> {o.delivery_type === 'self_pickup' ? 'Pickup Store' : 'Shipping Address'}
              </h2>
              {o.delivery_type === 'self_pickup' ? (
                <p className="text-sm">{o.store?.name} — {o.store?.address}</p>
              ) : (
                <div className="text-sm">
                  <div className="font-semibold text-ink">Deliver to: {o.address_snapshot?.name}</div>
                  <div className="text-muted">
                    {o.address_snapshot?.address_line}, {o.address_snapshot?.landmark} {o.address_snapshot?.city} {o.address_snapshot?.state} ({o.address_snapshot?.pincode})
                  </div>
                  <div className="text-muted">Phone: {o.address_snapshot?.phone}</div>
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <Package className="h-5 w-5 text-primary" /> Items ({o.items.length})
              </h2>
              <div className="divide-y divide-line">
                {o.items.map((i) => (
                  <div key={i.id} className="flex gap-3 py-3">
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-soft">
                      <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <Link href={i.product_slug ? `/product/${i.product_slug}` : '#'} className="line-clamp-2 text-sm font-semibold text-ink hover:text-primary">
                          {i.product_name}
                        </Link>
                        <span className="shrink-0 text-sm font-bold text-ink">{fmt(i.total)}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {i.variant_name} × {i.qty}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {i.status === 'return_requested' && <StatusPill label="Return requested" className={STATUS_STYLE.return_requested} />}
                        {(i.can_return ?? o.can_return) && i.status !== 'return_requested' && i.status !== 'returned' && (
                          <button onClick={() => setReturnItem(i)} className="chip py-1 text-xs">
                            <RotateCcw className="h-3.5 w-3.5" /> Return
                          </button>
                        )}
                        {o.status === 'delivered' && i.can_review !== false && (
                          <button onClick={() => setReviewItem(i)} className="chip py-1 text-xs">
                            <Star className="h-3.5 w-3.5" /> Rate &amp; Review
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <a href={o.delivery_boy ? `tel:${o.delivery_boy.phone}` : '#'} className="card flex items-center gap-3 p-4 hover:border-primary">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary"><Phone className="h-4 w-4" /></span>
                <span>
                  <span className="block text-sm font-semibold text-ink">Stay Connected</span>
                  <span className="block text-xs text-muted">{o.delivery_boy ? `Call ${o.delivery_boy.name}` : 'Partner will be assigned soon'}</span>
                </span>
              </a>
              <Link href={`/support?order=${o.id}&no=${encodeURIComponent(o.order_number)}`} className="card flex items-center gap-3 p-4 hover:border-primary">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary"><Headset className="h-4 w-4" /></span>
                <span>
                  <span className="block text-sm font-semibold text-ink">We&apos;re Here for You</span>
                  <span className="block text-xs text-muted">Chat with support about this order</span>
                </span>
              </Link>
            </div>
          </div>

          <div className="space-y-5">
            {o.delivery_otp && !['cancelled', 'delivered', 'returned'].includes(o.status) && (
              <section className="card overflow-hidden">
                <div className="flex items-center gap-2 bg-primary px-5 py-3 text-white">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="font-semibold">Delivery Verification</span>
                </div>
                <div className="p-5 text-center">
                  <p className="text-xs text-muted">Share this OTP with your delivery partner</p>
                  <div className="mt-2 text-4xl font-extrabold tracking-[0.3em] text-primary">{o.delivery_otp}</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={copyOtp} className="btn-soft py-2">
                      <Copy className="h-4 w-4" /> Copy OTP
                    </button>
                    <button onClick={shareOtp} className="btn-soft py-2">
                      <Share2 className="h-4 w-4" /> Share OTP
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold">
                <Truck className="h-5 w-5 text-primary" /> Track Order
              </h2>
              <ol className="relative space-y-5 ps-2">
                {steps.map((s, i) => {
                  const pending = 'pending' in s && s.pending;
                  const cancelled = s.status === 'cancelled';
                  return (
                    <li key={i} className="relative flex gap-3">
                      {i < steps.length - 1 && <span className={clsx('absolute start-[15px] top-8 h-[calc(100%+4px)] w-0.5', pending ? 'bg-line' : 'bg-primary')} />}
                      <span
                        className={clsx(
                          'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          cancelled ? 'bg-danger text-white' : pending ? 'bg-soft text-muted' : 'bg-primary text-white',
                        )}
                      >
                        {cancelled ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </span>
                      <div>
                        <div className={clsx('text-sm font-semibold', pending ? 'text-muted' : 'text-ink')}>{STATUS_LABEL[s.status] || s.note}</div>
                        {s.created_at && <div className="text-xs text-muted">{formatDate(s.created_at)}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {live && (
                <button onClick={() => track.refetch()} className="btn-soft mt-4 w-full py-2">
                  <RefreshCw className={clsx('h-4 w-4', track.isFetching && 'animate-spin')} /> Track order
                </button>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-3 font-bold">Billing details</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Payment Method</span><span className="font-semibold text-ink">{PAYMENT_BRANDS[o.payment_method]?.name || o.payment_method}</span></div>
                <div className="flex justify-between"><span className="text-muted">Payment Status</span><span className="font-semibold capitalize text-ink">{o.payment_status}</span></div>
                <div className="flex justify-between"><span className="text-muted">Subtotal (incl. tax)</span><span className="font-semibold text-ink">{fmt(o.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Delivery Charge</span><span className="font-semibold text-ink">{o.delivery_charge ? fmt(o.delivery_charge) : 'FREE'}</span></div>
                {o.surge_charge - (o.additional_charges ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted">Surge fee</span><span className="font-semibold text-ink">{fmt(o.surge_charge - (o.additional_charges ?? 0))}</span></div>}
                {(o.additional_charges ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted">Other charges</span><span className="font-semibold text-ink">{fmt(o.additional_charges ?? 0)}</span></div>}
                {o.promo_discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">{o.promo_is_cashback ? 'Cashback' : 'Coupon'}{o.promo_code ? ' (' + o.promo_code + ')' : ''}</span>
                    <span className="font-semibold text-primary">{o.promo_is_cashback ? '+' + fmt(o.promo_discount) + ' to wallet' : '−' + fmt(o.promo_discount)}</span>
                  </div>
                )}
                {o.wallet_used > 0 && <div className="flex justify-between"><span className="text-muted">Wallet</span><span className="font-semibold text-primary">−{fmt(o.wallet_used)}</span></div>}
                <div className="flex justify-between border-t border-line pt-2 text-base"><span className="font-bold text-ink">Total Amount</span><span className="font-extrabold text-primary">{fmt(o.total)}</span></div>
                {o.discount + o.promo_discount > 0 && (
                  <div className="rounded-btn bg-primary-50 px-3 py-2 text-center text-xs font-semibold text-primary dark:bg-primary/10">
                    You Saved {fmt(o.discount + o.promo_discount)}
                  </div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-2">
              {o.can_cancel && (
                <button onClick={() => setCancelOpen(true)} className="btn border border-danger text-danger hover:bg-red-50 dark:hover:bg-red-500/10">
                  <XCircle className="h-4 w-4" /> Cancel Order
                </button>
              )}
              <button onClick={() => reorder.mutate()} disabled={reorder.isPending} className={clsx('btn-primary', !o.can_cancel && 'col-span-2')}>
                {reorder.isPending ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Reorder
              </button>
            </div>
            {o.cancel_reason && <p className="text-xs text-muted">Cancellation reason: {o.cancel_reason}</p>}
          </div>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel" size="sm">
        <label className="label">
          Reason<span className="text-danger">*</span>
        </label>
        <div className="space-y-2">
          {CANCEL_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" checked={reason === r} onChange={() => setReason(r)} className="accent-[#0E9623]" /> {r}
            </label>
          ))}
        </div>
        {reason === 'Other' && (
          <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} placeholder="Write cancel reason..." className="input mt-3" />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setCancelOpen(false)} className="btn-ghost">Keep Order</button>
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="btn bg-danger text-white hover:bg-red-600">
            {cancel.isPending && <Spinner />} Cancel Order
          </button>
        </div>
      </Modal>

      {returnItem && <ReturnModal item={returnItem} onClose={() => setReturnItem(null)} orderId={id} />}
      {reviewItem && <ReviewModal item={reviewItem} orderId={id} onClose={() => setReviewItem(null)} />}
    </AccountShell>
  );
}

function ReturnModal({ item, onClose, orderId }: { item: OrderItem; onClose: () => void; orderId: string }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const m = useMutation({
    mutationFn: () => api.createReturn({ order_id: orderId, item, qty, reason: details ? `${reason}: ${details}` : reason, images: photos }),
    onSuccess: (r) => {
      toast.success(`Return ${r.return_number} requested`);
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Request Return" size="sm">
      <div className="mb-4 text-sm font-semibold text-ink">{item.product_name}</div>
      <label className="label">Quantity</label>
      <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="input mb-3">
        {Array.from({ length: item.qty }, (_, i) => i + 1).map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <label className="label">Reason</label>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="input mb-3">
        {RETURN_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Tell us more (optional)" className="input" />
      <label className="label mt-3">Photos (optional, up to 5)</label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 5))}
        className="block w-full text-xs text-muted file:me-3 file:rounded-btn file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
      />
      {photos.length > 0 && <p className="mt-1 text-xs text-muted">{photos.length} photo(s) selected</p>}
      <p className="mt-2 text-xs text-muted">Refund will be credited to your QwikMart wallet once the pickup is completed.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Close</button>
        <button onClick={() => m.mutate()} disabled={m.isPending} className="btn-primary">
          {m.isPending && <Spinner />} Submit Return
        </button>
      </div>
    </Modal>
  );
}

function ReviewModal({ item, orderId, onClose }: { item: OrderItem; orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const m = useMutation({
    mutationFn: () => api.createReview({ order_id: orderId, item, rating, comment, images: photos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Thanks for your review!');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Rate & Review" size="sm">
      <div className="text-sm font-semibold text-ink">{item.product_name}</div>
      <div className="my-4 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star className={clsx('h-9 w-9', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-line')} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="Share your experience…" className="input" />
      <label className="label mt-3">Photos (optional, up to 5)</label>
      <input
        type="file"
        accept="image/*"
        multiple
        data-testid="review-photos"
        onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 5))}
        className="block w-full text-xs text-muted file:me-3 file:rounded-btn file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
      />
      {photos.length > 0 && <p className="mt-1 text-xs text-muted">{photos.length} photo(s) selected</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => m.mutate()} disabled={m.isPending} className="btn-primary">
          {m.isPending && <Spinner />} Submit
        </button>
      </div>
    </Modal>
  );
}
