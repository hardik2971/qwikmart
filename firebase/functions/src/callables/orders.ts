/** Customer order callables. */
import { authed, db, invalid, notFound, now, numIn, oneOf, precondition, str } from '../shared/firebase';
import type { Mode, OrderDoc, ProductDoc, StoreStockDoc, UserDoc } from '../shared/types';
import { isOn, num } from '../shared/util';
import { cancelOrder as cancelOrderSvc, confirmPayment, placeOrder as placeOrderSvc, publicOrder, requestReturn as requestReturnSvc } from '../services/orders';
import { findVariant, pricingFor, supports } from '../services/cart';
import { storeFor } from '../services/zones';
import { invoiceUrl, storageDownloadUrl } from '../services/invoice';
import { requirePanel } from '../shared/access';

const MODES = ['quick', 'ecommerce'] as const;

export const placeOrder = authed<Record<string, unknown>>(async (d, ctx) => {
  if (ctx.token.firebase && (ctx.token.firebase as { sign_in_provider?: string }).sign_in_provider === 'anonymous') {
    precondition('Please log in to place an order.');
  }
  return placeOrderSvc(ctx.uid, {
    zone_id: str(d.zone_id, 'zone_id', { max: 128 }) || null,
    mode: oneOf(d.mode, 'mode', MODES, 'quick'),
    address_id: str(d.address_id, 'address_id', { max: 128 }) || null,
    delivery_type: oneOf(d.delivery_type, 'delivery_type', ['delivery', 'self_pickup'] as const, 'delivery'),
    payment_method: str(d.payment_method, 'payment_method', { required: true, max: 30 }),
    promo_code: str(d.promo_code, 'promo_code', { max: 40 }) || null,
    use_wallet: !!d.use_wallet,
    notes: str(d.notes, 'notes', { max: 500 }) || null,
    platform: d.platform === 'web' ? 'web' : 'app',
    return_url: str(d.return_url, 'return_url', { max: 500 }) || null,
    lang: str(d.lang, 'lang', { max: 10 }) || 'en',
  });
});

export const verifyPayment = authed<{ order_id?: string; gateway?: string; payload?: Record<string, unknown> }>(async (d, ctx) => {
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const order = await confirmPayment(ctx.uid, orderId, { ...(d.payload ?? {}) });
  return { order: publicOrder(order), paid: true };
});

export const cancelOrder = authed<{ order_id?: string; reason?: string }>(async (d, ctx) => {
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const reason = str(d.reason, 'reason', { max: 500 }) || null;
  const o = await cancelOrderSvc(orderId, reason, ctx.uid, 'customer');
  return { order: publicOrder(o) };
});

export const reorder = authed<{ order_id?: string; zone_id?: string; mode?: Mode }>(async (d, ctx) => {
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists || snap.get('user_id') !== ctx.uid) notFound('Order not found.');
  const order = snap.data() as OrderDoc;
  const mode = (d.mode ? oneOf(d.mode, 'mode', MODES) : order.mode) as Mode;
  const zoneId = str(d.zone_id, 'zone_id', { max: 128 }) || order.zone_id;
  const store = await storeFor(zoneId, mode);
  if (mode === 'quick' && !store) precondition('We do not deliver to your location yet. Please select a serviceable zone.');
  const stockStore = mode === 'quick' ? store?.id ?? null : null;
  let added = 0;
  const skipped: string[] = [];
  for (const item of order.items) {
    try {
      const p = await db.doc(`products/${item.product_id}`).get();
      if (!p.exists) throw new Error('unavailable');
      const product = p.data() as ProductDoc;
      const v = findVariant(product, item.variant_id);
      if (!v || !isOn(v.status) || product.status !== 'active' || !supports(product.fulfillment_type, mode)) throw new Error('unavailable');
      const ss = stockStore ? await db.doc(`store_stocks/${stockStore}_${item.variant_id}`).get() : null;
      const pr = pricingFor(v, ss?.exists ? (ss.data() as StoreStockDoc) : null);
      const lineId = `${mode}_${stockStore ?? 'central'}_${item.variant_id}`;
      const lineRef = db.doc(`users/${ctx.uid}/cart/${lineId}`);
      const cur = await lineRef.get();
      const qty = num(cur.get('qty')) + item.qty;
      const max = num(product.max_qty_per_order);
      if ((max > 0 && qty > max) || qty > pr.stock) throw new Error('stock');
      await lineRef.set({ product_id: item.product_id, variant_id: item.variant_id, store_id: stockStore, mode, qty, added_at: cur.get('added_at') ?? now() }, { merge: true });
      added++;
    } catch {
      skipped.push(item.name);
    }
  }
  return { added, skipped };
});

export const getInvoiceUrl = authed<{ order_id?: string }>(async (d, ctx) => {
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists) notFound('Order not found.');
  const order = { id: snap.id, ...(snap.data() as OrderDoc) };
  const isAssignedRider = ctx.role === 'delivery_boy' && !!order.delivery_boy_id && order.delivery_boy_id === ctx.uid;
  if (order.user_id !== ctx.uid && !isAssignedRider) {
    const actor = await requirePanel(ctx, 'order.view', 'order.list');
    if (actor.kind === 'store' && order.store_id !== actor.storeId) notFound('Order not found.');
  }
  if (order.status === 'payment_pending' || order.status === 'cancelled') precondition('Invoice is not available for this order.');
  return invoiceUrl(order);
}, { memory: '512MiB', timeoutSeconds: 120 });

export const requestReturn = authed<{ order_id?: string; variant_id?: string; qty?: number; reason?: string; images?: string[] }>(async (d, ctx) => {
  const images = Array.isArray(d.images) ? d.images.map(String).slice(0, 5) : [];
  if (images.some((p) => !p.startsWith(`users/${ctx.uid}/`) && !/^https?:\/\//.test(p))) invalid('Images must be uploaded to your own storage folder.');
  const rr = await requestReturnSvc(ctx.uid, {
    order_id: str(d.order_id, 'order_id', { required: true, max: 128 }),
    variant_id: str(d.variant_id, 'variant_id', { required: true, max: 128 }),
    qty: numIn(d.qty, 'qty', { required: true, min: 1 }),
    reason: str(d.reason, 'reason', { required: true, max: 1000 }),
    images,
  });
  return { id: rr.id, return_number: rr.return_number, status: rr.status, refund_amount: rr.refund_amount };
});

export const submitReview = authed<{ order_id?: string; variant_id?: string; rating?: number; comment?: string; images?: string[] }>(async (d, ctx) => {
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const variantId = str(d.variant_id, 'variant_id', { required: true, max: 128 });
  const rating = numIn(d.rating, 'rating', { required: true, min: 1, max: 5 });
  if (!Number.isInteger(rating)) invalid('The rating must be a whole number between 1 and 5.');
  const comment = str(d.comment, 'comment', { max: 2000 });
  // Storage paths under reviews/{uid}/ (public-read) or users/{uid}/, or full URLs (backward compatible).
  const images = Array.isArray(d.images) ? d.images.map(String).filter(Boolean).slice(0, 5) : [];
  if (images.some((p) => !/^https?:\/\//.test(p) && !p.startsWith(`reviews/${ctx.uid}/`) && !p.startsWith(`users/${ctx.uid}/`))) {
    invalid('Review images must be uploaded to reviews/{your uid}/.', { field: 'images' });
  }
  // Store public download URLs (reviews are shown to everyone); Storage paths are resolved, URLs kept as they are.
  const imageUrls: string[] = [];
  for (const p of images) {
    if (/^https?:\/\//.test(p)) { imageUrls.push(p); continue; }
    if (p.includes('..')) invalid('Invalid image path.', { field: 'images' });
    const url = await storageDownloadUrl(p);
    if (!url) invalid('A review image was not found. Please upload it again.', { field: 'images' });
    imageUrls.push(url!);
  }
  const reviewRef = db.collection('reviews').doc();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const [o, u] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${ctx.uid}`))]);
    if (!o.exists || o.get('user_id') !== ctx.uid) notFound('Order not found.');
    const order = o.data() as OrderDoc;
    if (!['delivered', 'returned'].includes(order.status)) precondition('You can review items after delivery.');
    const idx = order.items.findIndex((i) => String(i.variant_id) === variantId);
    if (idx < 0) notFound('Order item not found.');
    if (order.items[idx].is_reviewed) precondition('You have already reviewed this item.');
    const user = (u.data() ?? {}) as Partial<UserDoc>;
    tx.set(reviewRef, {
      product_id: order.items[idx].product_id, user_id: ctx.uid, user_name: user.name ?? 'Customer', user_avatar: user.avatar ?? null,
      order_id: orderId, item_variant_id: variantId, rating, comment, images: imageUrls, status: 'active', created_at: now(),
    });
    tx.update(ref, { items: order.items.map((it, i) => (i === idx ? { ...it, is_reviewed: true } : it)), updated_at: now() });
  });
  return { id: reviewRef.id };
});

