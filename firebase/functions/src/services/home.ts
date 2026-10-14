/** Home layout resolution + section hydration (Laravel HomeLayoutService / CatalogService::forSource). */
import { db } from '../shared/firebase';
import type { CategoryDoc, HomeLayoutDoc, HomeSection, Mode, ProductDoc, StoreStockDoc } from '../shared/types';
import { isOn, pick } from '../shared/util';
import { pricingFor, ProductRec, supports } from './cart';
import { deliveryMinutes, getZone, storeFor, ZoneRec } from './zones';

export const SECTION_TYPES = ['banner_slider', 'category_section', 'product_slider', 'top_brands', 'grid_banner', 'title_image', 'heading_text'] as const;

export const SECTION_DEFAULTS: Record<string, Record<string, unknown>> = {
  banner_slider: { banner_ids: [], images: [], autoplay: true, height: 180 },
  category_section: { category_ids: [], columns: 4, style: 'grid' },
  product_slider: { source: 'featured', category_id: null, product_ids: [], limit: 10 },
  top_brands: { brand_ids: [] },
  grid_banner: { images: [], columns: 2 },
  title_image: { image: null, link_type: 'none', link_value: null },
  heading_text: { text: '', subtitle: '', align: 'left', color: '#111827' },
};

export interface HomeCtx { zone: ZoneRec | null; mode: Mode; lang: string; storeId: string | null; deliveryMinutes: number | null }

export async function makeCtx(zoneId: string | null, mode: Mode, lang = 'en'): Promise<HomeCtx> {
  const zone = await getZone(zoneId);
  let storeId: string | null = null;
  if (zone) storeId = zone.default_store_id || (await storeFor(zone.id, mode))?.id || null;
  return { zone, mode, lang, storeId: mode === 'quick' ? storeId : null, deliveryMinutes: zone ? deliveryMinutes(zone, null, mode) : null };
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

function categoryCard(id: string, c: CategoryDoc, lang: string) {
  return {
    id, parent_id: c.parent_id ?? null, name: pick(c.name, lang), slug: c.slug, image: c.image ?? null, icon: c.icon ?? null, banner: c.banner ?? null,
    header_color: c.header_color ?? null, sort_order: Number(c.sort_order ?? 0), show_in_quick: c.show_in_quick !== false, show_in_ecommerce: c.show_in_ecommerce !== false,
  };
}

const modeOk = (c: CategoryDoc, mode: Mode) => (mode === 'quick' ? c.show_in_quick !== false : c.show_in_ecommerce !== false);

export async function rootCategories(mode: Mode, lang: string) {
  const snap = await db.collection('categories').where('parent_id', '==', null).get();
  return snap.docs
    .map((d) => ({ id: d.id, c: d.data() as CategoryDoc }))
    .filter(({ c }) => c.status === 'active' && modeOk(c, mode))
    .sort((a, b) => Number(a.c.sort_order ?? 0) - Number(b.c.sort_order ?? 0))
    .map(({ id, c }) => categoryCard(id, c, lang));
}

export async function productCards(products: ProductRec[], ctx: HomeCtx) {
  const ssMap = new Map<string, StoreStockDoc>();
  if (ctx.storeId) {
    const refs = products.flatMap((p) => (p.variants ?? []).map((v) => db.doc(`store_stocks/${ctx.storeId}_${v.id}`)));
    for (let i = 0; i < refs.length; i += 300) {
      const snaps = await db.getAll(...refs.slice(i, i + 300));
      snaps.forEach((s) => s.exists && ssMap.set(String(s.get('variant_id') ?? s.id.split('_').slice(1).join('_')), s.data() as StoreStockDoc));
    }
  }
  return products.map((p) => {
    const variants = (p.variants ?? []).filter((v) => isOn(v.status)).map((v) => {
      const pr = pricingFor(v, ssMap.get(String(v.id)) ?? null);
      return {
        id: v.id, name: v.name, sku: v.sku ?? null, price: pr.price, sale_price: pr.sale_price, final_price: pr.unit_price,
        discount_percent: pr.discount_percent, stock: pr.stock, in_stock: pr.stock > 0, image: v.image || p.thumbnail || null,
        attribute_value_ids: v.attribute_value_ids ?? [],
      };
    });
    const def = variants.find((v) => v.in_stock) ?? variants[0] ?? null;
    return {
      id: p.id, name: pick(p.name, ctx.lang), slug: p.slug, short_description: pick(p.short_description, ctx.lang), thumbnail: p.thumbnail ?? p.images?.[0] ?? null,
      images: p.images ?? [], brand: p.brand_id ? { id: p.brand_id, name: p.brand_name ?? null } : null, category_id: p.category_id,
      rating_avg: Number(p.rating_avg ?? 0), rating_count: Number(p.rating_count ?? 0), is_veg: p.is_veg ?? null, is_featured: !!p.is_featured,
      product_type: p.product_type, fulfillment_type: p.fulfillment_type, max_qty_per_order: Number(p.max_qty_per_order ?? 0),
      variants, default_variant: def, in_stock: variants.some((v) => v.in_stock), delivery_minutes: ctx.deliveryMinutes,
    };
  });
}

/** Products for a product_slider source (featured|category|manual|newest|discount|popular|top_rated). */
export async function productsForSource(ctx: HomeCtx, settings: Record<string, unknown>): Promise<ProductRec[]> {
  const limit = Math.max(1, Math.min(30, Number(settings.limit ?? 10) || 10));
  const source = String(settings.source ?? 'featured');
  const visible = (p: ProductRec) => p.status === 'active' && supports(p.fulfillment_type, ctx.mode)
    && (!ctx.storeId || (p.in_stock_store_ids ?? []).includes(ctx.storeId) || !p.in_stock_store_ids);
  const products = db.collection('products');
  let docs: ProductRec[] = [];
  const run = async (q: FirebaseFirestore.Query) => (await q.limit(limit * 3).get()).docs.map((d) => ({ id: d.id, ...(d.data() as ProductDoc) }));
  switch (source) {
    case 'manual': {
      const list = ids(settings.product_ids);
      if (!list.length) return [];
      const snaps = await db.getAll(...list.slice(0, 30).map((id) => products.doc(id)));
      docs = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...(s.data() as ProductDoc) }));
      break;
    }
    case 'category':
      if (!settings.category_id) return [];
      docs = await run(products.where('category_ids', 'array-contains', String(settings.category_id)).where('status', '==', 'active').orderBy('sold_count', 'desc'));
      break;
    case 'discount':
      docs = await run(products.where('status', '==', 'active').orderBy('max_discount_percent', 'desc'));
      break;
    case 'newest':
      docs = await run(products.where('status', '==', 'active').orderBy('created_at', 'desc'));
      break;
    case 'popular':
      docs = await run(products.where('status', '==', 'active').orderBy('sold_count', 'desc'));
      break;
    case 'top_rated':
      docs = await run(products.where('status', '==', 'active').orderBy('rating_avg', 'desc'));
      break;
    default: {
      docs = await run(products.where('status', '==', 'active').where('is_featured', '==', true).orderBy('rating_avg', 'desc'));
      if (docs.length < limit) {
        const more = await run(products.where('status', '==', 'active').orderBy('rating_avg', 'desc'));
        const seen = new Set(docs.map((d) => d.id));
        docs.push(...more.filter((d) => !seen.has(d.id)));
      }
    }
  }
  return docs.filter(visible).slice(0, limit);
}

function images(list: unknown) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && typeof i === 'object' && (i as Record<string, unknown>).image)
    .map((i) => {
      const r = i as Record<string, unknown>;
      return { image: r.image, title: r.title ?? null, link_type: r.link_type ?? 'none', link_value: r.link_value ?? null };
    });
}

export async function hydrateSections(sections: HomeSection[], ctx: HomeCtx) {
  const active = [...(sections ?? [])].filter((s) => s && s.is_active !== false).sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const out: unknown[] = [];
  for (const s of active) {
    const settings = { ...(SECTION_DEFAULTS[s.type] ?? {}), ...(s.settings ?? {}) } as Record<string, unknown>;
    let items: unknown[] = [];
    switch (s.type) {
      case 'banner_slider': {
        const bid = ids(settings.banner_ids);
        if (bid.length) {
          const snaps = await db.getAll(...bid.map((id) => db.doc(`banners/${id}`)));
          items = snaps.filter((b) => b.exists && b.get('status') === 'active').map((b) => ({
            id: b.id, title: pick(b.get('title'), ctx.lang), subtitle: pick(b.get('subtitle'), ctx.lang), image: b.get('image') ?? null,
            link_type: b.get('link_type') ?? 'none', link_value: b.get('link_value') ?? null,
          }));
        }
        items.push(...images(settings.images));
        break;
      }
      case 'category_section': {
        const cid = ids(settings.category_ids);
        let cats: { id: string; c: CategoryDoc }[];
        if (cid.length) {
          const snaps = await db.getAll(...cid.map((id) => db.doc(`categories/${id}`)));
          cats = snaps.filter((x) => x.exists).map((x) => ({ id: x.id, c: x.data() as CategoryDoc }));
        } else {
          const parent = settings.parent_id ? String(settings.parent_id) : null;
          const snap = await db.collection('categories').where('parent_id', '==', parent).get();
          cats = snap.docs.map((d) => ({ id: d.id, c: d.data() as CategoryDoc })).sort((a, b) => Number(a.c.sort_order ?? 0) - Number(b.c.sort_order ?? 0));
        }
        items = cats.filter(({ c }) => c.status === 'active' && modeOk(c, ctx.mode)).map(({ id, c }) => categoryCard(id, c, ctx.lang));
        break;
      }
      case 'product_slider':
        items = await productCards(await productsForSource(ctx, settings), ctx);
        break;
      case 'top_brands': {
        const bid = ids(settings.brand_ids);
        const docs = bid.length
          ? (await db.getAll(...bid.map((id) => db.doc(`brands/${id}`)))).filter((b) => b.exists)
          : (await db.collection('brands').where('status', '==', 'active').limit(10).get()).docs;
        items = docs.filter((b) => b.get('status') === 'active').map((b) => ({ id: b.id, name: pick(b.get('name'), ctx.lang), slug: b.get('slug') ?? null, logo: b.get('logo') ?? null }));
        break;
      }
      case 'grid_banner':
        items = images(settings.images);
        break;
      case 'title_image':
        items = settings.image ? images([settings]) : [];
        break;
      default:
        items = [];
    }
    if (s.type !== 'heading_text' && !items.length) continue;
    out.push({ id: s.id ?? null, type: s.type, title: s.title ? pick(s.title as never, ctx.lang) : null, settings, items });
  }
  return out;
}

function fallbackSections(ctx: HomeCtx, categoryId: string | null, bannerIds: string[]): HomeSection[] {
  const mk = (type: HomeSection['type'], title: string | null, settings: Record<string, unknown>, sort: number): HomeSection =>
    ({ id: `auto-${sort}`, type, title, is_active: true, sort, settings });
  if (categoryId) {
    return [mk('category_section', 'Shop by Category', { parent_id: categoryId }, 1), mk('product_slider', 'Bestsellers', { source: 'category', category_id: categoryId, limit: 12 }, 2)];
  }
  return [
    mk('banner_slider', null, { banner_ids: bannerIds }, 1),
    mk('category_section', 'Shop by Category', {}, 2),
    mk('product_slider', 'Featured', { source: 'featured', limit: 12 }, 3),
    mk('product_slider', 'Best Deals', { source: 'discount', limit: 12 }, 4),
    mk('top_brands', 'Top Brands', {}, 5),
  ];
}

export async function resolveHome(zoneId: string | null, mode: Mode, categoryId: string | null, lang: string) {
  const ctx = await makeCtx(zoneId, mode, lang);
  const layoutSnap = ctx.zone ? await db.doc(`home_layouts/${ctx.zone.id}_${mode}_${categoryId ?? 'all'}`).get() : null;
  const layout = layoutSnap?.exists && layoutSnap.get('is_published') ? (layoutSnap.data() as HomeLayoutDoc) : null;
  const category = categoryId ? await db.doc(`categories/${categoryId}`).get() : null;
  let sections: HomeSection[];
  if (layout) sections = layout.published_sections ?? [];
  else {
    let bannerIds: string[] = [];
    if (!categoryId) {
      const bs = await db.collection('banners').where('status', '==', 'active').get();
      bannerIds = bs.docs
        .filter((b) => (!b.get('zone_id') || b.get('zone_id') === ctx.zone?.id) && (!b.get('mode') || b.get('mode') === 'both' || b.get('mode') === mode))
        .sort((a, b) => Number(a.get('sort_order') ?? 0) - Number(b.get('sort_order') ?? 0)).map((b) => b.id);
    }
    sections = fallbackSections(ctx, categoryId, bannerIds);
  }
  const defaultBg = mode === 'ecommerce' ? '#FDE2D6' : '#EBEC8D';
  return {
    layout_id: layout ? layoutSnap!.id : null,
    zone_id: ctx.zone?.id ?? null,
    mode,
    header: {
      bg_type: layout?.header?.bg_type ?? 'color',
      bg_value: layout?.header?.bg_value ?? (category?.get('header_color') as string | undefined) ?? defaultBg,
      text_color: layout?.header?.text_color ?? '#111827',
    },
    categories: await rootCategories(mode, lang),
    sections: await hydrateSections(sections, ctx),
  };
}
