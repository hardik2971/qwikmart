/**
 * Cart: lines in users/{uid}/cart/{mode}_{storeId|'central'}_{variantId} (owner CRUD, guests via anonymous auth);
 * totals always come from the `cartSummary` callable (server prices). The applied promo code is kept on the
 * client and sent with every summary / placeOrder call.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type { Cart, CartItem, Coupon, Id } from '../types';
import { call, ctx, guard, num, uid, type Raw } from './core';

const PROMO_KEY = 'sb-promo';
export function getPromoCode(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(PROMO_KEY) : null;
  } catch {
    return null;
  }
}
export function setPromoCode(code: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (code) window.localStorage.setItem(PROMO_KEY, code);
    else window.localStorage.removeItem(PROMO_KEY);
  } catch {
    /* ignore */
  }
}

/** Arguments shared by cartSummary / listCoupons / placeOrder. */
export function summaryArgs(extra: Record<string, unknown> = {}) {
  const c = ctx();
  return {
    zone_id: c.zoneId ?? undefined,
    mode: c.mode,
    lang: c.lang,
    platform: 'web',
    ...(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : {}),
    ...extra,
  };
}

export function toCart(s: Raw): Cart {
  const items: CartItem[] = (s.items ?? []).map((i: Raw) => ({
    id: i.line_id,
    product_variant_id: i.variant_id,
    product_id: i.product_id,
    product_name: i.name,
    product_slug: i.slug,
    variant_name: i.variant_name,
    image: i.image ?? '',
    price: num(i.price),
    sale_price: i.sale_price ?? null,
    qty: num(i.qty),
    stock: num(i.stock ?? i.max_qty),
    line_total: num(i.line_total),
    max_qty: num(i.max_qty),
    in_stock: i.in_stock !== false,
  }));
  return {
    items,
    subtotal: num(s.subtotal),
    mrp_total: num(s.mrp_total),
    savings: num(s.savings),
    delivery_charge: num(s.delivery_charge),
    surge_charge: num(s.surge_charge),
    additional_charges: num(s.additional_charges),
    tax: num(s.tax),
    tax_inclusive: !!s.tax_inclusive,
    promo: s.promo ? { code: s.promo.code, discount: num(s.promo.discount), title: s.promo.title ?? undefined, is_cashback: !!s.promo.is_cashback, free_delivery: !!s.promo.free_delivery } : null,
    promo_error: s.promo_error ?? null,
    promo_discount: s.promo ? num(s.promo.discount) : 0,
    wallet_balance: num(s.wallet_balance),
    wallet_used: num(s.wallet_used),
    total: num(s.total),
    grand_total: num(s.grand_total),
    free_delivery_remaining: num(s.free_delivery_remaining),
    min_order: num(s.min_order),
    min_order_remaining: num(s.min_order_remaining),
    can_checkout: !!s.can_checkout,
    issues: s.issues ?? [],
  };
}

interface SummaryOpts {
  address_id?: Id | null;
  delivery_type?: 'delivery' | 'self_pickup';
}

async function summary(promo: string | null = getPromoCode(), opts: SummaryOpts = {}): Promise<Cart> {
  const extra: Record<string, unknown> = promo ? { promo_code: promo } : {};
  if (opts.delivery_type) extra.delivery_type = opts.delivery_type;
  if (opts.address_id && opts.delivery_type !== 'self_pickup') extra.address_id = String(opts.address_id);
  const s = await call<Raw>('cartSummary', summaryArgs(extra));
  return toCart(s);
}

/** Cart summary; drops a stored promo code the server no longer accepts (cart changed, expired…). */
export async function cart(opts: SummaryOpts = {}): Promise<Cart> {
  const c = await summary(getPromoCode(), opts);
  if (getPromoCode() && !c.promo && c.promo_error) setPromoCode(null);
  return c;
}

function lineRef(owner: string, lineId: string) {
  return doc(fb().db, 'users', owner, 'cart', lineId);
}

export async function addToCart(variantId: Id, qty: number, productId?: Id): Promise<Cart> {
  if (!productId) throw new ApiError('Product not found', 404);
  const owner = await uid();
  const c = ctx();
  const storeId = c.mode === 'quick' ? c.storeId : null;
  const lineId = `${c.mode}_${storeId ?? 'central'}_${variantId}`;
  await guard(async () => {
    const ref = lineRef(owner, lineId);
    const cur = await getDoc(ref);
    const next = Math.min(100, (cur.exists() ? num(cur.get('qty')) : 0) + Math.max(1, Math.trunc(qty)));
    if (cur.exists()) await updateDoc(ref, { qty: next, updated_at: serverTimestamp() });
    else
      await setDoc(ref, {
        product_id: String(productId),
        variant_id: String(variantId),
        store_id: storeId,
        mode: c.mode,
        qty: next,
        added_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
  });
  return cart();
}

export async function updateCartItem(lineId: Id, qty: number): Promise<Cart> {
  if (qty <= 0) return removeCartItem(lineId);
  const owner = await uid();
  await guard(() => updateDoc(lineRef(owner, String(lineId)), { qty: Math.min(100, Math.trunc(qty)), updated_at: serverTimestamp() }));
  return cart();
}

/** Removes every line of the variant (lines are aggregated per variant by cartSummary). */
export async function removeCartItem(lineId: Id): Promise<Cart> {
  const owner = await uid();
  const variant = String(lineId).split('_').slice(2).join('_');
  const mode = ctx().mode;
  await guard(async () => {
    const s = await getDocs(query(collection(fb().db, 'users', owner, 'cart'), where('mode', '==', mode), where('variant_id', '==', variant)));
    if (s.empty) await deleteDoc(lineRef(owner, String(lineId)));
    else await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
  });
  return cart();
}

export async function clearCart(): Promise<Cart> {
  const owner = await uid();
  await guard(async () => {
    const s = await getDocs(query(collection(fb().db, 'users', owner, 'cart'), where('mode', '==', ctx().mode)));
    const b = writeBatch(fb().db);
    s.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  });
  setPromoCode(null);
  return cart();
}

export async function promoCodes(): Promise<Coupon[]> {
  const list = await call<Raw[]>('listCoupons', summaryArgs());
  return (list ?? []).map((c: Raw) => ({
    id: c.code,
    code: c.code,
    title: c.title ?? c.code,
    description: c.description ?? '',
    discount_type: c.discount_type,
    discount_value: num(c.discount_value),
    max_discount: c.max_discount ?? null,
    min_order: num(c.min_order),
    banner_color: c.banner_color ?? undefined,
    is_applicable: !!c.applicable,
    applicable: !!c.applicable,
    discount: num(c.discount),
    message: c.message ?? null,
    is_cashback: !!c.is_cashback,
  }));
}

export async function applyPromo(code: string): Promise<Cart> {
  const c = await summary(code.trim().toUpperCase());
  if (!c.promo) throw new ApiError(c.promo_error || 'This promo code is invalid or expired.', 422, { code: [c.promo_error || 'Invalid code'] });
  setPromoCode(c.promo.code);
  return c;
}

export async function removePromo(): Promise<Cart> {
  setPromoCode(null);
  return summary(null);
}

/** After signing in from a guest session whose uid could not be kept: move the guest cart over. */
export async function mergeGuestCart(guestUid: string) {
  return call<{ merged: number }>('mergeGuestCart', { guest_uid: guestUid });
}
