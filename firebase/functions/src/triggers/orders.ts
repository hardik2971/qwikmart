/** onOrderWritten: stats_daily (all/store/zone), counters, notifications, delivered side-effects. */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, FieldValue, logger, now, publicSettings, REGION, Timestamp } from '../shared/firebase';
import type { DeliveryBoyDoc, OrderDoc, OrderStatus, ReferralDoc } from '../shared/types';
import { NON_REVENUE_STATUSES, statusLabel, statusMessage } from '../shared/status';
import { formatMoney, money, num, zonedParts } from '../shared/util';
import { notifyUser, pushToUsers, sendTemplate } from '../services/notify';
import { WalletLedger } from '../services/wallet';
import { autoAssignEnabled, autoAssignRider } from '../services/orders';

type Flat = Map<string, number>;

interface Contribution {
  docs: Map<string, Flat>; // stats_daily doc id -> path -> value
  products: Flat; stores: Map<string, Flat>; users: Map<string, Flat>;
}

/** Stats contribution of one order version (positive). */
export function contribution(o: OrderDoc | null, tz = 'Asia/Kolkata'): Contribution {
  const c: Contribution = { docs: new Map(), products: new Map(), stores: new Map(), users: new Map() };
  if (!o) return c;
  const created = o.created_at?.toDate?.() ?? new Date();
  const { date, hour } = zonedParts(created, tz);
  const counted = o.status !== 'payment_pending';
  const rev = !NON_REVENUE_STATUSES.includes(o.status);
  const grand = money(num(o.totals?.grand_total));
  const stats: Flat = new Map();
  const add = (m: Flat, k: string, v: number) => v && m.set(k, money((m.get(k) ?? 0) + v));
  const units = (o.items ?? []).reduce((s, i) => s + num(i.qty), 0);
  add(stats, 'orders', counted ? 1 : 0);
  add(stats, 'revenue', rev ? grand : 0);
  add(stats, 'delivery_charges', rev ? num(o.totals?.delivery_charge) : 0);
  add(stats, 'tax', rev ? num(o.totals?.tax_amount) : 0);
  add(stats, 'units', rev ? units : 0);
  add(stats, 'cancelled', o.status === 'cancelled' ? 1 : 0);
  add(stats, 'returned', o.status === 'returned' ? 1 : 0);
  add(stats, `by_status.${o.status}`, 1);
  add(stats, `by_mode.${o.mode ?? 'quick'}.orders`, counted ? 1 : 0);
  add(stats, `by_mode.${o.mode ?? 'quick'}.revenue`, rev ? grand : 0);
  add(stats, `by_hour.${hour}.orders`, counted ? 1 : 0);
  add(stats, `by_hour.${hour}.revenue`, rev ? grand : 0);
  if (rev) {
    for (const it of o.items ?? []) {
      const cat = it.category_id || 'uncategorized';
      add(stats, `by_category.${cat}.revenue`, num(it.total));
      add(stats, `by_category.${cat}.units`, num(it.qty));
      add(c.products, it.product_id, num(it.qty));
    }
  }
  const scopes = ['all', o.store_id ? `store_${o.store_id}` : null, o.zone_id ? `zone_${o.zone_id}` : null].filter(Boolean) as string[];
  for (const s of scopes) c.docs.set(`${s}_${date}`, stats);
  const live = counted && o.status !== 'cancelled' ? 1 : 0;
  if (o.store_id) c.stores.set(o.store_id, new Map([['orders_count', live], ['revenue', rev ? grand : 0]]));
  if (o.user_id) c.users.set(o.user_id, new Map([['orders_count', live], ['total_spent', rev ? grand : 0]]));
  return c;
}

function diffMaps(a: Map<string, Flat>, b: Map<string, Flat>): Map<string, Flat> {
  const out = new Map<string, Flat>();
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const m: Flat = new Map();
    const am = a.get(k) ?? new Map<string, number>();
    const bm = b.get(k) ?? new Map<string, number>();
    for (const p of new Set([...am.keys(), ...bm.keys()])) {
      const v = money((bm.get(p) ?? 0) - (am.get(p) ?? 0));
      if (v !== 0) m.set(p, v);
    }
    if (m.size) out.set(k, m);
  }
  return out;
}

function nested(flat: Flat): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, v] of flat) {
    const parts = path.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) cur = (cur[parts[i]] ??= {}) as Record<string, unknown>;
    cur[parts[parts.length - 1]] = FieldValue.increment(v);
  }
  return root;
}

export async function applyStats(before: OrderDoc | null, after: OrderDoc | null, tz: string) {
  const a = contribution(before, tz);
  const b = contribution(after, tz);
  const batch = db.batch();
  let writes = 0;
  for (const [id, m] of diffMaps(a.docs, b.docs)) {
    const i = id.lastIndexOf('_');
    batch.set(db.doc(`stats_daily/${id}`), { scope: id.slice(0, i), date: id.slice(i + 1), ...nested(m), updated_at: now() }, { merge: true });
    writes++;
  }
  const prod = diffMaps(new Map([['p', a.products]]), new Map([['p', b.products]])).get('p');
  const storeDiff = diffMaps(a.stores, b.stores);
  const userDiff = diffMaps(a.users, b.users);
  // counters only on docs that still exist (a set/merge would resurrect a deleted product/store/user as a stub doc)
  const refs = [...[...(prod ?? new Map()).keys()].map((id) => db.doc(`products/${id}`)), ...[...storeDiff.keys()].map((id) => db.doc(`stores/${id}`)), ...[...userDiff.keys()].map((id) => db.doc(`users/${id}`))];
  const existing = new Set((refs.length ? await db.getAll(...refs) : []).filter((s) => s.exists).map((s) => s.ref.path));
  for (const [pid, v] of prod ?? []) {
    if (!existing.has(`products/${pid}`)) continue;
    batch.set(db.doc(`products/${pid}`), { sold_count: FieldValue.increment(v) }, { merge: true });
    writes++;
  }
  for (const [sid, m] of storeDiff) { if (!existing.has(`stores/${sid}`)) continue; batch.set(db.doc(`stores/${sid}`), nested(m), { merge: true }); writes++; }
  for (const [uid, m] of userDiff) { if (!existing.has(`users/${uid}`)) continue; batch.set(db.doc(`users/${uid}`), nested(m), { merge: true }); writes++; }
  if (writes) await batch.commit();
}

/* ------------------------------------------------------------------ delivered side-effects */
export function commissionFor(boy: Pick<DeliveryBoyDoc, 'commission_type' | 'commission_value'>, orderTotal: number): number {
  const v = num(boy.commission_value);
  return money(boy.commission_type === 'percent' ? (orderTotal * v) / 100 : v);
}

async function onDelivered(orderId: string, o: OrderDoc, sym: string) {
  // rider commission
  if (o.delivery_boy_id) {
    const riderUid = o.delivery_boy_id;
    await db.runTransaction(async (tx) => {
      const earnRef = db.doc(`delivery_earnings/commission_${orderId}`);
      const [boySnap, earnSnap] = await Promise.all([tx.get(db.doc(`delivery_boys/${riderUid}`)), tx.get(earnRef)]);
      if (!boySnap.exists || earnSnap.exists) return;
      const amount = commissionFor(boySnap.data() as DeliveryBoyDoc, num(o.totals?.total) + num(o.totals?.wallet_used));
      if (amount <= 0) return;
      const l = new WalletLedger(tx);
      const userExists = (await tx.get(db.doc(`users/${riderUid}`))).exists;
      if (userExists) { await l.load(riderUid); await l.reserve(riderUid, `commission_${orderId}`); }
      tx.set(earnRef, { delivery_boy_id: riderUid, order_id: orderId, order_number: o.order_number, amount, type: 'commission', status: 'credited', created_at: now() });
      tx.update(boySnap.ref, { earnings_total: FieldValue.increment(amount) });
      if (userExists) { l.credit(riderUid, amount, 'admin', `Delivery commission for ${o.order_number}`, orderId, null, `commission_${orderId}`); l.commit(); }
    });
  }
  // cashback
  const promoDiscount = num(o.totals?.promo_discount);
  if (o.promo_is_cashback && promoDiscount > 0 && o.user_id) {
    const credited = await db.runTransaction(async (tx) => {
      const l = new WalletLedger(tx);
      await l.load(o.user_id);
      if (!(await l.reserve(o.user_id, `cashback_${orderId}`))) return false;
      l.credit(o.user_id, promoDiscount, 'cashback', `Cashback for order ${o.order_number}`, orderId, null, `cashback_${orderId}`);
      l.commit();
      return true;
    });
    if (credited) await notifyUser(o.user_id, 'Cashback credited', `${formatMoney(promoDiscount, sym)} cashback for order ${o.order_number} added to your wallet.`, { type: 'wallet' });
  }
  // referral (first qualifying delivered order)
  const refs = await db.collection('referrals').where('referred_id', '==', o.user_id).where('status', '==', 'pending').limit(1).get();
  const refDoc = refs.docs[0];
  if (refDoc) {
    const r = refDoc.data() as ReferralDoc;
    if (num(o.totals?.subtotal) >= num(r.min_order)) {
      const done = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(refDoc.ref);
        if (fresh.get('status') !== 'pending') return false;
        const l = new WalletLedger(tx);
        const referrerExists = (await tx.get(db.doc(`users/${r.referrer_id}`))).exists;
        if (referrerExists && num(r.referrer_reward) > 0) await l.load(r.referrer_id);
        if (num(r.referred_reward) > 0) await l.load(r.referred_id);
        tx.update(refDoc.ref, { status: 'credited', credited_at: now(), order_id: orderId });
        if (referrerExists && num(r.referrer_reward) > 0) l.credit(r.referrer_id, num(r.referrer_reward), 'referral', `Referral reward for inviting ${r.referred_name ?? ''}`.trim(), orderId, null, `referral_${refDoc.id}_referrer`);
        if (num(r.referred_reward) > 0) l.credit(r.referred_id, num(r.referred_reward), 'referral', 'Welcome referral reward', orderId, null, `referral_${refDoc.id}_referred`);
        l.commit();
        return true;
      });
      if (done && num(r.referrer_reward) > 0) {
        await notifyUser(r.referrer_id, 'Referral reward credited', `${formatMoney(num(r.referrer_reward), sym)} added to your wallet.`, { type: 'wallet' });
      }
    }
  }
}

/* ------------------------------------------------------------------ notifications */
async function notifyStatus(orderId: string, before: OrderDoc | null, o: OrderDoc, sym: string, autoAssigned = false) {
  const created = !before;
  const placed = o.status === 'received' && (created || before?.status === 'payment_pending');
  if (placed) {
    await notifyUser(o.user_id, 'Order placed', `Your order ${o.order_number} has been placed successfully.`, { type: 'order', order_id: orderId, status: o.status });
    if (o.store_id) {
      const store = await db.doc(`stores/${o.store_id}`).get();
      const owner = store.get('owner_uid') as string | undefined;
      if (owner) await notifyUser(owner, 'New order received', `Order ${o.order_number} • ${formatMoney(num(o.totals?.grand_total), sym)}`, { type: 'order', order_id: orderId });
    }
    await sendTemplate('order_placed', o.customer?.email, { name: o.customer?.name ?? '', order_number: o.order_number, total: formatMoney(num(o.totals?.grand_total), sym) },
      { subject: 'Order {{order_number}} placed', body: '<p>Hi {{name}},</p><p>Thanks for your order <strong>{{order_number}}</strong> ({{total}}). We will notify you when it is on the way.</p>' });
  } else if (o.status !== 'payment_pending') {
    let otp: string | null = null;
    if (o.status === 'out_for_delivery') otp = ((await db.doc(`orders/${orderId}/secret/otp`).get()).get('delivery_otp') as string | undefined) ?? null;
    const msg = statusMessage(o.status, o.order_number, otp);
    if (msg) await notifyUser(o.user_id, `Order ${statusLabel(o.status)}`, msg, { type: 'order', order_id: orderId, status: o.status });
    if (o.status === 'delivered') {
      await sendTemplate('order_delivered', o.customer?.email, { name: o.customer?.name ?? '', order_number: o.order_number },
        { subject: 'Order {{order_number}} delivered', body: '<p>Hi {{name}},</p><p>Your order <strong>{{order_number}}</strong> has been delivered. Enjoy!</p>' });
    }
  }
  // Zone riders: new pool order
  if (!autoAssigned && ['received', 'ready_for_pickup'].includes(o.status) && !o.delivery_boy_id && o.delivery_type === 'delivery' && o.zone_id) {
    const riders = await db.collection('delivery_boys').where('zone_id', '==', o.zone_id).where('is_online', '==', true).where('approval_status', '==', 'approved').get();
    await pushToUsers(riders.docs.map((r) => r.id), 'New order available', `Order ${o.order_number} is ready to be accepted.`, { type: 'order', order_id: orderId });
  }
  // Assigned rider: status changes made by store/admin
  if (o.delivery_boy_id && before && before.status !== o.status && ['ready_for_pickup', 'cancelled'].includes(o.status)) {
    await notifyUser(o.delivery_boy_id, `Order ${statusLabel(o.status)}`, `Order ${o.order_number} is now ${statusLabel(o.status).toLowerCase()}.`, { type: 'order', order_id: orderId, status: o.status });
  }
}

/**
 * Event-id dedupe: Firestore triggers are delivered at least once; stats/counters use increments, so a duplicate delivery
 * would double count. `_trigger_events/{eventId}` (functions-only; set a TTL policy on `expire_at`) makes it idempotent.
 */
export async function firstDelivery(eventId: string | undefined, name: string): Promise<boolean> {
  if (!eventId) return true;
  try {
    await db.doc(`_trigger_events/${name}_${eventId}`).create({ at: now(), expire_at: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    logger.warn('trigger dedupe write failed', String(e));
    return true;
  }
}

export const onOrderWritten = onDocumentWritten({ document: 'orders/{orderId}', region: REGION }, async (event) => {
  if (!(await firstDelivery(event.id, 'order'))) return;
  const before = event.data?.before.exists ? (event.data.before.data() as OrderDoc) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as OrderDoc) : null;
  const orderId = event.params.orderId;
  const settings = await publicSettings();
  const sym = settings.currency_symbol ?? '₹';
  try {
    await applyStats(before, after, 'Asia/Kolkata'); // binding rule §8: always IST buckets
  } catch (e) {
    logger.error('stats update failed', { orderId, error: String(e) });
  }
  if (!after) return;
  const statusChanged = !before || before.status !== after.status;
  if (!statusChanged) return;
  // Laravel OrderService::afterPlaced → autoAssign: quick-mode orders, when settings auto_assign_delivery is on,
  // right after placement (received on create / payment_pending → received).
  let autoAssigned = false;
  const placed = after.status === 'received' && (!before || before.status === 'payment_pending');
  if (placed && after.mode === 'quick' && after.delivery_type !== 'self_pickup' && !after.delivery_boy_id && autoAssignEnabled(settings)) {
    try {
      autoAssigned = !!(await autoAssignRider(orderId, after));
    } catch (e) {
      logger.warn('auto-assign failed', { orderId, error: String(e) });
    }
  }
  try {
    await notifyStatus(orderId, before, after, sym, autoAssigned);
  } catch (e) {
    logger.warn('order notifications failed', { orderId, error: String(e) });
  }
  if (after.status === ('delivered' as OrderStatus) && before?.status !== 'delivered') {
    await onDelivered(orderId, after, sym);
  }
});
