/**
 * Catalog & geography — Firestore reads (public per firestore.rules) + detectZone / getHome callables.
 *
 * Product listing (docs/FIREBASE_BACKEND.md §3): one array-contains constraint per query, so the most
 * selective one is used server-side (search_keywords → category_ids → in_stock_store_ids) together with
 * `status == 'active'` and the sort field; everything else (mode, store stock, brands, price, attributes,
 * remaining search terms) is filtered on the client over a bounded window. Indexes: firestore.indexes.json.
 */
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type {
  AppSettings,
  AttributeValue,
  Brand,
  Category,
  Country,
  HomeData,
  Id,
  Mode,
  Paginated,
  Product,
  ProductDetail,
  ProductFacets,
  ProductFilters,
  Review,
  SearchSuggestions,
  Variant,
  Zone,
  ZoneDetectResult,
} from '../types';
import { cached, call, chunk, ctx, guard, iso, isOn, money, num, pick, plain, type Raw } from './core';
import { favoriteIds } from './favorites';

const db = () => fb().db;
const TEN_MIN = 10 * 60_000;
const FIVE_MIN = 5 * 60_000;

/* ------------------------------------------------------------------ settings & geography */

function toCountry(id: string, c: Raw): Country {
  return {
    id,
    name: c.name,
    iso2: c.iso2,
    dial_code: c.dial_code,
    currency_code: c.currency_code,
    currency_symbol: c.currency_symbol,
    timezone: c.timezone,
    flag: c.flag ?? '',
    is_default: !!c.is_default,
  };
}

export function toZone(id: string, z: Raw): Zone {
  return {
    id,
    country_id: z.country_id,
    name: z.name,
    slug: z.slug,
    city: z.city ?? z.name,
    polygon: Array.isArray(z.polygon) ? z.polygon.map((p: Raw) => ({ lat: Number(p.lat), lng: Number(p.lng) })) : [],
    fulfillment_type: z.fulfillment_type ?? 'both',
    free_delivery_above: z.free_delivery_above ?? null,
    min_order: num(z.min_order),
    delivery_time_minutes: num(z.delivery_time_minutes, 10),
    default_store_id: z.default_store_id ?? null,
    center: z.center ?? null,
  };
}

export const countries = () =>
  cached('countries', TEN_MIN, () =>
    guard(async () => {
      const s = await getDocs(query(collection(db(), 'countries'), where('status', '==', 'active')));
      return s.docs.map((d) => toCountry(d.id, d.data())).sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || a.name.localeCompare(b.name));
    }),
  );

export const zones = (countryId?: Id) =>
  cached(`zones/${countryId ?? ''}`, FIVE_MIN, () =>
    guard(async () => {
      const cs: QueryConstraint[] = [where('status', '==', 'active')];
      if (countryId) cs.push(where('country_id', '==', String(countryId)));
      const s = await getDocs(query(collection(db(), 'zones'), ...cs));
      return s.docs.map((d) => toZone(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
    }),
  );

export async function detectZone(lat: number, lng: number): Promise<ZoneDetectResult> {
  const r = await call<Raw>('detectZone', { lat, lng, mode: ctx().mode });
  return {
    deliverable: !!r.deliverable,
    zone: r.zone ? toZone(r.zone.id, plain(r.zone)) : null,
    store: r.store ? { id: r.store.id, name: r.store.name, slug: '', lat: r.store.lat, lng: r.store.lng, is_open: r.store.is_open } : null,
    distance_km: r.distance_km ?? 0,
    delivery_minutes: r.delivery_minutes ?? 0,
  };
}

export const publicSettings = () =>
  cached('settings/public', FIVE_MIN, () => guard(async () => ((await getDoc(doc(db(), 'settings', 'public'))).data() ?? {}) as Raw));

export async function settings(): Promise<AppSettings> {
  const [s, cs, langs] = await Promise.all([
    publicSettings(),
    countries(),
    cached('languages', TEN_MIN, () => guard(() => getDocs(collection(db(), 'languages')))).catch(() => null),
  ]);
  const def = cs.find((c) => String(c.id) === String(s.default_country_id)) || cs.find((c) => c.is_default) || cs[0];
  return {
    ...s,
    app_name: s.app_name ?? 'QwikMart',
    logo: s.logo,
    primary_color: s.primary_color,
    currency: { code: s.currency_code ?? def?.currency_code ?? 'INR', symbol: s.currency_symbol ?? def?.currency_symbol ?? '₹' },
    countries: cs,
    languages: (langs?.docs ?? [])
      .filter((d) => isOn(d.get('status')))
      .map((d) => ({ code: d.id, name: d.get('name'), is_rtl: !!d.get('is_rtl'), is_default: !!d.get('is_default') })),
    payment_gateways: (Array.isArray(s.payment_methods) ? s.payment_methods : []).map((m: Raw) => ({
      key: m.key,
      name: m.name,
      public_key: m.public_key ?? null,
      enabled: m.enabled !== false,
    })),
    referral: {
      referrer_reward: num(s.referral?.referrer_reward, 50),
      referred_reward: num(s.referral?.referred_reward, 25),
      min_order: num(s.referral?.min_order, 199),
    },
    demo_mode: !!s.demo_mode,
    support_phone: s.support?.phone ?? '',
    support_email: s.support?.email ?? '',
    social_links: Object.fromEntries(Object.entries(s.social ?? {}).filter(([, v]) => !!v)) as Record<string, string>,
    company_name: s.company?.name ?? undefined,
    company_address: s.company?.address ?? undefined,
    play_store_url: s.app_versions?.play_store_url ?? undefined,
    app_store_url: s.app_versions?.app_store_url ?? undefined,
    min_app_version: s.app_versions?.customer_min,
  };
}

/* ------------------------------------------------------------------ categories & brands */

interface CatRec {
  id: string;
  c: Raw;
}

const allCategories = () =>
  cached('categories', FIVE_MIN, () =>
    guard(async () => {
      const s = await getDocs(query(collection(db(), 'categories'), where('status', '==', 'active')));
      return s.docs.map((d) => ({ id: d.id, c: d.data() })) as CatRec[];
    }),
  );

const modeOk = (c: Raw, mode: Mode) => (mode === 'quick' ? c.show_in_quick !== false : c.show_in_ecommerce !== false);

function toCategory({ id, c }: CatRec, lang: string): Category {
  return {
    id,
    parent_id: c.parent_id ?? null,
    name: pick(c.name, lang),
    slug: c.slug,
    image: c.image ?? null,
    icon: c.icon ?? null,
    banner: c.banner ?? null,
    header_color: c.header_color ?? null,
    products_count: num(c.product_count),
  };
}

/** Root categories with their children (visible in the current mode). */
export async function categories(): Promise<Category[]> {
  const { lang, mode } = ctx();
  const all = (await allCategories()).filter((r) => modeOk(r.c, mode)).sort((a, b) => num(a.c.sort_order) - num(b.c.sort_order));
  const roots = all.filter((r) => !r.c.parent_id);
  return roots.map((r) => ({
    ...toCategory(r, lang),
    children: all.filter((x) => String(x.c.parent_id) === r.id).map((x) => toCategory(x, lang)),
  }));
}

const allBrands = () =>
  cached('brands', TEN_MIN, () =>
    guard(async () => {
      const s = await getDocs(query(collection(db(), 'brands'), where('status', '==', 'active')));
      return s.docs
        .map((d) => ({ id: d.id, b: d.data() }))
        .sort((a, b) => num(a.b.sort_order) - num(b.b.sort_order) || pick(a.b.name).localeCompare(pick(b.b.name)));
    }),
  );

export async function brands(): Promise<Brand[]> {
  const { lang } = ctx();
  return (await allBrands()).map(({ id, b }) => ({ id, name: pick(b.name, lang), slug: b.slug, logo: b.logo ?? null }));
}

/* ------------------------------------------------------------------ attributes */

interface AttrIndex {
  byId: Map<string, AttributeValue>;
  facets: ProductFacets['attributes'];
}

const attributeIndex = (lang: string) =>
  cached(`attributes/${lang}`, TEN_MIN, () =>
    guard(async () => {
      const s = await getDocs(collection(db(), 'attributes'));
      const byId = new Map<string, AttributeValue>();
      const facets: ProductFacets['attributes'] = [];
      for (const d of s.docs) {
        const a = d.data();
        const name = pick(a.name, lang);
        const key = pick(a.name, 'en').toLowerCase();
        const values = (Array.isArray(a.values) ? a.values : []).map((v: Raw) => ({ id: v.id, value: String(v.value), color_hex: v.color_hex ?? null }));
        values.forEach((v: Raw) => byId.set(String(v.id), { id: v.id, attribute: name, value: v.value, color_hex: v.color_hex }));
        facets.push({ key, name, values });
      }
      return { byId, facets } as AttrIndex;
    }),
  );

/* ------------------------------------------------------------------ products */

export interface StockRec {
  stock: number;
  price: number | null;
  sale_price: number | null;
}

/** Variant pricing with an optional store-level override (same as functions `pricingFor`). */
export function pricingFor(v: Raw, ss: StockRec | null) {
  const price = num(ss && ss.price != null ? ss.price : v.price);
  let sale: number | null = ss && ss.price != null ? ss.sale_price ?? null : (ss?.sale_price ?? v.sale_price) ?? null;
  if (sale !== null) sale = num(sale);
  if (sale !== null && (sale <= 0 || sale >= price)) sale = null;
  const stock = Math.max(0, Math.trunc(ss ? num(ss.stock) : num(v.stock)));
  return { price: money(price), sale_price: sale !== null ? money(sale) : null, stock };
}

/** store_stocks for the given products in the quick-mode store (public read). */
export async function storeStocks(storeId: string | null, productIds: string[]): Promise<Map<string, StockRec>> {
  const out = new Map<string, StockRec>();
  if (!storeId || !productIds.length) return out;
  await Promise.all(
    chunk([...new Set(productIds)], 30).map(async (ids) => {
      const s = await getDocs(query(collection(db(), 'store_stocks'), where('store_id', '==', storeId), where('product_id', 'in', ids)));
      s.docs.forEach((d) => out.set(String(d.get('variant_id')), { stock: num(d.get('stock')), price: d.get('price') ?? null, sale_price: d.get('sale_price') ?? null }));
    }),
  );
  return out;
}

export function toProduct(id: string, p: Raw, opts: { lang: string; stocks?: Map<string, StockRec> | null; attrs?: AttrIndex | null; favs?: Set<string> | null; minutes?: number | null }): Product {
  const variants: Variant[] = (Array.isArray(p.variants) ? p.variants : [])
    .filter((v: Raw) => isOn(v.status))
    .map((v: Raw) => {
      const pr = pricingFor(v, opts.stocks?.get(String(v.id)) ?? null);
      const ids: string[] = Array.isArray(v.attribute_value_ids) ? v.attribute_value_ids.map(String) : [];
      let attributes: AttributeValue[] = ids.map((x) => opts.attrs?.byId.get(x)).filter(Boolean) as AttributeValue[];
      if (!attributes.length && v.attrs && typeof v.attrs === 'object') {
        attributes = Object.entries(v.attrs as Record<string, string>).map(([k, val]) => ({
          id: `${k}:${val}`,
          attribute: k.charAt(0).toUpperCase() + k.slice(1),
          value: String(val),
          color_hex: null,
        }));
      }
      return { id: String(v.id), product_id: id, name: v.name ?? '', sku: v.sku, price: pr.price, sale_price: pr.sale_price, stock: pr.stock, image: v.image ?? null, attributes };
    });
  const images: string[] = Array.isArray(p.images) && p.images.length ? p.images : p.thumbnail ? [p.thumbnail] : [];
  return {
    id,
    name: pick(p.name, opts.lang),
    slug: p.slug,
    thumbnail: p.thumbnail ?? images[0] ?? '',
    images,
    category_id: p.sub_category_id || p.category_id,
    brand: p.brand_id ? { id: p.brand_id, name: p.brand_name ?? '', slug: '' } : null,
    short_description: pick(p.short_description, opts.lang),
    is_veg: p.is_veg ?? null,
    rating_avg: num(p.rating_avg),
    rating_count: num(p.rating_count),
    fulfillment_type: p.fulfillment_type ?? 'both',
    delivery_minutes: opts.minutes ?? undefined,
    max_qty_per_order: num(p.max_qty_per_order) || undefined,
    variants,
    is_favorite: opts.favs ? opts.favs.has(id) : false,
    tags: p.tags ?? [],
  };
}

const supports = (ft: string | undefined, mode: Mode) => !ft || ft === 'both' || ft === mode;

/** Converts product docs for the current context (store stock in quick mode, favourites, attributes). */
export async function hydrate(docs: Array<{ id: string; p: Raw }>): Promise<Product[]> {
  const c = ctx();
  const storeId = c.mode === 'quick' ? c.storeId : null;
  const [stocks, attrs, favs] = await Promise.all([
    storeStocks(storeId, docs.map((d) => d.id)),
    attributeIndex(c.lang).catch(() => null),
    favoriteIds().catch(() => null),
  ]);
  return docs.map((d) => toProduct(d.id, d.p, { lang: c.lang, stocks, attrs, favs, minutes: c.mode === 'quick' ? c.deliveryMinutes : 2880 }));
}

const SORT_FIELD: Record<string, [string, 'asc' | 'desc']> = {
  '': ['sold_count', 'desc'],
  popular: ['sold_count', 'desc'],
  price_asc: ['min_price', 'asc'],
  price_desc: ['min_price', 'desc'],
  newest: ['created_at', 'desc'],
  rating: ['rating_avg', 'desc'],
  discount: ['max_discount_percent', 'desc'],
};

/** Upper bound of documents scanned per listing query (client-side filtering/pagination window). */
const WINDOW = 300;

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .normalize('NFKC')
    .replace(/['’‘`´]/gu, '') // same as backend keywordWords(): "Lay's" → "lays"
    .split(/[\s,./()\-_+&|:;"!?#@]+/u)
    .filter((t) => t.length >= 2)
    .map((t) => t.slice(0, 15));
}

function matchesTerms(p: Raw, ts: string[]): boolean {
  const kw: string[] = Array.isArray(p.search_keywords) ? p.search_keywords : [];
  return ts.every((t) => kw.includes(t));
}

const priceOf = (p: Product) => {
  const v = p.variants.find((x) => x.stock > 0) ?? p.variants[0];
  return v ? v.sale_price ?? v.price : 0;
};

export async function products(f: ProductFilters = {}): Promise<Paginated<Product>> {
  const c = ctx();
  const ts = terms(f.q || '');
  const [sortField, dir] = SORT_FIELD[f.sort || ''] ?? SORT_FIELD[''];
  const cs: QueryConstraint[] = [];
  let primary: 'search' | 'category' | 'store' | 'none' = 'none';
  if (ts.length) {
    cs.push(where('search_keywords', 'array-contains', ts[0]));
    primary = 'search';
  } else if (f.category_id) {
    cs.push(where('category_ids', 'array-contains', String(f.category_id)));
    primary = 'category';
  } else if (c.mode === 'quick' && c.storeId) {
    cs.push(where('in_stock_store_ids', 'array-contains', c.storeId));
    primary = 'store';
  }
  cs.push(where('status', '==', 'active'), orderBy(sortField, dir), limit(WINDOW));
  const snap = await guard(() => getDocs(query(collection(db(), 'products'), ...cs)));

  const brandIds = (Array.isArray(f.brand_id) ? f.brand_id : f.brand_id ? String(f.brand_id).split(',') : []).map(String).filter(Boolean);
  const raw = snap.docs
    .map((d) => ({ id: d.id, p: d.data() }))
    .filter(({ p }) => supports(p.fulfillment_type, c.mode))
    .filter(({ p }) => primary === 'store' || c.mode !== 'quick' || !c.storeId || !Array.isArray(p.in_stock_store_ids) || p.in_stock_store_ids.includes(c.storeId))
    .filter(({ p }) => primary === 'category' || !f.category_id || (p.category_ids ?? []).map(String).includes(String(f.category_id)))
    .filter(({ p }) => ts.length <= 1 || matchesTerms(p, ts.slice(1)))
    .filter(({ p }) => !brandIds.length || brandIds.includes(String(p.brand_id)));

  let list = await hydrate(raw);
  const min = f.min_price ? Number(f.min_price) : null;
  const max = f.max_price ? Number(f.max_price) : null;
  if (min !== null || max !== null) list = list.filter((p) => (min === null || priceOf(p) >= min) && (max === null || priceOf(p) <= max));
  const attrs = Object.entries(f.attributes || {}).filter(([, v]) => v.length);
  if (attrs.length) {
    list = list.filter((p) =>
      attrs.every(([key, vals]) => p.variants.some((v) => (v.attributes || []).some((a) => a.attribute.toLowerCase() === key && vals.includes(a.value)) || vals.some((val) => v.name === val))),
    );
  }
  // store prices can differ from the central min_price — re-sort price sorts on the effective price
  if (f.sort === 'price_asc') list.sort((a, b) => priceOf(a) - priceOf(b));
  if (f.sort === 'price_desc') list.sort((a, b) => priceOf(b) - priceOf(a));

  const per = f.per_page || 20;
  const pageNo = Math.max(1, f.page || 1);
  const total = list.length;
  return {
    items: list.slice((pageNo - 1) * per, pageNo * per),
    meta: { current_page: pageNo, last_page: Math.max(1, Math.ceil(total / per)), per_page: per, total },
  };
}

export async function productFacets(): Promise<ProductFacets> {
  const { lang } = ctx();
  const [attrs, bs] = await Promise.all([attributeIndex(lang).catch(() => null), brands()]);
  return { price: null, brands: bs, attributes: attrs?.facets ?? [] };
}

async function productDoc(slugOrId: string): Promise<{ id: string; p: Raw } | null> {
  const s = await guard(() => getDocs(query(collection(db(), 'products'), where('slug', '==', slugOrId), where('status', '==', 'active'), limit(1))));
  if (!s.empty) return { id: s.docs[0].id, p: s.docs[0].data() };
  try {
    const d = await getDoc(doc(db(), 'products', slugOrId));
    return d.exists() && d.get('status') === 'active' ? { id: d.id, p: d.data() } : null;
  } catch {
    return null; // inactive / missing → permission-denied
  }
}

/** Active products by id (rules: inactive products are not readable — they are skipped). */
export async function productsByIds(ids: string[]): Promise<Array<{ id: string; p: Raw }>> {
  const uniq = [...new Set(ids.map(String).filter(Boolean))];
  const out: Array<{ id: string; p: Raw }> = [];
  await Promise.all(
    chunk(uniq, 30).map(async (part) => {
      const s = await guard(() => getDocs(query(collection(db(), 'products'), where(documentId(), 'in', part), where('status', '==', 'active'))));
      s.docs.forEach((d) => out.push({ id: d.id, p: d.data() }));
    }),
  );
  return uniq.map((id) => out.find((o) => o.id === id)).filter(Boolean) as Array<{ id: string; p: Raw }>;
}

export function toReview(id: string, r: Raw): Review {
  return { id, user: { name: r.user_name || 'Customer', avatar: r.user_avatar ?? null }, rating: num(r.rating), comment: r.comment ?? '', images: r.images ?? [], created_at: iso(r.created_at) };
}

export async function product(slug: string): Promise<ProductDetail> {
  const c = ctx();
  const found = await productDoc(slug);
  if (!found) throw new ApiError('Product not found', 404);
  const { id, p } = found;
  const visible = (x: { p: Raw }) => supports(x.p.fulfillment_type, c.mode);
  const [base] = await hydrate([found]);
  const [reviewsSnap, cross, up, similarSnap, cats, store] = await Promise.all([
    guard(() => getDocs(query(collection(db(), 'reviews'), where('product_id', '==', id), where('status', '==', 'active'), orderBy('created_at', 'desc'), limit(50)))),
    productsByIds(p.cross_sell_ids ?? []),
    productsByIds(p.up_sell_ids ?? []),
    guard(() =>
      getDocs(query(collection(db(), 'products'), where('category_ids', 'array-contains', String(p.sub_category_id || p.category_id)), where('status', '==', 'active'), orderBy('sold_count', 'desc'), limit(13))),
    ),
    allCategories(),
    p.store_id ? getDoc(doc(db(), 'stores', String(p.store_id))).catch(() => null) : Promise.resolve(null),
  ]);
  const similarDocs = similarSnap.docs.filter((d) => d.id !== id).map((d) => ({ id: d.id, p: d.data() })).filter(visible).slice(0, 12);
  const [crossP, upP, similarP] = await Promise.all([hydrate(cross.filter(visible)), hydrate(up.filter(visible)), hydrate(similarDocs)]);
  const reviews = reviewsSnap.docs.map((d) => toReview(d.id, d.data()));
  const breakdown: ProductDetail['rating_breakdown'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  reviews.forEach((r) => {
    const k = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as keyof typeof breakdown;
    breakdown[k]++;
  });
  const cat = cats.find((x) => x.id === String(p.sub_category_id || p.category_id));
  return {
    ...base,
    category: cat ? { id: cat.id, name: pick(cat.c.name, c.lang), slug: cat.c.slug } : undefined,
    description: pick(p.description, c.lang),
    return_allowed: !!p.return_allowed,
    return_days: num(p.return_days),
    cancelable: p.cancelable !== false,
    cod_allowed: p.cod_allowed !== false,
    seo_title: pick(p.seo?.title, c.lang) || undefined,
    seo_description: pick(p.seo?.description, c.lang) || undefined,
    rating_breakdown: breakdown,
    reviews,
    similar: similarP,
    cross_sell: crossP,
    up_sell: upP,
    store: store?.exists() ? { id: store.id, name: store.get('name'), slug: store.get('slug') ?? '', lat: store.get('lat'), lng: store.get('lng') } : null,
    manufacturer: p.brand_name ?? undefined,
  };
}

/* ------------------------------------------------------------------ search */

export async function suggestions(q: string): Promise<SearchSuggestions> {
  const c = ctx();
  const ts = terms(q);
  if (!ts.length) return { products: [], categories: [] };
  const [snap, cats] = await Promise.all([
    guard(() => getDocs(query(collection(db(), 'products'), where('search_keywords', 'array-contains', ts[0]), where('status', '==', 'active'), orderBy('sold_count', 'desc'), limit(30)))),
    allCategories(),
  ]);
  const products = snap.docs
    .map((d) => ({ id: d.id, p: d.data() }))
    .filter(({ p }) => supports(p.fulfillment_type, c.mode) && matchesTerms(p, ts.slice(1)))
    .slice(0, 6)
    .map(({ id, p }) => ({ id, name: pick(p.name, c.lang), slug: p.slug, thumbnail: p.thumbnail ?? p.images?.[0] ?? '' }));
  const lower = q.trim().toLowerCase();
  const categories = cats
    .filter((r) => modeOk(r.c, c.mode) && Object.values((r.c.name ?? {}) as Record<string, string>).some((n) => String(n).toLowerCase().includes(lower)))
    .slice(0, 4)
    .map((r) => ({ id: r.id, name: pick(r.c.name, c.lang), slug: r.c.slug }));
  return { products, categories };
}

export async function trending(): Promise<string[]> {
  const s = await publicSettings();
  const hints = Array.isArray(s.home_search_hints) ? s.home_search_hints.filter(Boolean) : [];
  if (hints.length) return hints.slice(0, 8);
  const c = ctx();
  return cached(`trending/${c.mode}/${c.lang}`, TEN_MIN, async () => {
    const snap = await guard(() => getDocs(query(collection(db(), 'products'), where('status', '==', 'active'), orderBy('sold_count', 'desc'), limit(20))));
    return snap.docs
      .filter((d) => supports(d.get('fulfillment_type'), c.mode))
      .slice(0, 8)
      .map((d) => pick(d.get('name'), c.lang));
  });
}

/* ------------------------------------------------------------------ home */

export async function home(categoryId?: Id | null): Promise<HomeData> {
  const c = ctx();
  const h = await call<Raw>('getHome', { zone_id: c.zoneId ?? undefined, mode: c.mode, category_id: categoryId ? String(categoryId) : undefined, lang: c.lang });
  const favs = await favoriteIds().catch(() => null);
  const normCat = (x: Raw): Category => ({ ...x, products_count: x.products_count ?? x.product_count, children: x.children });
  return {
    header: h.header,
    categories: (h.categories ?? []).map(normCat),
    sections: (h.sections ?? []).map((s: Raw, si: number) => {
      const settings = { ...(s.settings || {}) };
      let items: Raw[] = Array.isArray(s.items) ? s.items : [];
      let subtitle: string | undefined;
      switch (s.type) {
        case 'product_slider':
          items = items.map((p) => ({
            ...p,
            thumbnail: p.thumbnail ?? p.images?.[0] ?? '',
            images: p.images ?? [],
            short_description: p.short_description ?? '',
            is_favorite: favs ? favs.has(String(p.id)) : false,
            variants: (p.variants ?? []).map((v: Raw) => ({ ...v, product_id: p.id, sale_price: v.sale_price ?? null })),
          }));
          if (!settings.category_slug && settings.category_id) settings.category_slug = String(settings.category_id);
          break;
        case 'grid_banner':
        case 'title_image':
        case 'banner_slider':
          items = items.map((b, i) => ({ ...b, id: b.id ?? `${si}-${i}`, title: b.title || undefined, subtitle: b.subtitle || undefined }));
          break;
        case 'category_section':
          items = items.map(normCat);
          break;
        case 'heading_text':
          subtitle = settings.subtitle ?? undefined;
          break;
      }
      return { id: String(s.id ?? si), type: s.type, title: s.title ?? (s.type === 'heading_text' ? settings.text : undefined) ?? undefined, subtitle, settings, items };
    }),
  };
}
