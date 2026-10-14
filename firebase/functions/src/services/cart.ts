/** Cart pricing engine (Laravel CartService::summary) shared by cartSummary and placeOrder. */
import type { DocumentReference, DocumentSnapshot, Query, QuerySnapshot } from 'firebase-admin/firestore';
import { db, invalid, precondition, publicSettings, Transaction, tzOf } from '../shared/firebase';
import type { AddressDoc, CartLineDoc, CartSummaryItem, CartSummaryResult, Mode, ProductDoc, StoreStockDoc, UserDoc, VariantDoc } from '../shared/types';
import { formatMoney, haversineKm, isOn, money, num, pick } from '../shared/util';
import { currentSurge, deliveryChargeFor, deliveryMinutes, findZone, getZone, round2, storeFor, StoreRec, ZoneRec } from './zones';
import { evaluatePromo, findPromoByCode, PromoError, PromoLine, PromoRec, promoUserFacts, promoTitle } from './promo';

export interface Reader {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  getAll(refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
  query(q: Query): Promise<QuerySnapshot>;
  tx?: Transaction;
}

export const dbReader: Reader = {
  get: (r) => r.get(),
  getAll: async (refs) => (refs.length ? db.getAll(...refs) : []),
  query: (q) => q.get(),
};

export function txReader(tx: Transaction): Reader {
  return {
    tx,
    get: (r) => tx.get(r),
    getAll: async (refs) => (refs.length ? tx.getAll(...refs) : []),
    query: (q) => tx.get(q),
  };
}

export type ProductRec = ProductDoc & { id: string };

export interface Pricing { price: number; sale_price: number | null; unit_price: number; stock: number; discount_percent: number }

/** Variant pricing with an optional store-level override (ProductVariant::pricingFor). */
export function pricingFor(variant: VariantDoc, ss: StoreStockDoc | null): Pricing {
  const price = num(ss && ss.price != null ? ss.price : variant.price);
  let sale: number | null;
  if (ss && ss.price != null) sale = ss.sale_price ?? null;
  else sale = (ss?.sale_price ?? variant.sale_price) ?? null;
  if (sale !== null) sale = num(sale);
  if (sale !== null && (sale <= 0 || sale >= price)) sale = null;
  const stock = ss ? Math.trunc(num(ss.stock)) : Math.trunc(num(variant.stock));
  const unit = sale ?? price;
  return {
    price: money(price),
    sale_price: sale !== null ? money(sale) : null,
    unit_price: money(unit),
    stock: Math.max(0, stock),
    discount_percent: sale !== null && price > 0 ? Math.round(((price - sale) / price) * 100) : 0,
  };
}

export function findVariant(p: ProductDoc, variantId: string): VariantDoc | undefined {
  return (p.variants ?? []).find((v) => String(v.id) === String(variantId));
}

export function supports(ft: string | undefined, mode: Mode) {
  return !ft || ft === 'both' || ft === mode;
}

export interface SummaryArgs {
  uid: string | null;
  zone_id?: string | null;
  mode: Mode;
  promo_code?: string | null;
  use_wallet?: boolean;
  address_id?: string | null;
  delivery_type?: 'delivery' | 'self_pickup';
  platform?: string | null;
  lang?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface InternalLine {
  variant_id: string; product_id: string; refs: DocumentReference[]; qty: number; product: ProductRec; variant: VariantDoc;
  pricing: Pricing; stock_source: 'store' | 'central'; tax_percent: number; tax_amount: number; line_total: number; item: CartSummaryItem;
}

export interface SummaryInternal {
  zone: ZoneRec | null; store: StoreRec | null; address: (AddressDoc & { id: string }) | null; user: (UserDoc & { id: string }) | null;
  promo: PromoRec | null; lines: InternalLine[]; staleRefs: DocumentReference[]; lineRefs: DocumentReference[];
  stockStoreId: string | null; promoInstant: number; currencySymbol: string;
}

export async function cartSummary(args: SummaryArgs, reader: Reader = dbReader, strict = false): Promise<{ summary: CartSummaryResult; internal: SummaryInternal }> {
  const settings = await publicSettings();
  const taxInclusive = settings.tax_inclusive ?? true;
  const tz = tzOf(settings);
  const sym = settings.currency_symbol ?? '₹';
  const lang = args.lang || 'en';
  const mode: Mode = args.mode === 'ecommerce' ? 'ecommerce' : 'quick';
  const issues: string[] = [];

  // Cart lines + user
  const [lineSnap, userSnap] = await Promise.all([
    args.uid ? reader.query(db.collection(`users/${args.uid}/cart`).where('mode', '==', mode)) : Promise.resolve(null),
    args.uid ? reader.get(db.doc(`users/${args.uid}`)) : Promise.resolve(null),
  ]);
  const user = userSnap?.exists ? ({ id: userSnap.id, ...(userSnap.data() as UserDoc) }) : null;
  const rawLines = (lineSnap?.docs ?? []).map((d) => ({ ref: d.ref, data: d.data() as CartLineDoc }));

  // Address / coordinates
  let address: SummaryInternal['address'] = null;
  if (args.address_id && args.uid) {
    const a = await reader.get(db.doc(`users/${args.uid}/addresses/${args.address_id}`));
    if (a.exists) address = { id: a.id, ...(a.data() as AddressDoc) };
    else if (strict) invalid('Selected address not found.', { field: 'address_id' });
  }
  // Pricing basis (same rule for cartSummary and placeOrder): the delivery address when one is given, otherwise the
  // zone/store default (no distance → base charge, default store). A client-detected lat/lng only helps find the zone,
  // so the summary total always equals what placeOrder charges for the same inputs.
  const lat = address?.lat != null ? address.lat : null;
  const lng = address?.lng != null ? address.lng : null;
  const deliveryBasis: 'address' | 'default' = lat != null && lng != null ? 'address' : 'default';

  // Zone / store
  let zone = await getZone(args.zone_id ?? null);
  const zoneLat = lat ?? (address?.lat ?? args.lat ?? null);
  const zoneLng = lng ?? (address?.lng ?? args.lng ?? null);
  if (!zone && zoneLat != null && zoneLng != null) zone = await findZone(Number(zoneLat), Number(zoneLng));
  let store: StoreRec | null = null;
  if (!zone && rawLines.length) {
    const sid = rawLines.find((l) => l.data.store_id)?.data.store_id;
    if (sid) {
      const s = await db.doc(`stores/${sid}`).get();
      if (s.exists) {
        store = { ...(s.data() as StoreRec), id: s.id };
        zone = await getZone(store.zone_id);
      }
    }
  }
  if (zone) store = await storeFor(zone.id, mode, lat, lng);
  const stockStoreId = mode === 'quick' && store ? store.id : null;

  // Aggregate lines per variant
  const byVariant = new Map<string, { product_id: string; qty: number; refs: DocumentReference[] }>();
  for (const l of rawLines) {
    const vid = String(l.data.variant_id ?? '');
    if (!vid || !l.data.product_id) continue;
    const cur = byVariant.get(vid) ?? { product_id: String(l.data.product_id), qty: 0, refs: [] };
    cur.qty += Math.max(1, Math.trunc(num(l.data.qty, 1)));
    cur.refs.push(l.ref);
    byVariant.set(vid, cur);
  }
  const productIds = [...new Set([...byVariant.values()].map((v) => v.product_id))];
  const productSnaps = await reader.getAll(productIds.map((id) => db.doc(`products/${id}`)));
  const products = new Map<string, ProductRec>();
  productSnaps.forEach((s) => s.exists && products.set(s.id, { id: s.id, ...(s.data() as ProductDoc) }));
  const variantIds = [...byVariant.keys()];
  const ssSnaps = stockStoreId ? await reader.getAll(variantIds.map((v) => db.doc(`store_stocks/${stockStoreId}_${v}`))) : [];
  const storeStocks = new Map<string, StoreStockDoc>();
  ssSnaps.forEach((s, i) => s.exists && storeStocks.set(variantIds[i], s.data() as StoreStockDoc));

  // Lines
  const lines: InternalLine[] = [];
  const staleRefs: DocumentReference[] = [];
  const promoLines: PromoLine[] = [];
  let mrpTotal = 0, subtotal = 0, tax = 0, totalQty = 0;
  for (const [vid, agg] of byVariant) {
    const product = products.get(agg.product_id);
    const variant = product ? findVariant(product, vid) : undefined;
    if (!product || !variant) {
      staleRefs.push(...agg.refs);
      continue;
    }
    const ss = storeStocks.get(vid) ?? null;
    const p = pricingFor(variant, ss);
    const qty = agg.qty;
    const lineTotal = money(p.unit_price * qty);
    const lineMrp = money(p.price * qty);
    const taxPct = num(product.tax_percent);
    const lineTax = taxInclusive ? money(lineTotal - lineTotal / (1 + taxPct / 100)) : money((lineTotal * taxPct) / 100);
    const name = pick(product.name, lang);
    const maxPer = Math.trunc(num(product.max_qty_per_order));
    let available = product.status === 'active' && isOn(variant.status) && p.stock >= qty;
    if (!available) {
      issues.push(p.stock > 0 && product.status === 'active' && isOn(variant.status)
        ? `Only ${p.stock} units of ${name} (${variant.name}) are available.`
        : `${name} (${variant.name}) is out of stock.`);
    } else if (!supports(product.fulfillment_type, mode)) {
      available = false;
      issues.push(`${name} is not available in ${mode === 'quick' ? 'Quick' : 'eCommerce'} mode.`);
    } else if (maxPer > 0 && qty > maxPer) {
      available = false;
      issues.push(`You can order a maximum of ${maxPer} units of ${name}.`);
    }
    const item: CartSummaryItem = {
      line_id: agg.refs[0].id, product_id: product.id, variant_id: vid, name, variant_name: variant.name ?? '',
      image: variant.image || product.thumbnail || product.images?.[0] || null, slug: product.slug ?? '',
      price: p.price, sale_price: p.sale_price, unit_price: p.unit_price, qty, line_total: lineTotal, tax_amount: lineTax,
      in_stock: available, max_qty: Math.min(p.stock, maxPer > 0 ? maxPer : p.stock), stock: p.stock, cod_allowed: product.cod_allowed ?? true,
    };
    lines.push({
      variant_id: vid, product_id: product.id, refs: agg.refs, qty, product, variant, pricing: p,
      stock_source: ss ? 'store' : 'central', tax_percent: taxPct, tax_amount: lineTax, line_total: lineTotal, item,
    });
    promoLines.push({
      product_id: product.id, category_id: product.category_id ?? null, sub_category_id: product.sub_category_id ?? null,
      category_ids: product.category_ids ?? [], store_id: store?.id ?? product.store_id ?? null, line_total: lineTotal,
    });
    mrpTotal += lineMrp; subtotal += lineTotal; tax += lineTax; totalQty += qty;
  }
  subtotal = money(subtotal);
  mrpTotal = money(mrpTotal);
  const hasLines = lines.length > 0;

  // Delivery
  const selfPickup = args.delivery_type === 'self_pickup';
  const distance = store && store.lat != null && store.lng != null && lat != null && lng != null
    ? round2(haversineKm(Number(lat), Number(lng), Number(store.lat), Number(store.lng))) : null;
  const deliveryOriginal = !selfPickup && zone && hasLines ? deliveryChargeFor(zone, distance) : 0;
  const freeAbove = zone && zone.free_delivery_above !== null && zone.free_delivery_above !== undefined ? num(zone.free_delivery_above) : null;
  const delivery = freeAbove !== null && subtotal >= freeAbove ? 0 : deliveryOriginal;
  const surge = !selfPickup && zone && hasLines ? currentSurge(zone, new Date(), tz) : 0;
  const extras = !selfPickup && zone && hasLines
    ? (zone.additional_charges ?? []).filter((c) => num(c?.amount) > 0).map((c) => ({ name: pick(c.name as never, lang), amount: money(num(c.amount)) }))
    : [];
  const additional = money(extras.reduce((s, c) => s + c.amount, 0));
  const minOrder = num(zone?.min_order);
  if (hasLines && subtotal < minOrder) issues.push(`Minimum order value is ${formatMoney(minOrder, sym)}.`);
  if (hasLines && !store && mode === 'quick') issues.push('No store is delivering to your location right now.');
  if (hasLines && zone && (zone.status as unknown) !== undefined && !isOn(zone.status)) issues.push('We do not deliver to this area right now.');
  if (hasLines && zone && !supports(zone.fulfillment_type, mode)) issues.push(`${mode === 'quick' ? 'Quick' : 'eCommerce'} delivery is not available in this area.`);
  if (store && store.is_open === false && mode === 'quick') issues.push('The store is currently closed.');

  // Promo
  let promo: CartSummaryResult['promo'] = null;
  let promoRec: PromoRec | null = null;
  let promoError: string | null = null;
  let promoDiscount = 0;
  if (args.promo_code && String(args.promo_code).trim() && hasLines) {
    try {
      promoRec = await findPromoByCode(String(args.promo_code), reader.tx, store?.id ?? null);
      const facts = args.uid && user && !isAnonymousUser(user) ? await promoUserFacts(args.uid, promoRec.id, reader.tx) : null;
      const res = evaluatePromo(promoRec, facts, {
        items: promoLines, subtotal, delivery_charge: delivery, zone_id: zone?.id ?? null, country_id: zone?.country_id ?? null,
        mode, platform: args.platform ?? null, tz, currencySymbol: sym,
      });
      promoDiscount = res.discount;
      promo = {
        code: promoRec.code, title: promoTitle(promoRec, lang), discount: res.discount, is_cashback: res.is_cashback, free_delivery: res.free_delivery,
        message: res.is_cashback ? `${formatMoney(res.discount, sym)} cashback will be credited after delivery.` : `You saved ${formatMoney(res.discount, sym)} with ${promoRec.code}.`,
      };
    } catch (e) {
      if (!(e instanceof PromoError)) throw e;
      if (strict) invalid(e.message, { field: 'promo_code' });
      promoRec = null;
      promoError = e.message;
    }
  }
  const instant = promo && !promo.is_cashback ? promoDiscount : 0;
  const grand = money(Math.max(0, subtotal - instant + delivery + surge + additional + (taxInclusive ? 0 : tax)));

  // Wallet
  const walletBalance = money(num(user?.wallet_balance));
  const walletUsed = args.use_wallet && user ? money(Math.min(walletBalance, grand)) : 0;
  const total = money(grand - walletUsed);

  if (strict && !hasLines) precondition('Your cart is empty.');
  if (strict && issues.length) precondition(issues[0], { issues });

  const summary: CartSummaryResult = {
    items: lines.map((l) => l.item),
    item_count: lines.length,
    total_qty: totalQty,
    mrp_total: mrpTotal,
    subtotal,
    savings: money(mrpTotal - subtotal + instant + (deliveryOriginal - delivery)),
    delivery_charge: money(delivery),
    delivery_charge_original: money(deliveryOriginal),
    surge_charge: money(surge),
    additional_charges: additional,
    additional_charges_breakdown: extras,
    tax: money(tax),
    tax_inclusive: taxInclusive,
    promo,
    promo_error: promoError,
    wallet_balance: walletBalance,
    wallet_used: walletUsed,
    grand_total: grand,
    total,
    free_delivery_remaining: freeAbove !== null ? money(Math.max(0, freeAbove - subtotal)) : 0,
    free_delivery_above: freeAbove,
    min_order: minOrder,
    min_order_remaining: money(Math.max(0, minOrder - subtotal)),
    distance_km: distance,
    delivery_minutes: zone ? deliveryMinutes(zone, distance, mode) : null,
    store: store ? { id: store.id, name: store.name, is_open: store.is_open !== false } : null,
    zone_id: zone?.id ?? null,
    delivery_basis: deliveryBasis,
    mode,
    can_checkout: hasLines && issues.length === 0,
    issues,
  };
  return {
    summary,
    internal: {
      zone, store, address, user, promo: promoRec, lines, staleRefs, lineRefs: rawLines.map((l) => l.ref), stockStoreId,
      promoInstant: instant, currencySymbol: sym,
    },
  };
}

function isAnonymousUser(u: UserDoc): boolean {
  return (u as unknown as { is_anonymous?: boolean }).is_anonymous === true;
}
