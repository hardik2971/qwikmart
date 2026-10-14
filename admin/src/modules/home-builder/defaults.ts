// Home builder section contract — mirrors backend HomeLayout::SECTION_TYPES / SECTION_DEFAULTS and
// HomeBuilderController::normalizeSettings (functions/src/services/home.ts uses the same keys).
import { Award, GalleryHorizontal, Grid2x2, Heading, Image as ImageIcon, LayoutGrid, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { HomeSection, SectionType, Trans } from '@/lib/types';

export const SECTION_TYPES: Record<SectionType, string> = {
  banner_slider: 'Banner Slider',
  category_section: 'Category Section',
  product_slider: 'Product Slider',
  top_brands: 'Top Brands',
  grid_banner: 'Grid Banner',
  title_image: 'Title Image',
  heading_text: 'Heading Text',
};
export const TYPE_KEYS = Object.keys(SECTION_TYPES) as SectionType[];

export const SECTION_ICONS: Record<SectionType, LucideIcon> = {
  banner_slider: GalleryHorizontal, category_section: LayoutGrid, product_slider: ShoppingBag,
  top_brands: Award, grid_banner: Grid2x2, title_image: ImageIcon, heading_text: Heading,
};

export const SECTION_DEFAULTS: Record<SectionType, Record<string, any>> = {
  banner_slider: { banner_ids: [], images: [], autoplay: true, height: 180 },
  category_section: { category_ids: [], columns: 4, style: 'grid' },
  product_slider: { source: 'featured', category_id: null, product_ids: [], limit: 10 },
  top_brands: { brand_ids: [] },
  grid_banner: { images: [], columns: 2 },
  title_image: { image: null, link_type: 'none', link_value: null },
  heading_text: { text: '', subtitle: '', align: 'left', color: '#111827' },
};

export const PRODUCT_SOURCES = [
  { value: 'featured', label: 'Featured' }, { value: 'category', label: 'By category' }, { value: 'manual', label: 'Manual selection' },
  { value: 'newest', label: 'Latest' }, { value: 'discount', label: 'On discount' },
];
export const LINK_TYPES = ['none', 'product', 'category', 'url'] as const;

export interface LinkImage { image: string | null; link_type: 'none' | 'product' | 'category' | 'url'; link_value: string | null }
export interface Section extends HomeSection { sort?: number }
export interface Header { bg_type: 'color' | 'image'; bg_value: string; text_color: string }

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o ?? null));
export const rid = () => 's_' + Math.random().toString(36).slice(2, 12);
const clamp = (v: any, lo: number, hi: number, def: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : def; };
const idList = (v: any): string[] => [...new Set((Array.isArray(v) ? v : []).map((x) => (x == null ? '' : String(x))).filter(Boolean))];
const linkType = (v: any): LinkImage['link_type'] => ((LINK_TYPES as readonly string[]).includes(v) ? v : 'none');

export function normImages(v: any): LinkImage[] {
  return (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object').map((x) => ({
    image: x.image ? String(x.image) : null,
    link_type: linkType(x.link_type),
    link_value: x.link_value !== undefined && x.link_value !== null && x.link_value !== '' ? String(x.link_value) : null,
  }));
}

/** Merge with defaults and coerce every known key (HomeBuilderController::normalizeSettings). */
export function normalizeSettings(type: SectionType, input: Record<string, any> | null | undefined): Record<string, any> {
  const inp = input || {};
  const out: Record<string, any> = clone(SECTION_DEFAULTS[type] || {});
  if (type === 'category_section') out.parent_id = null;
  for (const key of Object.keys(out)) {
    if (!(key in inp)) continue;
    const v = inp[key];
    if (key.endsWith('_ids')) out[key] = idList(v);
    else if (key === 'images') out[key] = normImages(v);
    else if (key === 'autoplay') out[key] = v === true || v === 'true' || v === 1 || v === '1';
    else if (key === 'height') out[key] = clamp(v, 60, 500, 180);
    else if (key === 'columns') out[key] = clamp(v, 1, 6, type === 'category_section' ? 4 : 2);
    else if (key === 'limit') out[key] = clamp(v, 1, 30, 10);
    else if (key === 'style') out[key] = v === 'scroll' ? 'scroll' : 'grid';
    else if (key === 'source') out[key] = PRODUCT_SOURCES.some((s) => s.value === v) ? v : 'featured';
    else if (key === 'align') out[key] = ['left', 'center', 'right'].includes(v) ? v : 'left';
    else if (key === 'link_type') out[key] = linkType(v);
    else if (key === 'category_id' || key === 'parent_id') out[key] = v ? String(v) : null;
    else out[key] = v === null || v === undefined ? null : typeof v === 'object' ? out[key] : String(v);
  }
  return out;
}

export function toTrans(t: any): Trans {
  if (!t) return {};
  if (typeof t === 'string') return { en: t };
  if (typeof t === 'object') return { ...t };
  return {};
}

/** Section as loaded from Firestore → editor state. */
export function loadSection(raw: any): Section | null {
  if (!raw || !TYPE_KEYS.includes(raw.type)) return null;
  return { id: raw.id ? String(raw.id) : rid(), type: raw.type, title: toTrans(raw.title), is_active: raw.is_active !== false, settings: normalizeSettings(raw.type, raw.settings) };
}

export function loadSections(list: any): Section[] {
  const arr = (Array.isArray(list) ? list : []).map((s, i) => ({ s, i })).sort((a, b) => Number(a.s?.sort ?? a.i) - Number(b.s?.sort ?? b.i));
  return arr.map(({ s }) => loadSection(s)).filter(Boolean) as Section[];
}

/** Editor state → payload stored in draft_sections. */
export function payload(sections: Section[]): Section[] {
  return sections.map((s, i) => ({
    id: s.id, type: s.type, title: toTrans(s.title), is_active: !!s.is_active, sort: i + 1, settings: normalizeSettings(s.type, s.settings),
  }));
}

export function newSection(type: SectionType): Section {
  return { id: rid(), type, title: { en: SECTION_TYPES[type] }, is_active: true, settings: clone(SECTION_DEFAULTS[type]) };
}

export const DEFAULT_HEADER: Header = { bg_type: 'color', bg_value: '#FFF4C7', text_color: '#111827' };
export const hex = (v: any, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback);

/** "Title #n" (n = position among sections of the same type) — HomeBuilder label(). */
export function sectionLabel(s: Section, all: Section[], lang = 'en'): string {
  const n = all.filter((x) => x.type === s.type).indexOf(s) + 1;
  const t = typeof s.title === 'string' ? s.title : s.title?.[lang] || s.title?.en || '';
  return `${t || SECTION_TYPES[s.type]} #${n}`;
}
