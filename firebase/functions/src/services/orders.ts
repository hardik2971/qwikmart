/** Order lifecycle (Laravel OrderService): placement, payment, transitions, rider assignment, returns. */
import type { DocumentReference } from 'firebase-admin/firestore';
import { db, denied, fail, FieldValue, formatSequence, invalid, logger, nextSequence, notFound, now, precondition, publicSettings, Timestamp, Transaction } from '../shared/firebase';
import type { DeliveryBoyDoc, Mode, OrderDoc, OrderItem, OrderStatus, PaymentPayload, ProductDoc, PublicSettings, ReturnRequestDoc, ReturnStatus, UserDoc } from '../shared/types';
import { ACTIVE_STATUSES, CANCELABLE_STATUSES, canTransition, isOrderStatus, RETURN_STATUSES, statusLabel } from '../shared/status';
import { formatMoney, haversineKm, money, num, pointInPolygon, randomDigits, searchKeywords } from '../shared/util';
import { cartSummary, findVariant, txReader } from './cart';
import { WalletLedger } from './wallet';
import { createPayment, isMethodEnabled, isOnlineMethod, verifyPayment } from '../payments/gateways';
import { notifyUser } from './notify';

export type Actor = 'customer' | 'admin' | 'store' | 'delivery_boy' | 'system';
export type OrderRec = OrderDoc & { id: string };

export const ORDER_PREFIX = 'SB-ORD-';
export const RETURN_PREFIX = 'RET-';

export function timelineEntry(status: OrderStatus, by: string | null, note?: string | null) {
  return { status, label: statusLabel(status), at: Timestamp.now(), by, note: note ?? null };
}

export function orderKeywords(o: { order_number: string; customer?: { name?: string | null; phone?: string | null; email?: string | null } }): string[] {
  const num = o.order_number.toLowerCase();
  const digits = num.replace(/\D/g, '');
  const extra = [num, digits, String(Number(digits) || '')].filter(Boolean);
  const kw = new Set(searchKeywords(o.customer?.name ?? '', o.customer?.email ?? '', o.customer?.phone ?? ''));
  for (const e of extra) for (let i = 2; i <= Math.min(e.length, 20); i++) kw.add(e.slice(0, i));
  return [...kw].slice(0, 300);
}

export function canCancelOf(status: OrderStatus, allCancelable: boolean): boolean {
  return CANCELABLE_STATUSES.includes(status) && allCancelable;
}

/* ================================================================== placeOrder */
export interface PlaceOrderInput {
  zone_id?: string | null; mode: Mode; address_id?: string | null; delivery_type: 'delivery' | 'self_pickup';
  payment_method: string; promo_code?: string | null; use_wallet?: boolean; notes?: string | null; platform?: 'app' | 'web' | null; return_url?: string | null; lang?: string;
}

export async function placeOrder(uid: string, input: PlaceOrderInput): Promise<{ order_id: string; order_number: string; payment: PaymentPayload | null }> {
  const method = input.payment_method;
  const deliveryType = input.delivery_type ?? 'delivery';
  if (deliveryType === 'delivery' && !input.address_id) invalid('Please select a delivery address.', { field: 'address_id' });
  if (!(await isMethodEnabled(method))) invalid('Selected payment method is not available.', { field: 'payment_method' });
  const settings = await publicSettings();
  const sym = settings.currency_symbol ?? '₹';
  const orderRef = db.collection('orders').doc();
  const online = isOnlineMethod(method);

  const placed = await db.runTransaction(async (tx) => {
    const useWallet = method === 'wallet' ? true : !!input.use_wallet;
    const { summary, internal } = await cartSummary({
      uid, zone_id: input.zone_id ?? null, mode: input.mode, platform: input.platform ?? null, address_id: input.address_id ?? null,
      delivery_type: deliveryType, promo_code: input.promo_code ?? null, use_wallet: useWallet, lang: input.lang,
    }, txReader(tx), true);
    const { store, zone, address, user } = internal;
    if (!user) precondition('Please complete your profile before placing an order.');
    if (input.mode === 'quick' && !store) precondition('No store is available for your location.');
    if (address && zone?.polygon?.length && address.lat != null && !pointInPolygon(Number(address.lat), Number(address.lng), zone.polygon)) {
      precondition('The selected address is outside the delivery zone.');
    }
    if (method === 'wallet' && summary.total > 0.009) precondition('Insufficient wallet balance to pay for this order.');
    if (method === 'cod' && summary.items.some((i) => !i.cod_allowed)) precondition('Cash on Delivery is not available for one or more items in your cart.');
    const codMax = num(settings.cod?.max_amount);
    if (method === 'cod' && codMax > 0 && summary.total > codMax) precondition(`Cash on Delivery is available for orders up to ${formatMoney(codMax, sym)}.`);

    const ledger = new WalletLedger(tx);
    if (summary.wallet_used > 0) await ledger.load(uid);
    const seq = await nextSequence(tx, 'orders');
    // ---------------- writes start here
    const isOnline = online && summary.total > 0;
    const status: OrderStatus = isOnline ? 'payment_pending' : 'received';
    const paymentStatus = method === 'wallet' || summary.total <= 0 ? 'paid' : 'pending';
    const minutes = summary.delivery_minutes ?? (input.mode === 'quick' ? 15 : 2880);
    const orderNumber = formatSequence(ORDER_PREFIX, seq.value);

    // stock
    const centralByProduct = new Map<string, { ref: DocumentReference; product: ProductDoc; dec: Map<string, number> }>();
    for (const l of internal.lines) {
      if (l.pricing.stock < l.qty) precondition('Some items just went out of stock. Please review your cart.');
      if (l.stock_source === 'store' && internal.stockStoreId) {
        tx.update(db.doc(`store_stocks/${internal.stockStoreId}_${l.variant_id}`), { stock: FieldValue.increment(-l.qty), updated_at: now() });
      } else {
        const e = centralByProduct.get(l.product_id) ?? { ref: db.doc(`products/${l.product_id}`), product: l.product, dec: new Map() };
        e.dec.set(l.variant_id, (e.dec.get(l.variant_id) ?? 0) + l.qty);
        centralByProduct.set(l.product_id, e);
      }
    }
    for (const { ref, product, dec } of centralByProduct.values()) {
      const variants = (product.variants ?? []).map((v) => (dec.has(String(v.id)) ? { ...v, stock: Math.max(0, num(v.stock) - dec.get(String(v.id))!) } : v));
      tx.update(ref, { variants, updated_at: now() });
    }

    const items: OrderItem[] = internal.lines.map((l) => ({
      variant_id: l.variant_id, product_id: l.product_id, name: l.item.name, variant_name: l.item.variant_name, image: l.item.image,
      price: l.pricing.price, sale_price: l.pricing.sale_price, unit_price: l.pricing.unit_price, qty: l.qty, tax_percent: l.tax_percent,
      tax_amount: l.tax_amount, total: l.line_total, status, is_reviewed: false, return_status: null,
      category_id: l.product.category_id ?? null, stock_source: l.stock_source,
      return_allowed: l.product.return_allowed ?? false, return_days: num(l.product.return_days), cancelable: l.product.cancelable !== false,
    }));
    const allCancelable = items.every((i) => i.cancelable !== false);
    const customer = { name: user!.name ?? '', phone: user!.phone ?? null, email: user!.email ?? null };
    const addressSnap = address
      ? {
          label: address.label ?? null, name: address.name, phone: address.phone, address_line: address.address_line, landmark: address.landmark ?? null,
          city: address.city ?? null, state: address.state ?? null, pincode: address.pincode ?? null, country_id: address.country_id ?? null,
          lat: num(address.lat), lng: num(address.lng),
          full_address: [address.address_line, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(', '),
        }
      : store ? { self_pickup: true, store: store.name, full_address: store.address ?? '', lat: store.lat ?? null, lng: store.lng ?? null, name: customer.name, phone: customer.phone } : null;

    const order: OrderDoc = {
      order_number: orderNumber, user_id: uid, customer, store_id: store?.id ?? null, zone_id: zone?.id ?? null,
      country_id: zone?.country_id ?? store?.country_id ?? null, address: addressSnap as OrderDoc['address'], mode: input.mode, delivery_type: deliveryType,
      status, payment_method: method, payment_status: paymentStatus, transaction_id: null, items,
      totals: {
        subtotal: summary.subtotal, savings: summary.savings, discount: money(summary.mrp_total - summary.subtotal), promo_discount: summary.promo?.discount ?? 0,
        delivery_charge: summary.delivery_charge, surge_charge: summary.surge_charge, additional_charges: summary.additional_charges,
        tax_amount: summary.tax, wallet_used: summary.wallet_used, total: summary.total, grand_total: summary.grand_total,
      },
      promo_code: internal.promo?.code ?? null, promo_code_id: internal.promo?.id ?? null, promo_is_cashback: !!summary.promo?.is_cashback,
      delivery_boy_id: null, delivery_boy: null, rider: null,
      timeline: [timelineEntry(status, uid, isOnline ? 'Awaiting online payment' : 'Order placed')] as unknown as OrderDoc['timeline'],
      cancel_reason: null, cancelled_by: null, notes: input.notes ?? null,
      estimated_delivery_at: Timestamp.fromMillis(Date.now() + minutes * 60_000), assigned_at: null, delivered_at: null, invoice_path: null,
      can_cancel: canCancelOf(status, allCancelable), all_cancelable: allCancelable, platform: input.platform ?? null,
      search_keywords: orderKeywords({ order_number: orderNumber, customer }), created_at: now(), updated_at: now(),
    };
    tx.set(orderRef, order);
    tx.set(orderRef.collection('secret').doc('otp'), { delivery_otp: randomDigits(6), user_id: uid, created_at: now() });

    if (summary.wallet_used > 0) {
      ledger.debit(uid, summary.wallet_used, 'wallet', `Paid for order ${orderNumber}`, orderRef.id);
      ledger.commit();
    }
    if (internal.promo) {
      tx.update(db.doc(`promo_codes/${internal.promo.id}`), { used_count: FieldValue.increment(1) });
      tx.set(db.doc(`promo_usages/${internal.promo.id}_${uid}`), { promo_id: internal.promo.id, user_id: uid, count: FieldValue.increment(1), updated_at: now() }, { merge: true });
    }
    seq.commit();
    for (const ref of internal.lineRefs) tx.delete(ref);
    return { orderNumber, isOnline, total: summary.total, customer, currency: null as string | null };
  });

  let payment: PaymentPayload | null = null;
  if (placed.isOnline) {
    try {
      const currency = await currencyFor(orderRef.id);
      payment = await createPayment(method, {
        amount: placed.total, currency, reference: placed.orderNumber, description: `Order ${placed.orderNumber}`,
        customer: placed.customer, return_url: input.return_url ?? null, metadata: { order_id: orderRef.id },
      });
      await orderRef.update({ transaction_id: payment.gateway_order_id ?? null, gateway_order_id: payment.gateway_order_id ?? null, updated_at: now() });
    } catch (e) {
      await transitionOrder(orderRef.id, 'cancelled', { actor: 'system', byUid: null, note: 'Payment initiation failed', force: true }).catch((err) => logger.error('rollback failed', err));
      throw e;
    }
  }
  return { order_id: orderRef.id, order_number: placed.orderNumber, payment };
}

async function currencyFor(orderId: string): Promise<string> {
  const o = await db.doc(`orders/${orderId}`).get();
  const cid = o.get('country_id') as string | null;
  if (cid) {
    const c = await db.doc(`countries/${cid}`).get();
    if (c.exists && c.get('currency_code')) return String(c.get('currency_code'));
  }
  return (await publicSettings()).currency_code ?? 'INR';
}

/* ================================================================== payment confirmation */
export async function confirmPayment(uid: string, orderId: string, payload: Record<string, unknown>): Promise<OrderRec> {
  const ref = db.doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('user_id') !== uid) notFound('Order not found.');
  const order = { id: snap.id, ...(snap.data() as OrderDoc) };
  if (order.payment_status === 'paid') return order;
  if (order.status !== 'payment_pending') precondition('This order is not awaiting payment.');
  const gatewayOrderId = (order as OrderDoc & { gateway_order_id?: string | null }).gateway_order_id ?? order.transaction_id;
  const result = await verifyPayment(order.payment_method, payload, gatewayOrderId);
  if (!result.success) {
    await ref.update({ payment_status: 'failed', updated_at: now() });
    precondition(`Payment verification failed. ${result.message ?? ''}`.trim());
  }
  return transitionOrder(orderId, 'received', {
    actor: 'system', byUid: null, note: `Payment received via ${order.payment_method}`,
    patch: { payment_status: 'paid', transaction_id: result.transaction_id ?? order.transaction_id },
  });
}

/* ================================================================== transitions */
export interface TransitionOpts {
  actor: Actor; byUid: string | null; note?: string | null; force?: boolean;
  /** extra validation inside the transaction (may read, must not write) */
  check?: (order: OrderRec, tx: Transaction) => Promise<void> | void;
  /** extra fields to write */
  patch?: Record<string, unknown>;
  /** delivered COD orders: cash the rider reports (default = amount payable). Validated by the caller. */
  codAmount?: number | null;
}

export async function transitionOrder(orderId: string, to: OrderStatus, opts: TransitionOpts): Promise<OrderRec> {
  if (!isOrderStatus(to)) invalid(`Invalid status [${to}].`);
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Order not found.');
    const order = { id: snap.id, ...(snap.data() as OrderDoc) };
    if (opts.check) await opts.check(order, tx);
    if (order.status === to) return order;
    if (!opts.force && !canTransition(order.status, to)) {
      precondition(`Cannot change order status from ${statusLabel(order.status)} to ${statusLabel(to)}.`);
    }
    const previous = order.status;
    const updates: Record<string, unknown> = { status: to, updated_at: now(), ...(opts.patch ?? {}) };
    let paymentStatus = (opts.patch?.payment_status as string | undefined) ?? order.payment_status;

    // ---- reads
    let ledger: WalletLedger | null = null;
    let refund = 0;
    const centralProducts = new Map<string, ProductDoc>();
    let riderSnapExists = false;
    if (to === 'cancelled') {
      refund = num(order.totals?.wallet_used);
      if (paymentStatus === 'paid' && order.payment_method !== 'cod' && order.payment_method !== 'wallet') refund += num(order.totals?.total);
      refund = money(refund);
      if (refund > 0 && order.user_id) {
        ledger = new WalletLedger(tx);
        await ledger.load(order.user_id);
      }
      const ids = [...new Set(order.items.filter((i) => i.stock_source !== 'store' || !order.store_id).map((i) => i.product_id))];
      const ps = ids.length ? await tx.getAll(...ids.map((id) => db.doc(`products/${id}`))) : [];
      ps.forEach((p) => p.exists && centralProducts.set(p.id, p.data() as ProductDoc));
    }
    let codCollect = 0;
    if (to === 'delivered' && order.delivery_boy_id) {
      codCollect = order.payment_method === 'cod' && paymentStatus !== 'paid' ? num(order.totals?.total) : 0;
      if (codCollect > 0) riderSnapExists = (await tx.get(db.doc(`delivery_boys/${order.delivery_boy_id}`))).exists;
    }

    // ---- writes
    if (to === 'cancelled') {
      updates.cancel_reason = opts.note || order.cancel_reason || null;
      updates.cancelled_by = opts.actor;
      // restock
      const dec = new Map<string, Map<string, number>>();
      for (const it of order.items) {
        if (['return_requested', 'returned'].includes(it.status)) continue;
        if (it.stock_source === 'store' && order.store_id) {
          tx.set(db.doc(`store_stocks/${order.store_id}_${it.variant_id}`), { stock: FieldValue.increment(it.qty), updated_at: now() }, { merge: true });
        } else {
          const m = dec.get(it.product_id) ?? new Map<string, number>();
          m.set(it.variant_id, (m.get(it.variant_id) ?? 0) + it.qty);
          dec.set(it.product_id, m);
        }
      }
      for (const [pid, m] of dec) {
        const p = centralProducts.get(pid);
        if (!p) continue;
        tx.update(db.doc(`products/${pid}`), { variants: (p.variants ?? []).map((v) => (m.has(String(v.id)) ? { ...v, stock: num(v.stock) + m.get(String(v.id))! } : v)), updated_at: now() });
      }
      if (ledger && refund > 0) {
        ledger.credit(order.user_id, refund, 'refund', `Refund for cancelled order ${order.order_number}`, order.id);
        ledger.commit();
        paymentStatus = 'refunded';
      } else if (previous === 'payment_pending') {
        paymentStatus = 'failed';
      }
      if (order.promo_code_id) {
        tx.set(db.doc(`promo_codes/${order.promo_code_id}`), { used_count: FieldValue.increment(-1) }, { merge: true });
        tx.set(db.doc(`promo_usages/${order.promo_code_id}_${order.user_id}`), { count: FieldValue.increment(-1) }, { merge: true });
      }
    }
    if (to === 'delivered') {
      updates.delivered_at = now();
      if (order.payment_method === 'cod') paymentStatus = 'paid';
      if (codCollect > 0 && order.delivery_boy_id && riderSnapExists) {
        const expected = money(codCollect);
        const collected = opts.codAmount !== undefined && opts.codAmount !== null && Number.isFinite(opts.codAmount) ? money(opts.codAmount) : expected;
        tx.set(db.doc(`cash_collections/cod_${order.id}`), {
          delivery_boy_id: order.delivery_boy_id, order_id: order.id, order_number: order.order_number, store_id: order.store_id ?? null, amount: collected,
          type: 'collected_from_customer', message: `COD collected for ${order.order_number}`, created_at: now(),
          ...(collected !== expected ? { expected_amount: expected, short_amount: money(expected - collected) } : {}),
        });
        if (collected > 0) tx.update(db.doc(`delivery_boys/${order.delivery_boy_id}`), { cash_in_hand: FieldValue.increment(collected) });
        if (collected !== expected) updates.cod_collected = collected;
      }
    }
    updates.payment_status = paymentStatus;
    updates.items = order.items.map((i) => (['return_requested', 'returned'].includes(i.status) ? i : { ...i, status: to }));
    updates.timeline = FieldValue.arrayUnion(timelineEntry(to, opts.byUid, opts.note ?? null));
    updates.can_cancel = canCancelOf(to, order.all_cancelable !== false);
    tx.update(ref, updates);
    return { ...order, ...(updates as Partial<OrderDoc>), timeline: order.timeline } as OrderRec;
  });
}

/** Customer/admin cancellation with eligibility checks for customers. */
export async function cancelOrder(orderId: string, reason: string | null, byUid: string, actor: Actor): Promise<OrderRec> {
  return transitionOrder(orderId, 'cancelled', {
    actor, byUid, note: reason || `Cancelled by ${actor}`, force: actor !== 'customer',
    check: (o) => {
      if (actor === 'customer') {
        if (o.user_id !== byUid) notFound('Order not found.');
        if (!canCancelOf(o.status, o.all_cancelable !== false)) precondition('This order can no longer be cancelled.');
      }
      if (o.status === 'cancelled') precondition('This order is already cancelled.');
      // Delivered / returned orders are settled (COD collected, rider paid, refunds via returns): cancelling them would
      // restock and refund a second time. Use the return flow instead.
      if (o.status === 'delivered' || o.status === 'returned') precondition('Delivered orders cannot be cancelled. Use a return instead.');
    },
  });
}

/* ================================================================== riders */
async function riderSnapshot(uid: string) {
  const [u, b] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`delivery_boys/${uid}`).get()]);
  if (!b.exists) notFound('Delivery profile not found.');
  const boy = b.data() as DeliveryBoyDoc;
  const user = (u.data() ?? {}) as Partial<UserDoc>;
  return { boy, snap: { name: user.name ?? boy.name ?? 'Delivery partner', phone: user.phone ?? boy.phone ?? null, avatar: user.avatar ?? null, vehicle_number: boy.vehicle_number ?? null } };
}

export async function assignDeliveryBoy(orderId: string, riderUid: string, byUid: string | null, storeScope?: string | null, opts: { auto?: boolean } = {}): Promise<void> {
  const { boy, snap } = await riderSnapshot(riderUid);
  if (boy.approval_status !== 'approved' || boy.status !== 'active') precondition('This delivery boy is not approved or is inactive.');
  const orderNumber = await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const o = await tx.get(ref);
    if (!o.exists) notFound('Order not found.');
    const order = o.data() as OrderDoc;
    if (storeScope !== undefined && storeScope !== null && order.store_id !== storeScope) denied('This order belongs to another store.');
    if (['delivered', 'cancelled', 'returned'].includes(order.status)) precondition('Cannot assign a delivery boy to a completed order.');
    // auto-assign never overrides a rider who accepted / was assigned in the meantime
    if (opts.auto && (order.delivery_boy_id || !ACTIVE_STATUSES.includes(order.status))) precondition('Order is no longer awaiting a delivery partner.');
    tx.update(ref, {
      delivery_boy_id: riderUid, delivery_boy: snap, assigned_at: now(), updated_at: now(),
      rider: boy.location ? { lat: boy.location.lat, lng: boy.location.lng, updated_at: boy.location.updated_at ?? now() } : null,
      timeline: FieldValue.arrayUnion(timelineEntry(order.status, byUid, `${opts.auto ? 'Auto-assigned' : 'Assigned'} to ${snap.name}`)),
      ...(opts.auto ? { auto_assigned: true } : {}),
    });
    return order.order_number;
  });
  await notifyUser(riderUid, 'New order assigned', `Order ${orderNumber} has been assigned to you.`, { type: 'order', order_id: orderId });
}

/** settings/public.delivery.auto_assign (Laravel `auto_assign_delivery`); legacy `assign_mode: 'auto'` when unset. */
export function autoAssignEnabled(s: PublicSettings): boolean {
  const d = s.delivery ?? {};
  if (typeof d.auto_assign === 'boolean') return d.auto_assign;
  return d.assign_mode === 'auto';
}

/**
 * Laravel OrderService::autoAssign — nearest online, approved, active rider of the order's zone (distance from the
 * store, else from the delivery address; riders without a location sort last). Riders who already rejected the
 * order are skipped. Returns the assigned rider uid, or null (order stays in the pool for accept / manual assignment).
 */
export async function autoAssignRider(orderId: string, o: Pick<OrderDoc, 'zone_id' | 'store_id' | 'address' | 'rejected_by'>): Promise<string | null> {
  if (!o.zone_id) return null;
  const riders = await db.collection('delivery_boys').where('zone_id', '==', o.zone_id).where('is_online', '==', true).where('approval_status', '==', 'approved').get();
  if (riders.empty) return null;
  let origin: { lat: number; lng: number } | null = null;
  if (o.store_id) {
    const st = await db.doc(`stores/${o.store_id}`).get();
    if (st.exists && Number.isFinite(Number(st.get('lat'))) && st.get('lat') !== null) origin = { lat: Number(st.get('lat')), lng: Number(st.get('lng')) };
  }
  if (!origin && o.address && o.address.lat != null && o.address.lng != null) origin = { lat: Number(o.address.lat), lng: Number(o.address.lng) };
  const rejected = new Set(o.rejected_by ?? []);
  const ranked = riders.docs
    .map((d) => ({ id: d.id, b: d.data() as DeliveryBoyDoc }))
    .filter(({ id, b }) => b.status === 'active' && !rejected.has(id))
    .map(({ id, b }) => ({
      id,
      km: origin && b.location && Number.isFinite(Number(b.location.lat)) ? haversineKm(origin.lat, origin.lng, Number(b.location.lat), Number(b.location.lng)) : 999,
    }))
    .sort((a, b) => a.km - b.km);
  for (const r of ranked) {
    try {
      await assignDeliveryBoy(orderId, r.id, null, null, { auto: true });
      return r.id;
    } catch (e) {
      if (/no longer awaiting|completed order/.test(String((e as Error).message))) return null;
      logger.warn('auto-assign candidate skipped', { orderId, rider: r.id, error: String(e) });
    }
  }
  return null;
}

/** Rider accepts an available order (race-safe). */
export async function acceptByRider(orderId: string, riderUid: string): Promise<OrderRec> {
  const { boy, snap } = await riderSnapshot(riderUid);
  if (boy.approval_status !== 'approved') denied('Your account is pending approval.');
  if (!boy.is_online) precondition('Go online to accept orders.');
  const order = await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const o = await tx.get(ref);
    if (!o.exists) notFound('Order not found.');
    const order = { id: o.id, ...(o.data() as OrderDoc) };
    if (order.delivery_boy_id && order.delivery_boy_id !== riderUid) precondition('This order has already been accepted by another delivery partner.');
    if (!order.delivery_boy_id && order.zone_id !== boy.zone_id) denied('This order is outside your zone.');
    if (!ACTIVE_STATUSES.includes(order.status)) precondition('This order is no longer available.');
    if (order.delivery_type === 'self_pickup') precondition('This is a self-pickup order.');
    const updates = {
      delivery_boy_id: riderUid, delivery_boy: snap, assigned_at: now(), updated_at: now(),
      rider: boy.location ? { lat: boy.location.lat, lng: boy.location.lng, updated_at: boy.location.updated_at ?? now() } : null,
      timeline: FieldValue.arrayUnion(timelineEntry(order.status, riderUid, `Accepted by ${snap.name}`)),
    };
    tx.update(ref, updates);
    return { ...order, delivery_boy_id: riderUid } as OrderRec;
  });
  await notifyUser(order.user_id, 'Delivery partner assigned', `${snap.name} will deliver your order ${order.order_number}.`, { type: 'order', order_id: order.id });
  return order;
}

export async function rejectByRider(orderId: string, riderUid: string, reason?: string | null): Promise<void> {
  const { snap } = await riderSnapshot(riderUid);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const o = await tx.get(ref);
    if (!o.exists) notFound('Order not found.');
    const order = o.data() as OrderDoc;
    const updates: Record<string, unknown> = {
      updated_at: now(),
      rejected_by: FieldValue.arrayUnion(riderUid),
      timeline: FieldValue.arrayUnion(timelineEntry(order.status, riderUid, `Rejected by ${snap.name}${reason ? `: ${reason}` : ''}`)),
    };
    if (order.delivery_boy_id === riderUid) {
      if (['picked_up', 'out_for_delivery'].includes(order.status)) precondition('You cannot reject an order after pickup.');
      Object.assign(updates, { delivery_boy_id: null, delivery_boy: null, assigned_at: null, rider: null });
    } else if (order.delivery_boy_id) {
      notFound('Order not found.');
    }
    tx.update(ref, updates);
  });
}

/** Rider pickup / out-for-delivery (DeliveryController::updateStatus). */
export async function riderStatus(orderId: string, riderUid: string, status: 'picked_up' | 'out_for_delivery'): Promise<OrderRec> {
  const allowedFrom: Record<string, OrderStatus[]> = {
    picked_up: ['received', 'processed', 'ready_for_pickup', 'shipped'],
    out_for_delivery: ['picked_up', 'ready_for_pickup', 'shipped'],
  };
  return transitionOrder(orderId, status, {
    actor: 'delivery_boy', byUid: riderUid, note: 'Updated by delivery partner', force: true,
    check: (o) => {
      if (o.delivery_boy_id !== riderUid) denied('This order is not assigned to you.');
      if (!allowedFrom[status].includes(o.status)) precondition(`Cannot mark this order as ${statusLabel(status)} now.`);
    },
  });
}

/** Wrong OTPs allowed per order before a lock-out (the 6-digit OTP must not be brute-forceable by the rider / store). */
export const OTP_MAX_FAILURES = 5;
export const OTP_LOCK_MS = 15 * 60_000;

/**
 * Runs an OTP-checked action. Refuses while orders/{id}/secret/otp is locked; when the action fails with the
 * "Invalid … OTP" error the failure is counted outside the (rolled back) transaction, locking after OTP_MAX_FAILURES.
 */
export async function withOtpAttempts<T>(orderId: string, action: () => Promise<T>): Promise<T> {
  const ref = db.doc(`orders/${orderId}/secret/otp`);
  const s = await ref.get();
  const lockedUntil = (s.get('otp_locked_until') as Timestamp | undefined)?.toMillis?.() ?? 0;
  if (lockedUntil > Date.now()) {
    fail('resource-exhausted', `Too many wrong OTP attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 60_000)} minute(s).`);
  }
  try {
    return await action();
  } catch (e) {
    const err = e as { code?: string; details?: { field?: string } };
    if (err?.code === 'invalid-argument' && err.details?.field === 'otp' && s.exists) {
      const failures = await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        const n = Number(cur.get('otp_failures') ?? 0) + 1;
        const lock = n >= OTP_MAX_FAILURES;
        tx.set(ref, { otp_failures: lock ? 0 : n, ...(lock ? { otp_locked_until: Timestamp.fromMillis(Date.now() + OTP_LOCK_MS) } : {}) }, { merge: true });
        return n;
      }).catch(() => 0);
      if (failures >= OTP_MAX_FAILURES) fail('resource-exhausted', 'Too many wrong OTP attempts. Try again in 15 minutes.');
    }
    throw e;
  }
}

/**
 * Rider completes delivery with the customer OTP.
 * `cashCollected` (COD only, optional): the cash the rider actually received. It must be between 0 and the amount payable;
 * it is recorded on cash_collections/cod_{orderId} (+ `expected_amount`/`short_amount` when it differs) and added to the
 * rider's cash_in_hand. Omitted → the full payable amount (previous behaviour). Ignored for prepaid orders.
 */
export async function deliverWithOtp(orderId: string, riderUid: string, otp: string, cashCollected?: number | null): Promise<{ order: OrderRec; cash_collected: number; cash_in_hand: number }> {
  let collect = 0;
  const reported = cashCollected === undefined || cashCollected === null ? null : Number(cashCollected);
  if (reported !== null && (!Number.isFinite(reported) || reported < 0)) invalid('The cash collected must be a positive number.', { field: 'cash_collected' });
  const order = await withOtpAttempts(orderId, () => transitionOrder(orderId, 'delivered', {
    actor: 'delivery_boy', byUid: riderUid, note: 'Delivered (OTP verified)', force: true,
    check: async (o, tx) => {
      if (o.delivery_boy_id !== riderUid) denied('This order is not assigned to you.');
      if (['delivered', 'cancelled', 'returned'].includes(o.status)) precondition('This order is already completed.');
      const secret = await tx.get(db.doc(`orders/${orderId}/secret/otp`));
      if (String(secret.get('delivery_otp') ?? '') !== String(otp ?? '').trim()) invalid('Invalid delivery OTP.', { field: 'otp' });
      collect = o.payment_method === 'cod' && o.payment_status !== 'paid' ? num(o.totals?.total) : 0;
      if (collect > 0 && reported !== null) {
        if (reported > money(collect) + 0.005) invalid(`The cash collected cannot exceed the amount payable (${money(collect).toFixed(2)}).`, { field: 'cash_collected' });
        collect = money(reported);
      }
    },
    codAmount: reported !== null ? money(reported) : null,
  }));
  const boy = await db.doc(`delivery_boys/${riderUid}`).get();
  return { order, cash_collected: money(collect), cash_in_hand: money(num(boy.get('cash_in_hand'))) };
}

/* ================================================================== returns */
export async function requestReturn(uid: string, input: { order_id: string; variant_id: string; qty: number; reason: string; images: string[] }) {
  const result = await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${input.order_id}`);
    const o = await tx.get(ref);
    if (!o.exists || o.get('user_id') !== uid) notFound('Order item not found.');
    const order = { id: o.id, ...(o.data() as OrderDoc) };
    const idx = order.items.findIndex((i) => String(i.variant_id) === String(input.variant_id));
    if (idx < 0) notFound('Order item not found.');
    const item = order.items[idx];
    if (order.status !== 'delivered') precondition('Only delivered orders can be returned.');
    const p = await tx.get(db.doc(`products/${item.product_id}`));
    const returnAllowed = p.exists ? !!p.get('return_allowed') : !!item.return_allowed;
    const returnDays = p.exists ? num(p.get('return_days')) : num(item.return_days);
    const deliveredAt = order.delivered_at?.toMillis?.() ?? 0;
    const eligible = returnAllowed && !['return_requested', 'returned'].includes(item.status) && deliveredAt > 0 && deliveredAt + returnDays * 86_400_000 > Date.now();
    if (!eligible) precondition('This item is not eligible for return.');
    if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > item.qty) invalid('Invalid return quantity.', { field: 'qty' });
    const seq = await nextSequence(tx, 'returns');
    const rrRef = db.collection('return_requests').doc();
    const rr: ReturnRequestDoc = {
      return_number: formatSequence(RETURN_PREFIX, seq.value), order_id: order.id, order_number: order.order_number, user_id: uid,
      item_variant_id: item.variant_id, item_name: `${item.name}${item.variant_name ? ` (${item.variant_name})` : ''}`, qty: input.qty,
      reason: input.reason, images: input.images ?? [], status: 'pending', refund_amount: money(num(item.unit_price ?? item.sale_price ?? item.price) * input.qty),
      refund_method: 'wallet', delivery_boy_id: null, admin_remark: null, store_id: order.store_id, zone_id: order.zone_id,
      created_at: now(), updated_at: now(),
    };
    seq.commit();
    tx.set(rrRef, rr);
    const items = order.items.map((it, i) => (i === idx ? { ...it, status: 'return_requested' as const, return_status: 'pending' } : it));
    tx.update(ref, { items, updated_at: now() });
    return { id: rrRef.id, ...rr };
  });
  await notifyUser(uid, 'Return requested', `Return ${result.return_number} for ${result.item_name} has been submitted.`, { type: 'return', return_id: result.id });
  return result;
}

/**
 * pending → approved|rejected → pickup_assigned (needs delivery_boy_id) → picked_up (restock) → refund_completed (wallet credit).
 */
export async function updateReturn(returnId: string, status: ReturnStatus, opts: { remark?: string | null; deliveryBoyId?: string | null; refundAmount?: number | null; refundMethod?: 'wallet' | 'original' | null; storeScope?: string | null; byUid?: string | null; riderUid?: string | null } = {}) {
  if (!(status in RETURN_STATUSES)) invalid('Invalid return status.');
  const rr = await db.runTransaction(async (tx) => {
    const ref = db.doc(`return_requests/${returnId}`);
    const s = await tx.get(ref);
    if (!s.exists) notFound('Return request not found.');
    const rr = { id: s.id, ...(s.data() as ReturnRequestDoc) };
    if (opts.storeScope && rr.store_id !== opts.storeScope) denied('This return belongs to another store.');
    if (opts.riderUid && rr.delivery_boy_id !== opts.riderUid) notFound('Return request not found.');
    if (['rejected', 'refund_completed'].includes(rr.status)) precondition('This return request is already closed.');
    const orderRef = db.doc(`orders/${rr.order_id}`);
    const os = await tx.get(orderRef);
    const order = os.exists ? ({ id: os.id, ...(os.data() as OrderDoc) }) : null;
    const updates: Record<string, unknown> = { status, admin_remark: opts.remark ?? rr.admin_remark ?? null, updated_at: now() };
    if (opts.refundAmount !== undefined && opts.refundAmount !== null && Number.isFinite(opts.refundAmount)) updates.refund_amount = money(opts.refundAmount);
    if (opts.refundMethod) updates.refund_method = opts.refundMethod;
    if (status === 'pickup_assigned') {
      if (!opts.deliveryBoyId && !rr.delivery_boy_id) precondition('Please select a delivery boy for pickup.');
      updates.delivery_boy_id = opts.deliveryBoyId ?? rr.delivery_boy_id;
      // riders can't read orders they did not deliver → snapshot what the pickup needs onto the return doc
      if (order) {
        updates.customer = { name: order.customer?.name ?? order.address?.name ?? null, phone: order.customer?.phone ?? order.address?.phone ?? null };
        updates.address = order.address ?? null;
        updates.order_number = order.order_number ?? rr.order_number ?? null;
      }
    }
    const needsRestock = (status === 'picked_up' && rr.status !== 'picked_up') || (status === 'refund_completed' && rr.status !== 'picked_up');
    if (status === 'refund_completed' && !['picked_up', 'approved', 'pickup_assigned'].includes(rr.status)) {
      precondition('Refund can only be completed after approval or pickup.');
    }
    const item = order?.items.find((i) => String(i.variant_id) === String(rr.item_variant_id));
    // A panel-supplied refund may not exceed what the customer paid for that order line (bounded by the order total).
    if (updates.refund_amount !== undefined) {
      const lineMax = item ? money(num(item.unit_price ?? item.sale_price ?? item.price) * num(item.qty)) : num(rr.refund_amount);
      const max = money(Math.min(lineMax, order ? num(order.totals?.grand_total) || lineMax : lineMax));
      if (num(updates.refund_amount) > max + 0.005) invalid(`The refund amount may not be greater than ${max.toFixed(2)}.`, { field: 'refund_amount' });
    }
    let product: ProductDoc | null = null;
    if (needsRestock && item && !(item.stock_source === 'store' && order?.store_id)) {
      const p = await tx.get(db.doc(`products/${item.product_id}`));
      product = p.exists ? (p.data() as ProductDoc) : null;
    }
    const amount = num(updates.refund_amount ?? rr.refund_amount);
    let ledger: WalletLedger | null = null;
    if (status === 'refund_completed' && amount > 0 && (opts.refundMethod ?? rr.refund_method ?? 'wallet') === 'wallet') {
      ledger = new WalletLedger(tx);
      await ledger.load(rr.user_id);
    }
    // ---- writes
    if (needsRestock && item && order) {
      if (item.stock_source === 'store' && order.store_id) {
        tx.set(db.doc(`store_stocks/${order.store_id}_${item.variant_id}`), { stock: FieldValue.increment(rr.qty), updated_at: now() }, { merge: true });
      } else if (product) {
        tx.update(db.doc(`products/${item.product_id}`), {
          variants: (product.variants ?? []).map((v) => (String(v.id) === String(item.variant_id) ? { ...v, stock: num(v.stock) + rr.qty } : v)), updated_at: now(),
        });
      }
    }
    if (order) {
      let items = order.items;
      let orderUpdates: Record<string, unknown> | null = null;
      if (status === 'rejected') {
        items = items.map((i) => (String(i.variant_id) === String(rr.item_variant_id) ? { ...i, status: 'delivered' as const, return_status: 'rejected' } : i));
        orderUpdates = { items };
      } else if (status === 'refund_completed') {
        items = items.map((i) => (String(i.variant_id) === String(rr.item_variant_id) ? { ...i, status: 'returned' as const, return_status: 'refund_completed' } : i));
        orderUpdates = { items };
        if (items.every((i) => i.status === 'returned')) {
          Object.assign(orderUpdates, {
            status: 'returned', payment_status: 'refunded', can_cancel: false,
            timeline: FieldValue.arrayUnion(timelineEntry('returned', opts.byUid ?? null, 'All items returned')),
          });
        }
      } else {
        items = items.map((i) => (String(i.variant_id) === String(rr.item_variant_id) ? { ...i, return_status: status } : i));
        orderUpdates = { items };
      }
      tx.update(orderRef, { ...orderUpdates, updated_at: now() });
    }
    if (ledger) {
      ledger.credit(rr.user_id, amount, 'refund', `Refund for return ${rr.return_number}`, rr.order_id);
      ledger.commit();
    }
    tx.update(ref, updates);
    return { ...rr, ...(updates as Partial<ReturnRequestDoc>) };
  });
  const label = RETURN_STATUSES[status];
  await notifyUser(rr.user_id, `Return ${label}`, `Your return ${rr.return_number} is now ${label.toLowerCase()}.`, { type: 'return', return_id: rr.id });
  if (status === 'pickup_assigned' && rr.delivery_boy_id) {
    await notifyUser(rr.delivery_boy_id, 'Return pickup assigned', `Pick up return ${rr.return_number}.`, { type: 'return', return_id: rr.id });
  }
  return rr;
}

export function publicOrder(o: OrderRec) {
  return { id: o.id, order_number: o.order_number, status: o.status, payment_status: o.payment_status, payment_method: o.payment_method, totals: o.totals, delivery_boy_id: o.delivery_boy_id ?? null };
}

export { findVariant };
