/** cartSummary, listCoupons, mergeGuestCart. */
import { auth, authed, db, hotOpts, notFound, now, oneOf, precondition, publicSettings, str, tzOf } from '../shared/firebase';
import type { CartLineDoc, CouponListItem, Mode, PromoCodeDoc } from '../shared/types';
import { pick } from '../shared/util';
import { cartSummary } from '../services/cart';
import { evaluatePromo, isRunning, PromoError, promoUserFacts } from '../services/promo';

interface SummaryInput { zone_id?: string; mode?: Mode; promo_code?: string; use_wallet?: boolean; address_id?: string; delivery_type?: string; platform?: string; lang?: string; lat?: number; lng?: number }

export function summaryArgs(uid: string, data: SummaryInput) {
  return {
    uid,
    zone_id: str(data.zone_id, 'zone_id', { max: 128 }) || null,
    mode: oneOf(data.mode, 'mode', ['quick', 'ecommerce'] as const, 'quick'),
    promo_code: str(data.promo_code, 'promo_code', { max: 40 }) || null,
    use_wallet: !!data.use_wallet,
    address_id: str(data.address_id, 'address_id', { max: 128 }) || null,
    delivery_type: oneOf(data.delivery_type, 'delivery_type', ['delivery', 'self_pickup'] as const, 'delivery'),
    platform: data.platform === 'web' ? 'web' : data.platform === 'app' ? 'app' : null,
    lang: str(data.lang, 'lang', { max: 10 }) || 'en',
    lat: data.lat !== undefined && data.lat !== null ? Number(data.lat) : null,
    lng: data.lng !== undefined && data.lng !== null ? Number(data.lng) : null,
  };
}

export const cartSummaryFn = authed<SummaryInput>(async (data, ctx) => {
  const { summary } = await cartSummary(summaryArgs(ctx.uid, data));
  return summary;
}, hotOpts);

export const listCoupons = authed<SummaryInput>(async (data, ctx) => {
  const args = summaryArgs(ctx.uid, { ...data, promo_code: undefined });
  const { summary, internal } = await cartSummary(args);
  const settings = await publicSettings();
  const snap = await db.collection('promo_codes').where('status', 'in', ['active', true]).get();
  const nowD = new Date();
  const user = internal.user && !(internal.user as unknown as { is_anonymous?: boolean }).is_anonymous ? internal.user : null;
  const promoLines = internal.lines.map((l) => ({
    product_id: l.product_id, category_id: l.product.category_id ?? null, sub_category_id: l.product.sub_category_id ?? null,
    category_ids: l.product.category_ids ?? [], store_id: internal.store?.id ?? l.product.store_id ?? null, line_total: l.line_total,
  }));
  const out: CouponListItem[] = [];
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as PromoCodeDoc) }))
    .filter((p) => isRunning(p, nowD))
    .filter((p) => !p.zone_ids?.length || p.zone_ids.map(String).includes(String(summary.zone_id ?? '')))
    // store promos are listed only for that store's cart
    .filter((p) => { const sid = (p as PromoCodeDoc & { store_id?: string | null }).store_id; return !sid || String(sid) === String(internal.store?.id ?? ''); })
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  for (const p of docs) {
    let applicable = false, discount = 0, message: string | null = null;
    try {
      const facts = user ? await promoUserFacts(ctx.uid, p.id) : null;
      const r = evaluatePromo(p, facts, {
        items: promoLines, subtotal: summary.subtotal, delivery_charge: summary.delivery_charge, zone_id: summary.zone_id,
        country_id: internal.zone?.country_id ?? null, mode: args.mode, platform: args.platform, tz: tzOf(settings), currencySymbol: settings.currency_symbol ?? '₹',
      });
      applicable = true;
      discount = r.discount;
    } catch (e) {
      if (!(e instanceof PromoError)) throw e;
      message = e.message;
    }
    out.push({
      code: p.code, title: p.title ? pick(p.title, args.lang) : null, description: p.description ? pick(p.description, args.lang) : null,
      image: p.image ?? null, banner_color: p.banner_color ?? null, discount_type: p.discount_type, discount_value: Number(p.discount_value ?? 0),
      max_discount: p.max_discount ?? null, min_order: Number(p.min_order ?? 0), applicable, discount, message, is_cashback: !!p.is_cashback,
    });
  }
  return out;
});

/** Move an anonymous user's cart into the signed-in user's cart (max qty wins on conflicts). */
export const mergeGuestCart = authed<{ guest_uid?: string }>(async (data, ctx) => {
  const guest = str(data.guest_uid, 'guest_uid', { required: true, max: 128 });
  if (guest === ctx.uid) return { merged: 0 };
  let guestUser;
  try {
    guestUser = await auth.getUser(guest);
  } catch {
    notFound('Guest session not found.');
  }
  // only an anonymous guest account (no provider, email or phone) can donate its cart
  if (guestUser!.providerData.length > 0 || guestUser!.email || guestUser!.phoneNumber) precondition('Only guest (anonymous) carts can be merged.');
  const lines = await db.collection(`users/${guest}/cart`).get();
  let merged = 0;
  await db.runTransaction(async (tx) => {
    const targets = lines.docs.map((d) => db.doc(`users/${ctx.uid}/cart/${d.id}`));
    const existing = targets.length ? await tx.getAll(...targets) : [];
    lines.docs.forEach((d, i) => {
      const g = d.data() as CartLineDoc;
      const cur = existing[i];
      const qty = cur.exists ? Math.max(Number(cur.get('qty') ?? 0), Number(g.qty ?? 0)) : Number(g.qty ?? 1);
      tx.set(targets[i], { ...g, qty, added_at: g.added_at ?? now(), updated_at: now() }, { merge: true });
      tx.delete(d.ref);
      merged++;
    });
  });
  return { merged };
});
