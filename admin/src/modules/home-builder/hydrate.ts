'use client';
// Preview hydration for the home builder.
//  1. previewHomeSections callable (same hydration as getHome — exactly what the app shows);
//  2. client-side fallback straight from Firestore when the callable fails / isn't deployed.
import { fetchByIds, fetchList, limit, orderBy, where } from '@/lib/firestore';
import { previewHomeSections } from '@/lib/callables';
import { imgUrl, money, tr } from '@/lib/format';
import type { Banner, Brand, Category, Mode, Product } from '@/lib/types';
import { normalizeSettings, payload, type Section } from './defaults';

export interface PItem { id?: string; name?: string; image?: string | null; unit?: string | null; price?: string | null; mrp?: string | null; link_type?: string; link_value?: string | null }

const moneyShort = (n: any) => money(n).replace(/\.00$/, '');
const modeOk = (c: Category, mode: Mode) => (mode === 'quick' ? c.show_in_quick !== false : c.show_in_ecommerce !== false);
const active = (s: any) => s === 'active' || s === true;

function mapServer(type: string, items: any[]): PItem[] {
  return (items || []).map((i: any) => {
    switch (type) {
      case 'product_slider': {
        const v = i.default_variant || {};
        const price = Number(v.price ?? 0); const fin = Number(v.final_price ?? price);
        return { id: i.id, name: i.name, image: imgUrl(i.thumbnail), unit: v.name ?? null, price: moneyShort(fin), mrp: fin < price ? moneyShort(price) : null };
      }
      case 'category_section': return { id: i.id, name: i.name, image: imgUrl(i.icon || i.image, i.name) };
      case 'top_brands': return { id: i.id, name: i.name, image: imgUrl(i.logo, i.name) };
      default: return { id: i.id, name: i.title ?? i.name, image: imgUrl(i.image), link_type: i.link_type, link_value: i.link_value };
    }
  });
}

/** One previewHomeSections call for several sections → items per section id. */
export async function serverItemsBatch(zoneId: string, mode: Mode, list: Section[], lang: string): Promise<Record<string, PItem[]>> {
  const res = await previewHomeSections({ zone_id: zoneId, mode, sections: payload(list.map((s) => ({ ...s, is_active: true }))), lang });
  const out: Record<string, PItem[]> = {};
  for (const s of list) {
    const hit = (res?.sections || []).find((x: any) => x.id === s.id);
    out[s.id] = hit ? mapServer(s.type, hit.items || []) : [];
  }
  return out;
}

export async function serverItems(zoneId: string, mode: Mode, s: Section, lang: string): Promise<PItem[]> {
  const [sec] = payload([{ ...s, is_active: true }]);
  const res = await previewHomeSections({ zone_id: zoneId, mode, sections: [sec], lang });
  const hit = (res?.sections || []).find((x: any) => x.id === s.id) || (res?.sections || [])[0];
  return hit ? mapServer(s.type, hit.items || []) : [];
}

function productCard(p: Product, lang: string): PItem {
  const vs = (p.variants || []).filter((v) => !v.status || v.status === 'active');
  const v = vs.find((x) => Number(x.stock) > 0) || vs[0];
  const price = Number(v?.price ?? p.min_price ?? 0);
  const sale = v?.sale_price != null && v.sale_price > 0 && v.sale_price < price ? v.sale_price : null;
  return { id: p.id, name: tr(p.name, lang), image: imgUrl(p.thumbnail || p.images?.[0], tr(p.name, lang)), unit: v?.name ?? null, price: moneyShort(sale ?? price), mrp: sale != null ? moneyShort(price) : null };
}

const fits = (p: Product, mode: Mode) => p.status === 'active' && (!p.fulfillment_type || p.fulfillment_type === 'both' || p.fulfillment_type === mode);

async function productsFor(settings: Record<string, any>, mode: Mode, lang: string): Promise<PItem[]> {
  const lim = Math.max(1, Math.min(30, Number(settings.limit) || 10));
  let list: Product[] = [];
  switch (settings.source) {
    case 'manual': {
      const ids: string[] = settings.product_ids || [];
      const got = await fetchByIds<Product>('products', ids.slice(0, 30));
      list = ids.map((id) => got.find((p) => p.id === id)).filter(Boolean) as Product[];
      break;
    }
    case 'category':
      if (!settings.category_id) return [];
      list = await fetchList<Product>('products', where('category_ids', 'array-contains', String(settings.category_id)), where('status', '==', 'active'), limit(lim * 3));
      break;
    case 'discount':
      list = await fetchList<Product>('products', where('status', '==', 'active'), orderBy('max_discount_percent', 'desc'), limit(lim * 3));
      break;
    case 'newest':
      list = await fetchList<Product>('products', where('status', '==', 'active'), orderBy('created_at', 'desc'), limit(lim * 3));
      break;
    default:
      list = await fetchList<Product>('products', where('is_featured', '==', true), where('status', '==', 'active'), limit(lim * 3));
      if (list.length < lim) {
        const more = await fetchList<Product>('products', where('status', '==', 'active'), limit(lim * 3));
        const seen = new Set(list.map((p) => p.id));
        list.push(...more.filter((p) => !seen.has(p.id)));
      }
  }
  return list.filter((p) => fits(p, mode)).slice(0, lim).map((p) => productCard(p, lang));
}

const imgItems = (imgs: any[]): PItem[] => (imgs || []).filter((i) => i?.image).map((i) => ({ image: imgUrl(i.image), link_type: i.link_type, link_value: i.link_value }));

export async function clientItems(s: Section, ctx: { mode: Mode; lang: string; categories: Category[]; brands: Brand[] }): Promise<PItem[]> {
  const st = normalizeSettings(s.type, s.settings);
  const { mode, lang } = ctx;
  switch (s.type) {
    case 'banner_slider': {
      const ids: string[] = st.banner_ids || [];
      const got = ids.length ? await fetchByIds<Banner>('banners', ids) : [];
      const banners = ids.map((id) => got.find((b) => b.id === id)).filter((b): b is Banner => !!b && active(b.status));
      return [...banners.map((b) => ({ id: b.id, name: tr(b.title, lang), image: imgUrl(b.image) })), ...imgItems(st.images)];
    }
    case 'category_section': {
      const ids: string[] = st.category_ids || [];
      const cats = ids.length
        ? ids.map((id) => ctx.categories.find((c) => c.id === id)).filter(Boolean) as Category[]
        : ctx.categories.filter((c) => (c.parent_id || null) === (st.parent_id || null));
      return cats.filter((c) => active(c.status) && modeOk(c, mode)).map((c) => ({ id: c.id, name: tr(c.name, lang), image: imgUrl(c.icon || c.image, tr(c.name, lang)) }));
    }
    case 'product_slider': return productsFor(st, mode, lang);
    case 'top_brands': {
      const ids: string[] = st.brand_ids || [];
      const list = ids.length ? ids.map((id) => ctx.brands.find((b) => b.id === id)).filter(Boolean) as Brand[] : ctx.brands.filter((b) => active(b.status)).slice(0, 10);
      return list.filter((b) => active(b.status)).map((b) => ({ id: b.id, name: b.name, image: imgUrl(b.logo, b.name) }));
    }
    case 'grid_banner': return imgItems(st.images);
    case 'title_image': return st.image ? imgItems([st]) : [];
    default: return [];
  }
}

/** Cache key: type + settings (titles / active flags don't change the items). */
export const itemsKey = (s: Section) => `${s.type}:${JSON.stringify(normalizeSettings(s.type, s.settings))}`;
