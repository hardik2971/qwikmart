/**
 * Orders: placeOrder / verifyPayment / cancelOrder / reorder / getInvoiceUrl / requestReturn / submitReview callables,
 * owner reads of orders (live via onSnapshot), the delivery OTP (orders/{id}/secret/otp) and the rider position
 * (`rider`, copied onto the order by the onDeliveryBoyLocation trigger).
 */
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { ReturnBody, ReviewBody, Unsubscribe } from '../api-types';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type { Id, Order, OrderDetail, OrderItem, OrderTrack, Paginated, PaymentPayload, PlaceOrderPayload, ReturnRequest } from '../types';
import { call, customerUid, guard, iso, num, sid, type Raw } from './core';
import { cart, setPromoCode, summaryArgs } from './cart';

const db = () => fb().db;
const ACTIVE = ['payment_pending', 'received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
const FINAL = ['delivered', 'cancelled', 'returned'];

/* ------------------------------------------------------------------ conversion */

function toItem(i: Raw, o: Raw): OrderItem {
  const deliveredAt = o.delivered_at ? new Date(iso(o.delivered_at)).getTime() : 0;
  const returnable =
    o.status === 'delivered' &&
    i.return_allowed === true &&
    !['return_requested', 'returned'].includes(i.status) &&
    deliveredAt > 0 &&
    deliveredAt + num(i.return_days) * 86_400_000 > Date.now();
  return {
    id: i.id ?? i.variant_id,
    product_id: i.product_id,
    product_variant_id: i.variant_id,
    product_name: i.name ?? '',
    variant_name: i.variant_name ?? '',
    image: i.image ?? '',
    price: num(i.price),
    sale_price: i.sale_price ?? null,
    qty: num(i.qty),
    total: num(i.total),
    status: i.status ?? o.status,
    return_status: i.return_status ?? null,
    can_return: returnable,
    can_review: ['delivered', 'returned'].includes(o.status) ? !i.is_reviewed : false,
  };
}

export function toOrder(id: string, o: Raw): OrderDetail {
  const t = o.totals ?? {};
  const items: OrderItem[] = (o.items ?? []).map((i: Raw) => toItem(i, o));
  const addr = o.address ?? null;
  return {
    id,
    order_number: o.order_number,
    mode: o.mode,
    delivery_type: o.delivery_type,
    status: o.status,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    subtotal: num(t.subtotal),
    discount: num(t.discount),
    promo_discount: num(t.promo_discount),
    promo_code: o.promo_code ?? null,
    promo_is_cashback: !!o.promo_is_cashback,
    delivery_charge: num(t.delivery_charge),
    surge_charge: num(t.surge_charge) + num(t.additional_charges),
    additional_charges: num(t.additional_charges),
    grand_total: num(t.grand_total) || num(t.total),
    tax_amount: num(t.tax_amount),
    wallet_used: num(t.wallet_used),
    total: num(t.total),
    items_count: items.length,
    items,
    preview_images: items.slice(0, 3).map((i) => i.image),
    created_at: iso(o.created_at),
    estimated_delivery_at: o.estimated_delivery_at ? iso(o.estimated_delivery_at) : null,
    address_snapshot: addr,
    timeline: (o.timeline ?? []).map((e: Raw) => ({ status: e.status, note: e.label || e.note, created_at: iso(e.at) })),
    delivery_otp: null,
    delivery_boy: o.delivery_boy
      ? { name: o.delivery_boy.name ?? 'Delivery partner', phone: o.delivery_boy.phone ?? '', avatar: o.delivery_boy.avatar ?? null, lat: o.rider?.lat, lng: o.rider?.lng }
      : null,
    store: addr?.self_pickup ? { id: o.store_id ?? '', name: addr.store ?? 'Store', slug: '', address: addr.full_address ?? '', lat: addr.lat, lng: addr.lng } : null,
    invoice_url: null,
    can_cancel: !!o.can_cancel,
    can_return: items.some((i) => i.can_return),
    notes: o.notes ?? null,
    cancel_reason: o.cancel_reason ?? null,
  };
}

const storeCache = new Map<string, Promise<{ lat: number | null; lng: number | null; name: string } | null>>();
function storeLoc(id: string | null) {
  if (!id) return Promise.resolve(null);
  if (!storeCache.has(id)) {
    storeCache.set(
      id,
      getDoc(doc(db(), 'stores', id))
        .then((s) => (s.exists() ? { lat: s.get('lat') ?? null, lng: s.get('lng') ?? null, name: s.get('name') ?? 'Store' } : null))
        .catch(() => null),
    );
  }
  return storeCache.get(id)!;
}

async function toTrack(o: Raw): Promise<OrderTrack> {
  const store = await storeLoc(o.store_id ?? null);
  const eta = o.estimated_delivery_at ? Math.max(0, Math.round((new Date(iso(o.estimated_delivery_at)).getTime() - Date.now()) / 60_000)) : null;
  return {
    status: o.status,
    delivery_boy: o.rider
      ? { lat: o.rider.lat ?? null, lng: o.rider.lng ?? null, updated_at: iso(o.rider.updated_at) || null, name: o.delivery_boy?.name, phone: o.delivery_boy?.phone }
      : null,
    store,
    address: o.address ? { lat: o.address.lat ?? undefined, lng: o.address.lng ?? undefined, full_address: o.address.full_address } : null,
    eta_minutes: ACTIVE.includes(o.status) ? eta : null,
  };
}

/** Delivery OTP — readable by the order owner (never by the rider). */
async function otp(orderId: string, status: string): Promise<string | null> {
  if (FINAL.includes(status)) return null;
  try {
    const s = await getDoc(doc(db(), 'orders', orderId, 'secret', 'otp'));
    return s.exists() ? String(s.get('delivery_otp') ?? '') || null : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ place & pay */

export async function placeOrder(body: PlaceOrderPayload): Promise<{ order: { id: Id; order_number: string }; payment: PaymentPayload | null }> {
  await customerUid();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await call<Raw>(
    'placeOrder',
    summaryArgs({
      address_id: body.address_id ? String(body.address_id) : undefined,
      delivery_type: body.delivery_type,
      payment_method: body.payment_method,
      promo_code: body.promo_code || undefined,
      use_wallet: !!body.use_wallet,
      notes: body.notes || undefined,
      return_url: `${origin}/checkout/success?pay=1`,
    }),
  );
  setPromoCode(null);
  return { order: { id: res.order_id, order_number: res.order_number }, payment: res.payment ?? null };
}

export async function verifyPayment(orderId: Id, payload: Record<string, unknown>): Promise<void> {
  await call('verifyPayment', { order_id: String(orderId), gateway: payload.gateway, payload });
}

/* ------------------------------------------------------------------ reads */

export async function orders(status?: string, p = 1): Promise<Paginated<Order>> {
  const id = await customerUid();
  const cs: QueryConstraint[] = [where('user_id', '==', id)];
  if (status === 'active') cs.push(where('status', 'in', ACTIVE));
  else if (status) cs.push(where('status', '==', status));
  cs.push(orderBy('created_at', 'desc'), limit(100));
  const s = await guard(() => getDocs(query(collection(db(), 'orders'), ...cs)));
  const all = s.docs.map((d) => toOrder(d.id, d.data()));
  const per = 20;
  return {
    items: all.slice((p - 1) * per, p * per),
    meta: { current_page: p, last_page: Math.max(1, Math.ceil(all.length / per)), per_page: per, total: all.length },
  };
}

async function orderSnap(id: Id) {
  await customerUid();
  try {
    const s = await getDoc(doc(db(), 'orders', String(id)));
    if (!s.exists()) throw new ApiError('Order not found', 404);
    return s;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Order not found', 404);
  }
}

export async function order(id: Id): Promise<OrderDetail> {
  const s = await orderSnap(id);
  const o = toOrder(s.id, s.data());
  o.delivery_otp = await otp(s.id, o.status);
  return o;
}

export async function trackOrder(id: Id): Promise<OrderTrack> {
  const s = await orderSnap(id);
  return toTrack(s.data());
}

/** Live order updates (status, timeline, rider position). */
export function watchOrder(id: Id, cb: (o: OrderDetail, track: OrderTrack) => void, onError?: (e: unknown) => void): Unsubscribe {
  let cachedOtp: string | null | undefined;
  let alive = true;
  const unsub = onSnapshot(
    doc(db(), 'orders', String(id)),
    async (s) => {
      if (!s.exists()) return;
      const raw = s.data();
      const o = toOrder(s.id, raw);
      if (cachedOtp === undefined || FINAL.includes(o.status)) cachedOtp = await otp(s.id, o.status);
      o.delivery_otp = cachedOtp;
      const track = await toTrack(raw);
      if (alive) cb(o, track);
    },
    (e) => onError?.(e),
  );
  return () => {
    alive = false;
    unsub();
  };
}

/* ------------------------------------------------------------------ actions */

export async function cancelOrder(id: Id, reason: string): Promise<void> {
  await call('cancelOrder', { order_id: String(id), reason });
}

export async function reorder(id: Id) {
  const r = await call<{ added: number; skipped: string[] }>('reorder', summaryArgs({ order_id: String(id) }));
  const c = await cart();
  const message = r.added
    ? `${r.added} item(s) added to cart${r.skipped?.length ? ` · unavailable: ${r.skipped.join(', ')}` : ''}`
    : `No items could be added${r.skipped?.length ? ` (${r.skipped.join(', ')})` : ''}`;
  if (!r.added) throw new ApiError(message, 422);
  return { cart: c, message };
}

export async function invoiceUrl(id: Id): Promise<string | null> {
  const r = await call<{ url?: string }>('getInvoiceUrl', { order_id: String(id) });
  return r.url ?? null;
}

/** Uploads the return photos to Storage users/{uid}/returns/… and calls requestReturn. */
export async function createReturn(b: ReturnBody): Promise<ReturnRequest> {
  const owner = await customerUid();
  const paths: string[] = [];
  for (const [i, file] of (b.images ?? []).slice(0, 5).entries()) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new ApiError('Photos must be images of 5 MB or less.', 422);
    const path = `users/${owner}/returns/${sid(b.order_id)}_${Date.now()}_${i}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
    await guard(() => uploadBytes(storageRef(fb().storage, path), file, { contentType: file.type }));
    paths.push(path);
  }
  const r = await call<Raw>('requestReturn', { order_id: String(b.order_id), variant_id: String(b.item.product_variant_id), qty: b.qty, reason: b.reason, images: paths });
  return { id: r.id, return_number: r.return_number, qty: b.qty, reason: b.reason, status: r.status, refund_amount: num(r.refund_amount), created_at: new Date().toISOString() };
}

/** Uploads the review photos to Storage reviews/{uid}/… (public read) and calls submitReview with their download URLs (reviews are public, every client renders the URL directly). */
export async function createReview(b: ReviewBody): Promise<void> {
  const owner = await customerUid();
  const paths: string[] = [];
  for (const [i, file] of (b.images ?? []).slice(0, 5).entries()) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new ApiError('Photos must be images of 5 MB or less.', 422);
    const path = `reviews/${owner}/${sid(b.order_id)}_${Date.now()}_${i}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
    const r = storageRef(fb().storage, path);
    await guard(() => uploadBytes(r, file, { contentType: file.type }));
    paths.push(await guard(() => getDownloadURL(r)));
  }
  await call('submitReview', { order_id: String(b.order_id), variant_id: String(b.item.product_variant_id), rating: b.rating, comment: b.comment, images: paths });
}

/** Public URL of an uploaded Storage object (avatars). */
export const downloadUrl = (path: string) => getDownloadURL(storageRef(fb().storage, path));
