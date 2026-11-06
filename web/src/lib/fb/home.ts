/**
 * getHome payload → HomeData. Pure (no Firebase SDK) so the server can prerender the default home page
 * (src/app/page.tsx) with the same shape the browser builds in catalog.home().
 */
import type { Category, HomeData } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export function toHomeData(h: Raw, favs: Set<string> | null): HomeData {
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

/**
 * Server-side fetch of the default home page (quick mode, English, no zone) through the callable's HTTP protocol.
 * Returns null on any failure: the browser then loads it as before.
 */
export async function fetchDefaultHome(): Promise<HomeData | null> {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project || process.env.NEXT_PUBLIC_USE_MOCK === 'true' || process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') return null;
  try {
    const res = await fetch(`https://asia-south1-${project}.cloudfunctions.net/getHome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { mode: 'quick', lang: 'en' } }),
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn('[home] getHome HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { result?: Raw };
    return json.result ? toHomeData(json.result, null) : null;
  } catch (e) {
    console.warn('[home] getHome failed', e);
    return null;
  }
}
