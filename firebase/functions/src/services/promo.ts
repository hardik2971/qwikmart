/** Promo validation & discount (Laravel PromoService). `evaluatePromo` is pure given the loaded user facts. */
import { db, Transaction } from '../shared/firebase';
import type { Mode, PromoCodeDoc } from '../shared/types';
import { formatMoney, inWindow, isOn, localHm, money, num, pick } from '../shared/util';
import { CANCELABLE_STATUSES } from '../shared/status';

export type PromoRec = PromoCodeDoc & { id: string };

export class PromoError extends Error {}

export interface PromoLine { product_id: string; category_id: string | null; sub_category_id: string | null; category_ids?: string[]; store_id: string | null; line_total: number }

export interface PromoCtx {
  items: PromoLine[]; subtotal: number; delivery_charge: number; zone_id: string | null; country_id: string | null;
  mode: Mode; platform?: string | null; at?: Date; tz?: string; currencySymbol?: string;
}

/** Facts about the user needed for audience / per-user limits. null user = guest. */
export interface PromoUserFacts { uid: string; hasOrders: boolean; usedCount: number }

export interface PromoResult { discount: number; eligible_subtotal: number; is_cashback: boolean; free_delivery: boolean }

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof (v as { _seconds?: number })._seconds === 'number') return new Date((v as { _seconds: number })._seconds * 1000);
  return null;
}

const ids = (arr: unknown): string[] => (Array.isArray(arr) ? arr.map((x) => String(x)) : []);

export function isRunning(p: PromoCodeDoc, at = new Date()): boolean {
  if (!isOn(p.status)) return false;
  if (p.is_permanent) return true;
  const s = toDate(p.starts_at);
  const e = toDate(p.ends_at);
  return !(s && s > at) && !(e && e < at);
}

export function evaluatePromo(promo: PromoCodeDoc, user: PromoUserFacts | null, ctx: PromoCtx): PromoResult {
  const at = ctx.at ?? new Date();
  const sym = ctx.currencySymbol ?? '₹';
  if (!isOn(promo.status) || promo.status === 'inactive') throw new PromoError('This coupon is not active.');
  if (!promo.is_permanent) {
    const s = toDate(promo.starts_at);
    const e = toDate(promo.ends_at);
    if (s && s > at) throw new PromoError('This coupon is not active yet.');
    if (e && e < at) throw new PromoError('This coupon has expired.');
  }
  if (promo.time_from && promo.time_to) {
    const t = localHm(at, ctx.tz) + ':00';
    const from = promo.time_from.length === 5 ? `${promo.time_from}:00` : promo.time_from;
    const to = promo.time_to.length === 5 ? `${promo.time_to}:00` : promo.time_to;
    if (!inWindow(t, from, to, true)) throw new PromoError(`This coupon is valid only between ${from.slice(0, 5)} and ${to.slice(0, 5)}.`);
  }
  if (num(promo.usage_limit_total) > 0 && num(promo.used_count) >= num(promo.usage_limit_total)) {
    throw new PromoError('This coupon has reached its usage limit.');
  }
  if (promo.channels?.length && !promo.channels.includes(ctx.mode)) throw new PromoError('This coupon is not valid for this shopping mode.');
  if (promo.platforms?.length && ctx.platform && !(promo.platforms as string[]).includes(ctx.platform)) {
    throw new PromoError('This coupon is not valid on this platform.');
  }
  if (promo.zone_ids?.length && !ids(promo.zone_ids).includes(String(ctx.zone_id ?? ''))) throw new PromoError('This coupon is not valid in your area.');
  if (promo.country_ids?.length && ctx.country_id && !ids(promo.country_ids).includes(String(ctx.country_id))) {
    throw new PromoError('This coupon is not valid in your country.');
  }
  const audience = promo.audience ?? 'all';
  if (user) {
    if (audience === 'new' && user.hasOrders) throw new PromoError('This coupon is only for new customers.');
    if (audience === 'existing' && !user.hasOrders) throw new PromoError('This coupon is only for existing customers.');
    if (num(promo.usage_limit_per_user) > 0 && user.usedCount >= num(promo.usage_limit_per_user)) {
      throw new PromoError('You have already used this coupon the maximum number of times.');
    }
  } else if (audience !== 'all') {
    throw new PromoError('Please log in to use this coupon.');
  }

  const eligible = eligibleSubtotal(promo, ctx.items);
  if (eligible <= 0) throw new PromoError('This coupon is not applicable to the items in your cart.');
  const subtotal = ctx.subtotal ?? eligible;
  if (subtotal < num(promo.min_order)) {
    throw new PromoError(`Add items worth ${formatMoney(num(promo.min_order) - subtotal, sym)} more to use this coupon.`);
  }

  let discount = 0;
  switch (promo.discount_type) {
    case 'percent': discount = (eligible * num(promo.discount_value)) / 100; break;
    case 'fixed': discount = Math.min(num(promo.discount_value), eligible); break;
    case 'free_delivery': discount = num(ctx.delivery_charge); break;
    default: discount = 0;
  }
  const freeDelivery = promo.discount_type === 'free_delivery';
  if (num(promo.max_discount) > 0 && !freeDelivery) discount = Math.min(discount, num(promo.max_discount));

  return { discount: money(discount), eligible_subtotal: money(eligible), is_cashback: !!promo.is_cashback, free_delivery: freeDelivery };
}

function eligibleSubtotal(promo: PromoCodeDoc, items: PromoLine[]): number {
  const want = ids(promo.applies_to_ids);
  // Store promos (store_id set, created by a store user) only ever discount that store's items.
  const promoStore = (promo as PromoCodeDoc & { store_id?: string | null }).store_id ?? null;
  let filtered = promoStore ? items.filter((i) => String(i.store_id ?? '') === String(promoStore)) : items;
  switch (promo.applies_to) {
    case 'categories':
      filtered = filtered.filter((i) => want.includes(String(i.category_id ?? '')) || want.includes(String(i.sub_category_id ?? '')) || (i.category_ids ?? []).some((c) => want.includes(c)));
      break;
    case 'products': filtered = filtered.filter((i) => want.includes(String(i.product_id))); break;
    case 'stores': filtered = filtered.filter((i) => want.includes(String(i.store_id ?? ''))); break;
    default: break;
  }
  return filtered.reduce((s, i) => s + num(i.line_total), 0);
}

/**
 * Look up a promo by code (codes are stored uppercase). Codes are not unique across stores (rules cannot enforce it), so
 * among duplicates prefer an active one of the cart's store, then an active platform promo (store_id null).
 */
export async function findPromoByCode(code: string, tx?: Transaction, storeId?: string | null): Promise<PromoRec> {
  const q = db.collection('promo_codes').where('code', '==', code.trim().toUpperCase()).limit(10);
  const snap = tx ? await tx.get(q) : await q.get();
  if (snap.empty) throw new PromoError('Invalid coupon code.');
  const recs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PromoCodeDoc) }) as PromoRec & { store_id?: string | null });
  const rank = (p: PromoRec & { store_id?: string | null }) => (isOn(p.status) && p.status !== 'inactive' ? 0 : 4)
    + (p.store_id && storeId && String(p.store_id) === String(storeId) ? 0 : !p.store_id ? 1 : 2);
  return recs.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0];
}

/** Load audience / usage facts (inside a transaction when given). */
export async function promoUserFacts(uid: string, promoId: string | null, tx?: Transaction): Promise<PromoUserFacts> {
  const placed = db.collection('orders').where('user_id', '==', uid)
    .where('status', 'in', ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'returned']).limit(1);
  const usageRef = promoId ? db.doc(`promo_usages/${promoId}_${uid}`) : null;
  const [ordersSnap, usageSnap] = await Promise.all([
    tx ? tx.get(placed) : placed.get(),
    usageRef ? (tx ? tx.get(usageRef) : usageRef.get()) : Promise.resolve(null),
  ]);
  return { uid, hasOrders: !ordersSnap.empty, usedCount: Number(usageSnap?.get('count') ?? 0) };
}

export function promoTitle(p: PromoCodeDoc, lang = 'en'): string | null {
  return p.title ? pick(p.title, lang) || null : null;
}

export { CANCELABLE_STATUSES };
