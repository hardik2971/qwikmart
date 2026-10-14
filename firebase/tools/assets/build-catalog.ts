/**
 * Builds QwikMart's catalog images from free stock photos (Unsplash License) + generated artwork, and writes
 * `manifest.json` (MySQL id/slug -> file) and `CREDITS.md`.
 *
 *   npx tsx assets/build-catalog.ts            # build everything (downloads missing source photos into assets/.raw)
 *   npx tsx assets/build-catalog.ts --only=banners,brands
 *
 * Inputs:  assets/sources.json (photo picks: source page + images.unsplash.com URL per key), MySQL (read only: ids/names).
 * Outputs: assets/catalog/{products,categories,banners,blogs,stores,brands,promos}/*.webp, assets/ui/*.webp,
 *          assets/manifest.json, assets/CREDITS.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openMysql, rows } from '../lib/common.js';
import { BRAND, composeBanner, esc, fitSize, isWhiteBackground, measure, preparePhoto, textPath, webpUnder, type BannerSpec, type PhotoOpts } from './lib/compose.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, '.raw');
const OUT = path.join(HERE, 'catalog');
const UI = path.join(HERE, 'ui');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
const want = (s: string) => !ONLY || ONLY.has(s);

interface Source { file?: string; image_url: string; source_page: string; license?: string; note?: string; alt_image_url?: string; alt_source_page?: string; [k: string]: unknown }
type Sources = Record<'products' | 'categories' | 'hero', Record<string, Source>>;
const sources: Sources = JSON.parse(readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const credits = new Map<string, { source_page: string; image_url: string; used_for: Set<string> }>();

async function rawFile(group: keyof Sources, key: string, alt = false): Promise<string> {
  const s = sources[group][key];
  if (!s) throw new Error(`sources.json: missing ${group}.${key}`);
  const url = alt ? s.alt_image_url : s.image_url;
  if (!url) throw new Error(`sources.json: ${group}.${key} has no ${alt ? 'alt_' : ''}image_url`);
  const f = path.join(RAW, group, `${key}${alt ? '-2' : ''}.jpg`);
  if (!existsSync(f)) {
    mkdirSync(path.dirname(f), { recursive: true });
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}w=2000&q=85&fm=jpg`);
    if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return f;
}
function credit(group: keyof Sources, key: string, usedFor: string, alt = false) {
  const s = sources[group][key];
  const page = alt ? s.alt_source_page! : s.source_page;
  const url = alt ? s.alt_image_url! : s.image_url;
  const c = credits.get(page) ?? { source_page: page, image_url: url.split('?')[0], used_for: new Set<string>() };
  c.used_for.add(usedFor);
  credits.set(page, c);
}
async function photo(group: keyof Sources, key: string, usedFor: string, alt = false) {
  credit(group, key, usedFor, alt);
  return rawFile(group, key, alt);
}
function save(rel: string, buf: Buffer) {
  const f = path.join(HERE, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, buf);
  return rel.replace(/\\/g, '/');
}
const rel = (...p: string[]) => path.posix.join(...p);
const enName = (v: unknown) => {
  if (v && typeof v === 'object') return String((v as Record<string, string>).en ?? Object.values(v)[0] ?? '');
  try {
    const o = JSON.parse(String(v));
    return typeof o === 'object' && o ? String(o.en ?? Object.values(o)[0] ?? '') : String(v);
  } catch {
    return String(v ?? '');
  }
};

// ------------------------------------------------------------------------------------------- square product/category images
/** Square image: white-background photos are trimmed + padded on `bg` (white disappears via color-to-alpha); others are cover-cropped. */
async function square(file: string, size: number, o: { bg?: string; padding?: number; crop?: PhotoOpts['crop']; forceCover?: boolean } = {}) {
  const white = !o.forceCover && (await isWhiteBackground(file));
  if (white) {
    const inner = Math.round(size * (1 - 2 * (o.padding ?? 0.09)));
    const cut = await preparePhoto(file, inner, inner, { mode: 'cutout', crop: o.crop, feather: 0 });
    return sharp({ create: { width: size, height: size, channels: 4, background: o.bg ?? '#ffffff' } })
      .composite([{ input: cut, gravity: 'centre' }])
      .flatten({ background: o.bg ?? '#ffffff' })
      .png()
      .toBuffer();
  }
  let img = sharp(file).rotate();
  if (o.crop) {
    const m = await img.metadata();
    img = img.extract({ left: Math.round(o.crop[0] * m.width!), top: Math.round(o.crop[1] * m.height!), width: Math.round(o.crop[2] * m.width!), height: Math.round(o.crop[3] * m.height!) });
  }
  return img.resize(size, size, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
}

// ------------------------------------------------------------------------------------------- configs
/** Overrides per photo key (crop/padding) — filled in after visual review. */
const PHOTO_TWEAKS: Record<string, { crop?: PhotoOpts['crop']; padding?: number; forceCover?: boolean }> = {};

const CATEGORY_TINT = '#EEF7F0';

type Hero = { key: string; x: number; y: number; w: number; h: number; align?: string; strength?: number; mode?: 'cutout' | 'card'; crop?: PhotoOpts['crop'] };
interface BannerDef {
  out: string;
  usedFor: string;
  size: [number, number];
  bg: BannerSpec['bg'];
  accent?: string;
  tag?: string;
  line1: string;
  line2?: string;
  subtitle?: string;
  cta?: string;
  badge?: [string, string, string];
  heroes: Hero[];
  compact?: boolean;
  textWidth?: number;
  leaves?: boolean;
}
const QUICK_BG: BannerSpec['bg'] = ['#E3EA8E', '#F1F4C9', '#EAF0BE'];
const PEACH_BG: BannerSpec['bg'] = ['#FCD9C8', '#FFEDE3', '#FDE4D7'];
/** right-side hero box for a 1600x600 banner */
const R = (key: string, extra: Partial<Hero> = {}): Hero => ({ key, x: 800, y: 30, w: 720, h: 560, align: 'centre', ...extra });

/** "everything your home needs" composite built from white-background product photos (back to front) */
const GROCERY_CLUSTER: Hero[] = [
  { key: 'hero-fruits', x: 880, y: 60, w: 640, h: 340, align: 'bottom', strength: 1.8 },
  { key: '@products/tata-sampann-moong-dal', x: 790, y: 250, w: 210, h: 210, align: 'bottom', strength: 1.3 },
  { key: '@products/india-gate-basmati-rice-classic', x: 880, y: 335, w: 255, h: 245, align: 'bottom', strength: 1.3 },
  { key: '@products/happilo-premium-cashews', x: 1100, y: 350, w: 235, h: 230, align: 'bottom', strength: 1.4 },
  { key: '@products/happilo-california-almonds', x: 1300, y: 340, w: 260, h: 245, align: 'bottom', strength: 1.3 },
];

const BANNERS: Record<string, BannerDef> = {
  '1': { out: 'banners/groceries-in-8-minutes.webp', usedFor: 'banner 1', size: [1600, 600], bg: QUICK_BG, tag: 'DAILY ESSENTIALS', line1: 'Groceries in', line2: '8 Minutes', subtitle: 'Fresh groceries, staples & more delivered to your doorstep', cta: 'Shop Now', badge: ['UP TO', '40%', 'OFF'], heroes: GROCERY_CLUSTER },
  '2': { out: 'banners/fresh-fruits-veggies.webp', usedFor: 'banner 2', size: [1600, 600], bg: ['#CDEFC0', '#EEF9E6', '#E2F4D6'], tag: 'FARM FRESH', line1: 'Fresh Fruits', line2: '& Veggies', subtitle: 'Handpicked every morning from local farms', cta: 'Shop Now', badge: ['UP TO', '30%', 'OFF'], heroes: [R('hero-veggies', { strength: 1.5 })] },
  '3': { out: 'banners/summer-coolers.webp', usedFor: 'banner 3', size: [1600, 600], bg: ['#BFE6FB', '#E9F7FE', '#D6F0FC'], accent: '#0B7FB5', tag: 'SUMMER SPECIAL', line1: 'Summer Coolers', line2: 'Beat the Heat', subtitle: 'Chilled drinks, juices & ice creams in minutes', cta: 'Shop Now', badge: ['UP TO', '25%', 'OFF'], heroes: [R('hero-summer-drinks', { w: 440, x: 800, strength: 1.4 }), R('@products/kwality-walls-cornetto-double-chocolate', { x: 1170, w: 330, y: 150, h: 430, align: 'bottom', strength: 1.5 })], leaves: false },
  '4': { out: 'banners/flat-99-off-mumbai99.webp', usedFor: 'banner 4', size: [1600, 600], bg: ['#FFE7A8', '#FFF6DC', '#FFEFC4'], accent: '#0E9623', tag: 'LIMITED OFFER', line1: 'Flat ₹99 Off', line2: 'Code MUMBAI99', subtitle: 'On quick orders above ₹499. Apply at checkout.', cta: 'Grab Deal', badge: ['FLAT', '₹99', 'OFF'], heroes: [R('hero-snacks', { strength: 1.9 })] },
  '5': { out: 'banners/mega-electronics-sale.webp', usedFor: 'banner 5', size: [1600, 600], bg: PEACH_BG, accent: '#E2541B', tag: 'MEGA SALE', line1: 'Mega Electronics', line2: 'Sale', subtitle: 'Headphones, gadgets & accessories at the best prices', cta: 'Shop Now', badge: ['UP TO', '70%', 'OFF'], heroes: [R('hero-electronics', { x: 880, w: 460, strength: 1.3 }), R('@products/boat-airdopes-141-tws-earbuds', { x: 800, y: 330, w: 300, h: 250, align: 'bottom', strength: 1.7 }), R('@products/mi-10000mah-power-bank', { x: 1230, y: 330, w: 300, h: 250, align: 'bottom', strength: 1.7 })], leaves: false },
  '6': { out: 'banners/new-season-fashion.webp', usedFor: 'banner 6', size: [1600, 600], bg: ['#FBD5DF', '#FFEFF3', '#FCE1E8'], accent: '#C2185B', tag: 'NEW ARRIVALS', line1: 'New Season', line2: 'Fashion', subtitle: 'Fresh styles for every day — tees, caps & more', cta: 'Explore', badge: ['UP TO', '50%', 'OFF'], heroes: [R('hero-fashion', { strength: 1.3 }), R('@products/puma-unisex-essential-cap', { x: 1240, y: 360, w: 280, h: 220, align: 'bottom', strength: 1.7 })], leaves: false },
  '7': { out: 'banners/smartphones-from-9999.webp', usedFor: 'banner 7', size: [1600, 600], bg: ['#DCDDFB', '#F2F2FE', '#E6E7FC'], accent: '#4F46E5', tag: 'BEST PRICES', line1: 'Smartphones', line2: 'from ₹9,999', subtitle: 'Latest 5G phones with no-cost EMI & easy returns', cta: 'Buy Now', heroes: [R('hero-smartphone')], leaves: false },
};

/** top-level category -> banner art (also used by the home layouts' "<Category> Deals" placeholders) */
const CATEGORY_BANNERS: Record<string, { line1?: string; bg: BannerSpec['bg']; accent?: string; line2: string; subtitle: string; hero: { group: 'hero' | 'categories'; key: string; strength?: number; w?: number; x?: number }; extra?: Hero[]; badge?: [string, string, string] }> = {
  grocery: { bg: QUICK_BG, line2: 'Deals', subtitle: 'Atta, rice, dals, oils & daily staples', hero: { group: 'hero', key: 'hero-staples' }, badge: ['UP TO', '40%', 'OFF'] },
  'fresh-fruits-vegetables': { line1: 'Fruits & Veggies', bg: ['#CDEFC0', '#EEF9E6', '#E2F4D6'], line2: 'Fresh Picks', subtitle: 'Farm-fresh produce delivered in minutes', hero: { group: 'hero', key: 'hero-fruits', strength: 1.8 }, badge: ['UP TO', '30%', 'OFF'] },
  snacks: { bg: ['#FFDDA6', '#FFF3DE', '#FFE9C4'], accent: '#D9480F', line2: 'Deals', subtitle: 'Chips, namkeen, biscuits & instant food', hero: { group: 'hero', key: 'hero-snacks' }, badge: ['BUY 2', 'GET 1', 'FREE'] },
  summer: { bg: ['#BFE6FB', '#E9F7FE', '#D6F0FC'], accent: '#0B7FB5', line2: 'Deals', subtitle: 'Cold drinks, ice creams & sun care', hero: { group: 'hero', key: 'hero-summer-drinks', strength: 1.4, w: 420, x: 820 }, extra: [{ key: '@products/kwality-walls-cornetto-double-chocolate', x: 1180, y: 130, w: 330, h: 450, align: 'bottom' }], badge: ['UP TO', '25%', 'OFF'] },
  beauty: { bg: ['#F9CFE0', '#FFEFF5', '#FCDDEA'], accent: '#C2185B', line2: 'Deals', subtitle: 'Skin care & hair care you will love', hero: { group: 'categories', key: 'beauty' }, badge: ['UP TO', '35%', 'OFF'] },
  pharmacy: { bg: ['#CFEBFB', '#EEF8FE', '#DFF2FD'], accent: '#0B7FB5', line2: 'Essentials', subtitle: 'Wellness, first aid & health care', hero: { group: 'hero', key: 'hero-pharmacy' } },
  kids: { bg: ['#FFEC9E', '#FFF9DD', '#FFF2BF'], accent: '#D9480F', line2: 'Corner', subtitle: 'Baby care, toys & games', hero: { group: 'categories', key: 'kids' } },
  electronics: { bg: ['#D9E0FD', '#F1F4FF', '#E4E9FE'], accent: '#4F46E5', line2: 'Deals', subtitle: 'Audio, accessories & smart lighting', hero: { group: 'hero', key: 'hero-electronics' }, badge: ['UP TO', '70%', 'OFF'] },
  mobiles: { bg: ['#DFE3EA', '#F5F6F8', '#E9ECF1'], accent: '#344054', line2: 'Deals', subtitle: 'Smartphones, chargers & cables', hero: { group: 'hero', key: 'hero-smartphone' } },
  fashion: { bg: PEACH_BG, accent: '#E2541B', line2: 'Deals', subtitle: 'Men, women & accessories', hero: { group: 'hero', key: 'hero-fashion' }, badge: ['UP TO', '50%', 'OFF'] },
  'home-kitchen': { bg: ['#E7D6FC', '#F7F0FF', '#EEE2FD'], accent: '#7C3AED', line2: 'Deals', subtitle: 'Cleaning, kitchenware & detergents', hero: { group: 'categories', key: 'home-kitchen' } },
  'pet-care': { bg: ['#FFE2C2', '#FFF4E8', '#FFEBD6'], accent: '#D9480F', line2: 'Deals', subtitle: 'Food & treats for dogs and cats', hero: { group: 'categories', key: 'pet-care' } },
};

/** Home-layout placeholder URLs (placehold.co text) -> generated art. Category "<X> Deals" placeholders reuse the category banners. */
const LAYOUT_ART: Record<string, BannerDef | { category: string }> = {
  'Grocery Deals': { category: 'grocery' },
  'Beauty Deals': { category: 'beauty' },
  'Snacks Deals': { category: 'snacks' },
  'Summer Deals': { category: 'summer' },
  'Summer Specials - Ice Creams & Coolers': { out: 'banners/summer-specials.webp', usedFor: 'home layout title_image', size: [1600, 500], bg: ['#BFE6FB', '#E9F7FE', '#D6F0FC'], accent: '#0B7FB5', tag: 'SUMMER SPECIALS', line1: 'Ice Creams', line2: '& Coolers', subtitle: 'Chill out with frozen treats and cold drinks', cta: 'Shop Now', heroes: [{ key: 'hero-summer-drinks', x: 790, y: 30, w: 360, h: 450, strength: 1.4 }, { key: '@products/kwality-walls-cornetto-double-chocolate', x: 1180, y: 40, w: 340, h: 440, align: 'bottom' }], leaves: false },
  'Dairy Deals': { out: 'banners/dairy-deals.webp', usedFor: 'home layout grid_banner', size: [800, 400], bg: ['#D7F0DC', '#F1FAF3', '#E6F4E9'], tag: 'DAIRY & EGGS', line1: 'Dairy Deals', line2: 'Up to 20% off', cta: 'Shop Now', heroes: [{ key: 'hero-dairy', x: 420, y: 30, w: 360, h: 350 }], compact: true, textWidth: 0.56 },
  'Snack Attack': { out: 'banners/snack-attack.webp', usedFor: 'home layout grid_banner', size: [800, 400], bg: ['#FFDDA6', '#FFF3DE', '#FFE9C4'], accent: '#D9480F', tag: 'MUNCHIES', line1: 'Snack Attack', line2: 'Buy 2 Get 1', cta: 'Shop Now', heroes: [{ key: 'hero-snacks', x: 420, y: 30, w: 360, h: 350 }], compact: true, textWidth: 0.56, leaves: false },
  Smartphones: { out: 'banners/smartphones-grid.webp', usedFor: 'home layout grid_banner', size: [800, 400], bg: ['#DFE3EA', '#F5F6F8', '#E9ECF1'], accent: '#344054', tag: 'TRENDING', line1: 'Smartphones', line2: 'from ₹9,999', cta: 'Shop Now', heroes: [{ key: 'hero-smartphone', x: 430, y: 30, w: 350, h: 350 }], compact: true, textWidth: 0.56, leaves: false },
  'Fashion Week': { out: 'banners/fashion-week.webp', usedFor: 'home layout grid_banner', size: [800, 400], bg: PEACH_BG, accent: '#E2541B', tag: 'NEW IN', line1: 'Fashion Week', line2: 'Up to 50% off', cta: 'Explore', heroes: [{ key: 'hero-fashion', x: 430, y: 30, w: 350, h: 350 }], compact: true, textWidth: 0.56, leaves: false },
};

const NOTIFICATION_ART: Record<string, BannerDef> = {
  '1': { out: 'banners/notification-weekend-mega-sale.webp', usedFor: 'notification 1', size: [800, 400], bg: QUICK_BG, tag: 'WEEKEND', line1: 'Mega Sale', line2: 'is LIVE', cta: 'Shop Now', heroes: [{ key: 'hero-veggies', x: 420, y: 40, w: 360, h: 330 }], compact: true, textWidth: 0.56 },
  '2': { out: 'banners/notification-alphonso-mangoes.webp', usedFor: 'notification 2', size: [800, 400], bg: ['#FFE7A8', '#FFF6DC', '#FFEFC4'], accent: '#D9480F', tag: 'IN SEASON', line1: 'Alphonso', line2: 'Mangoes', cta: 'Order Now', heroes: [{ key: '@products/alphonso-mango', x: 420, y: 30, w: 360, h: 350 }], compact: true, textWidth: 0.56 },
  '3': { out: 'banners/notification-rider-bonus.webp', usedFor: 'notification 3', size: [800, 400], bg: ['#D7F0DC', '#F1FAF3', '#E6F4E9'], tag: 'RIDER BONUS', line1: '₹20 Bonus', line2: 'Peak Hours', heroes: [{ key: 'onboarding-2', x: 440, y: 40, w: 330, h: 320, mode: 'card' }], compact: true, textWidth: 0.56 },
};

/** per-photo defaults applied wherever the photo is composited */
const HERO_DEFAULTS: Record<string, Partial<Hero>> = {
  'hero-snacks': { crop: [0.16, 0.12, 0.72, 0.8], strength: 2 },
  '@products/kwality-walls-cornetto-double-chocolate': { strength: 1.5 },
  '@products/amul-vanilla-magic-ice-cream': { crop: [0.2, 0.25, 0.65, 0.6], strength: 1.6 },
};

async function renderBanner(d: BannerDef): Promise<string> {
  const photos = [];
  for (const h0 of d.heroes) {
    const h = { ...HERO_DEFAULTS[h0.key], ...h0 };
    const [group, key] = h.key.startsWith('@') ? (h.key.slice(1).split('/') as [keyof Sources, string]) : (['hero', h.key] as [keyof Sources, string]);
    photos.push({ file: await photo(group, key, d.usedFor), x: h.x, y: h.y, w: h.w, h: h.h, opts: { mode: h.mode ?? 'cutout', align: h.align, crop: h.crop, strength: h.strength } as PhotoOpts });
  }
  const png = await composeBanner({
    width: d.size[0], height: d.size[1], bg: d.bg, accent: d.accent, tag: d.tag, line1: d.line1, line2: d.line2, subtitle: d.subtitle,
    cta: d.cta, badge: d.badge, photos, compact: d.compact, textWidth: d.textWidth, leaves: d.leaves,
  });
  return save(rel('catalog', d.out), await webpUnder(png, d.size[0] >= 1200 ? 250_000 : 120_000, 86));
}

// ------------------------------------------------------------------------------------------- brands / stores / promos
const BRAND_PALETTE: [string, string][] = [
  ['#E6F4E9', '#0B7A1C'], ['#FDE2D6', '#B5410F'], ['#E0E7FF', '#3730A3'], ['#FCE7F3', '#9D174D'], ['#FEF3C7', '#92400E'],
  ['#DBEAFE', '#1E40AF'], ['#EDE9FE', '#5B21B6'], ['#D1FAE5', '#065F46'], ['#FFE4E6', '#9F1239'], ['#E0F2FE', '#075985'],
];
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
async function brandTile(rawName: string): Promise<Buffer> {
  const name = rawName.replace(/snap\s?buy/gi, 'QwikMart');
  const W = 400, H = 200;
  const [bg, fg] = BRAND_PALETTE[hash(name) % BRAND_PALETTE.length];
  const size = fitSize(name, W - 70, 64, 'ExtraBold', 18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/><circle cx="${W - 30}" cy="22" r="58" fill="#ffffff" fill-opacity=".35"/><circle cx="24" cy="${H - 10}" r="40" fill="#ffffff" fill-opacity=".3"/>${textPath(name, W / 2, H / 2 + size * 0.36, size, { anchor: 'middle', fill: fg, weight: 'ExtraBold' })}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// QwikMart cart-Q mark (assets/brand/out, built by build-brand.ts) on a rounded tile. A white tile gets the
// full-colour mark; a coloured tile gets the white mark.
const MARK_COLOUR = `data:image/png;base64,${readFileSync(path.join(HERE, 'brand/out/qwikmart-icon.png')).toString('base64')}`;
const MARK_WHITE = `data:image/png;base64,${readFileSync(path.join(HERE, 'brand/out/qwikmart-mark-white.png')).toString('base64')}`;
const LOGO_ICON = (x: number, y: number, s: number, bg = BRAND.primary, _fg = '#ffffff') => {
  const href = bg.toLowerCase() === '#ffffff' ? MARK_COLOUR : MARK_WHITE;
  const pad = s * 0.12;
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${bg}"/><image x="${x + pad}" y="${y + pad}" width="${s - pad * 2}" height="${s - pad * 2}" href="${href}" preserveAspectRatio="xMidYMid meet"/>`;
};

async function storeLogo(city: string): Promise<Buffer> {
  const S = 400;
  const size = fitSize(city, S - 60, 54, 'ExtraBold', 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12A62A"/><stop offset="1" stop-color="#0B7A1C"/></linearGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/><circle cx="${S}" cy="0" r="150" fill="#ffffff" fill-opacity=".08"/><circle cx="0" cy="${S}" r="120" fill="#ffffff" fill-opacity=".06"/>${LOGO_ICON(S / 2 - 70, 70, 140, '#ffffff', BRAND.primary)}${textPath(city, S / 2, 290, size, { anchor: 'middle', fill: '#ffffff' })}${textPath('QWIKMART STORE', S / 2, 330, 20, { anchor: 'middle', fill: '#ffffff', weight: 'Bold', letterSpacing: 3, opacity: 0.85 })}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function storeBanner(name: string, file: string): Promise<Buffer> {
  const W = 1200, H = 400;
  const bgPhoto = await sharp(file).rotate().resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).modulate({ brightness: 1.03, saturation: 1.05 }).png().toBuffer();
  const size = fitSize(name, 560, 64);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".96"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".82"/><stop offset=".75" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#o)"/>${LOGO_ICON(64, 92, 64)}${textPath(name, 64, 230, size)}${textPath('Fresh groceries & essentials, delivered in minutes', 64, 280, 24, { weight: 'Medium', fill: BRAND.body })}<rect x="64" y="308" width="176" height="44" rx="22" fill="${BRAND.primary}"/>${textPath('Open now', 152, 337, 20, { anchor: 'middle', weight: 'Bold', fill: '#ffffff' })}</svg>`;
  return sharp(bgPhoto).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
async function promoArt(code: string, color: string, headline: string, sub: string): Promise<Buffer> {
  const W = 600, H = 300;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".78"/></linearGradient></defs><rect width="${W}" height="${H}" fill="#ffffff"/><rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="${W - 40}" cy="40" r="120" fill="#fff" fill-opacity=".12"/><circle cx="${W - 120}" cy="${H + 30}" r="110" fill="#fff" fill-opacity=".08"/><circle cx="0" cy="${H / 2}" r="22" fill="#fff"/><circle cx="${W}" cy="${H / 2}" r="22" fill="#fff"/>${textPath(headline, 50, 120, fitSize(headline, 500, 64), { fill: '#ffffff' })}${textPath(sub, 50, 165, 24, { weight: 'Medium', fill: '#ffffff', opacity: 0.92 })}<rect x="50" y="198" width="${measure(code, 26, 'ExtraBold', 2) + 56}" height="58" rx="12" fill="#ffffff" fill-opacity=".18" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="9 6"/>${textPath(code, 78, 237, 26, { fill: '#ffffff', letterSpacing: 2 })}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ------------------------------------------------------------------------------------------- UI illustrations
async function circleArt(file: string, size: number, colors: [string, string], o: { photoScale?: number; cutout?: boolean } = {}): Promise<Buffer> {
  const ring = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[0]}"/></radialGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="url(#g)"/><circle cx="${size * 0.82}" cy="${size * 0.2}" r="${size * 0.05}" fill="${BRAND.primary}" fill-opacity=".25"/><circle cx="${size * 0.14}" cy="${size * 0.74}" r="${size * 0.035}" fill="${BRAND.primary}" fill-opacity=".3"/></svg>`);
  const inner = Math.round(size * (o.photoScale ?? 0.72));
  const layers: sharp.OverlayOptions[] = [];
  if (o.cutout !== false && (await isWhiteBackground(file, 225))) {
    layers.push({ input: await preparePhoto(file, inner, inner, { mode: 'cutout', feather: Math.round(inner * 0.04) }), gravity: 'centre' });
  } else {
    const ph = await sharp(file).rotate().resize(size - 24, size - 24, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${size - 24}" height="${size - 24}"><circle cx="${(size - 24) / 2}" cy="${(size - 24) / 2}" r="${(size - 24) / 2}" fill="#fff"/></svg>`);
    layers.push({ input: await sharp(ph).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), gravity: 'centre' });
  }
  return sharp(ring).composite(layers).png().toBuffer();
}

async function adminLogin(): Promise<Buffer> {
  // Green wave panel (screenshot 46) with a shopping cart photo cutout + floating icon badges.
  const W = 1100, H = 1000;
  const icon = (cx: number, cy: number, inner: string) => `<g><circle cx="${cx}" cy="${cy + 6}" r="56" fill="#0B5E17" fill-opacity=".12"/><circle cx="${cx}" cy="${cy}" r="56" fill="#ffffff"/><g transform="translate(${cx - 26} ${cy - 26}) scale(2.2)" fill="none" stroke="${BRAND.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></g>`;
  const cart = '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>';
  const truck = '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>';
  const pct = '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/>';
  const bag = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  const dots = Array.from({ length: 6 * 5 }, (_, i) => `<circle cx="${250 + (i % 6) * 22}" cy="${90 + Math.floor(i / 6) * 22}" r="3" fill="#ffffff" fill-opacity=".35"/>`).join('');
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16A82E"/><stop offset="1" stop-color="#0B7A1C"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E9F6EA"/><stop offset="1" stop-color="#F6F7F6" stop-opacity="0"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="#F3F5F3"/>
    <path d="M0 0 H700 C 560 160, 760 330, 600 520 C 460 690, 700 850, 640 1000 H0 Z" fill="url(#g)"/>
    <path d="M0 0 H560 C 430 170, 610 330, 470 520 C 340 700, 560 860, 500 1000 H0 Z" fill="#ffffff" fill-opacity=".10"/>
    <path d="M0 220 C 200 260, 380 420, 330 600 C 290 760, 420 900, 380 1000 H0 Z" fill="#ffffff" fill-opacity=".14"/>
    <path d="M700 0 C 560 160, 760 330, 600 520 C 460 690, 700 850, 640 1000" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="3"/>
    ${dots}
    <circle cx="470" cy="70" r="14" fill="none" stroke="#9BD3A3" stroke-width="4"/><circle cx="850" cy="830" r="22" fill="none" stroke="#9BD3A3" stroke-width="4"/>
    <path d="M540 245 v24 M528 257 h24" stroke="#9BD3A3" stroke-width="4" stroke-linecap="round"/><path d="M900 880 v24 M888 892 h24" stroke="#9BD3A3" stroke-width="4" stroke-linecap="round"/>
    <path d="M195 320 C 270 230, 420 210, 520 300 C 600 370, 640 470, 660 580" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="3" stroke-dasharray="10 10"/>
    </svg>`);
  const plate = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><circle cx="380" cy="700" r="300" fill="#ffffff" fill-opacity=".25"/><g transform="translate(60 400) scale(1.0)">${cartScene(true)}</g></svg>`);
  const icons = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${icon(190, 330, pct)}${icon(385, 225, cart)}${icon(600, 420, truck)}${icon(680, 640, bag)}</svg>`);
  return sharp(bg).composite([{ input: plate }, { input: icons }]).png().toBuffer();
}

/** Flat vector shopping cart with a green bag, kraft box and gift (admin login / empty cart). Drawn in a 600x520 box. */
function cartScene(withGoods = true) {
  const g: string[] = [];
  g.push('<ellipse cx="300" cy="500" rx="250" ry="18" fill="#0B5E17" fill-opacity=".18"/>');
  if (withGoods) {
    // kraft box (back)
    g.push('<g transform="translate(150 120)"><rect width="170" height="150" rx="8" fill="#D9A866"/><rect width="170" height="34" rx="6" fill="#E8BE82"/><rect x="72" width="26" height="150" fill="#C99350"/><path d="M28 70 h40 v28 h-40z" fill="#F4DDB8"/></g>');
    // green shopping bag
    g.push('<g transform="translate(300 70)"><path d="M40 60 v-18 a40 40 0 0 1 80 0 v18" fill="none" stroke="#0B7A1C" stroke-width="10" stroke-linecap="round"/><path d="M10 60 H150 L160 230 H0 Z" fill="#16A82E"/><path d="M10 60 H150 L154 110 H6 Z" fill="#12952A"/><g transform="translate(52 128) scale(2.4)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></g></g>');
    // gift box
    g.push('<g transform="translate(110 250)"><rect width="120" height="100" rx="8" fill="#22B83A"/><rect y="-6" width="120" height="30" rx="6" fill="#2FCB49"/><rect x="50" y="-6" width="20" height="106" fill="#B7F0C1"/><path d="M60 -6 C 40 -40, 10 -20, 40 -6 M60 -6 C 80 -40, 110 -20, 80 -6" stroke="#B7F0C1" stroke-width="9" fill="none" stroke-linecap="round"/></g>');
  }
  // cart basket (front, semi-transparent wire grid)
  const basket = 'M70 220 H540 L500 400 H120 Z';
  g.push('<path d="' + basket + '" fill="#E6F4E9" fill-opacity=".55" stroke="#4B5563" stroke-width="12" stroke-linejoin="round"/>');
  for (let i = 1; i < 8; i++) { const t = i / 8; const xt = 70 + 470 * t, xb = 120 + 380 * t; g.push('<path d="M' + xt + ' 220 L' + xb + ' 400" stroke="#6B7280" stroke-width="6"/>'); }
  for (let j = 1; j < 4; j++) { const t = j / 4; const y = 220 + 180 * t; const xl = 70 + 50 * t, xr = 540 - 40 * t; g.push('<path d="M' + xl + ' ' + y + ' H' + xr + '" stroke="#6B7280" stroke-width="6"/>'); }
  g.push('<path d="M540 220 L572 120 H612" stroke="#374151" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>');
  g.push('<path d="M120 400 L105 440 H500" stroke="#374151" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>');
  g.push('<circle cx="160" cy="470" r="26" fill="#1F2937"/><circle cx="160" cy="470" r="10" fill="#9CA3AF"/><circle cx="460" cy="470" r="26" fill="#1F2937"/><circle cx="460" cy="470" r="10" fill="#9CA3AF"/>');
  return g.join('');
}

function emptyCartSvg(size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 480 480"><defs><radialGradient id="g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#F4FBF5"/><stop offset="1" stop-color="#DDF0E0"/></radialGradient></defs><circle cx="240" cy="240" r="236" fill="url(#g)"/><g transform="translate(70 110) scale(0.56)">${cartScene(false)}</g><circle cx="110" cy="120" r="10" fill="#0E9623" fill-opacity=".3"/><circle cx="380" cy="110" r="14" fill="none" stroke="#0E9623" stroke-opacity=".35" stroke-width="5"/><path d="M360 170 v22 M349 181 h22" stroke="#0E9623" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/></svg>`;
}

function emptySearchSvg(size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 480 480"><defs><radialGradient id="g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#F4FBF5"/><stop offset="1" stop-color="#DDF0E0"/></radialGradient></defs><circle cx="240" cy="240" r="236" fill="url(#g)"/><ellipse cx="240" cy="408" rx="130" ry="16" fill="#0E9623" fill-opacity=".12"/><rect x="120" y="150" width="200" height="230" rx="24" fill="#ffffff" stroke="#B9DFC0" stroke-width="6"/><rect x="150" y="190" width="120" height="14" rx="7" fill="#DDEFE0"/><rect x="150" y="224" width="140" height="14" rx="7" fill="#DDEFE0"/><rect x="150" y="258" width="90" height="14" rx="7" fill="#DDEFE0"/><circle cx="300" cy="270" r="72" fill="#ffffff" fill-opacity=".85" stroke="#0E9623" stroke-width="16"/><path d="M352 322 L400 370" stroke="#0E9623" stroke-width="24" stroke-linecap="round"/><path d="M276 246 l48 48 M324 246 l-48 48" stroke="#9BD3A3" stroke-width="12" stroke-linecap="round"/><circle cx="96" cy="128" r="12" fill="#0E9623" fill-opacity=".3"/><circle cx="392" cy="120" r="8" fill="#0E9623" fill-opacity=".35"/></svg>`;
}

// =============================================================================================== main
async function main() {
  const conn = await openMysql();
  const q = (sql: string) => rows(conn, sql);
  const products = (await q('SELECT id, slug, name FROM products WHERE deleted_at IS NULL ORDER BY id')) as any[];
  const variants = (await q('SELECT id, product_id, name, image FROM product_variants ORDER BY id')) as any[];
  const categories = (await q('SELECT id, parent_id, slug, name FROM categories ORDER BY id')) as any[];
  const brands = (await q('SELECT id, slug, name FROM brands ORDER BY id')) as any[];
  const banners = (await q('SELECT id, title FROM banners ORDER BY id')) as any[];
  const blogs = (await q('SELECT id, slug FROM blogs ORDER BY id')) as any[];
  const stores = (await q('SELECT id, slug, name, city FROM stores ORDER BY id')) as any[];
  const promos = (await q('SELECT id, code, banner_color, discount_type, discount_value, min_order FROM promo_codes ORDER BY id')) as any[];
  const layouts = (await q('SELECT published_sections, draft_sections FROM home_layouts')) as any[];
  await conn.end();

  const manifestPath = path.join(HERE, 'manifest.json');
  const manifest: any = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  manifest.version = 1;
  manifest.note = 'Paths are relative to firebase/tools/assets; the migration uploads each file to Storage at the same path minus the leading "catalog/" folder name kept (i.e. catalog/<type>/<file>).';

  // ---------------- products
  if (want('products')) {
    manifest.products = {};
    for (const p of products) {
      if (!sources.products[p.slug]) {
        console.warn(`  ! no photo for product ${p.id} ${p.slug}`);
        continue;
      }
      const tw = PHOTO_TWEAKS[p.slug] ?? {};
      const f = await photo('products', p.slug, `product ${p.slug}`);
      const big = await square(f, 800, { ...tw });
      const main = save(rel('catalog/products', `${p.slug}.webp`), await webpUnder(big, 118_000));
      const thumb = save(rel('catalog/products', `${p.slug}-thumb.webp`), await webpUnder(await sharp(big).resize(400, 400).png().toBuffer(), 60_000));
      const images = [main];
      if (sources.products[p.slug].alt_image_url) {
        const f2 = await photo('products', p.slug, `product ${p.slug} (2nd image)`, true);
        images.push(save(rel('catalog/products', `${p.slug}-2.webp`), await webpUnder(await square(f2, 800), 118_000)));
      }
      const vmap: Record<string, string> = {};
      const pv = variants.filter((v) => v.product_id === p.id);
      // variants that had a (placeholder) image get the product photos (alternating when there is a 2nd image)
      pv.forEach((v, i) => {
        if (v.image) vmap[String(v.id)] = images[i % images.length];
      });
      manifest.products[p.id] = { slug: p.slug, images, thumbnail: thumb, variants: vmap };
      process.stdout.write('.');
    }
    console.log(` products: ${Object.keys(manifest.products).length}`);
  }

  // ---------------- categories (image 400 + icon 128 + banner for top level)
  if (want('categories')) {
    manifest.categories = {};
    for (const c of categories) {
      const entry: Record<string, string> = { slug: c.slug };
      if (sources.categories[c.slug]) {
        const tw = PHOTO_TWEAKS[`cat:${c.slug}`] ?? {};
        const f = await photo('categories', c.slug, `category ${c.slug}`);
        const img = await square(f, 400, { bg: CATEGORY_TINT, padding: 0.07, ...tw });
        entry.image = save(rel('catalog/categories', `${c.slug}.webp`), await webpUnder(img, 60_000));
        entry.icon = save(rel('catalog/categories', `${c.slug}-icon.webp`), await webpUnder(await sharp(img).resize(128, 128).png().toBuffer(), 14_000));
      } else console.warn(`  ! no photo for category ${c.slug}`);
      const cb = CATEGORY_BANNERS[c.slug];
      if (cb && !c.parent_id) {
        entry.banner = await renderBanner({
          out: `banners/category-${c.slug}.webp`, usedFor: `category ${c.slug} banner`, size: [1600, 600], bg: cb.bg, accent: cb.accent,
          tag: 'TOP PICKS', line1: cb.line1 ?? enName(c.name), line2: cb.line2, subtitle: cb.subtitle, cta: 'Shop Now', badge: cb.badge,
          heroes: [
            cb.hero.group === 'hero'
              ? R(cb.hero.key, { strength: cb.hero.strength, ...(cb.hero.w ? { w: cb.hero.w } : {}), ...(cb.hero.x ? { x: cb.hero.x } : {}) })
              : { ...R(`@categories/${cb.hero.key}`), mode: 'card', x: 860, y: 70, w: 640, h: 460 },
            ...(cb.extra ?? []),
          ],
          leaves: cb.bg === QUICK_BG,
        });
      }
      manifest.categories[c.id] = entry;
      process.stdout.write('.');
    }
    console.log(` categories: ${Object.keys(manifest.categories).length}`);
  }

  // ---------------- banners
  if (want('banners')) {
    manifest.banners = {};
    for (const b of banners) {
      const d = BANNERS[String(b.id)];
      if (!d) continue;
      manifest.banners[b.id] = { title: enName(b.title), image: await renderBanner(d) };
    }
    // home-layout placeholders
    manifest.placeholders = {};
    const urls = new Set<string>();
    for (const l of layouts) for (const k of ['published_sections', 'draft_sections']) for (const m of String(l[k] ?? '').matchAll(/https?:\\?\/\\?\/placehold\.co[^"]*/g)) urls.add(m[0].replace(/\\\//g, '/'));
    for (const u of urls) {
      const text = decodeURIComponent((new URL(u).searchParams.get('text') ?? '').replace(/\+/g, ' '));
      const art = LAYOUT_ART[text];
      if (!art) {
        console.warn(`  ! no art for layout placeholder "${text}"`);
        continue;
      }
      if ('category' in art) {
        const cat = categories.find((c) => c.slug === art.category);
        const done = manifest.categories?.[cat?.id]?.banner;
        manifest.placeholders[u] = done ?? `catalog/banners/category-${art.category}.webp`;
      } else manifest.placeholders[u] = await renderBanner(art);
    }
    manifest.notifications = {};
    for (const [id, d] of Object.entries(NOTIFICATION_ART)) manifest.notifications[id] = { image: await renderBanner(d) };
    console.log(` banners: ${Object.keys(manifest.banners).length}, layout placeholders: ${Object.keys(manifest.placeholders).length}, notifications: ${Object.keys(manifest.notifications).length}`);
  }

  // ---------------- blogs (1200x630 covers)
  if (want('blogs')) {
    manifest.blogs = {};
    const BLOG_PHOTO: Record<string, string> = {
      '5-quick-monsoon-snacks-under-15-minutes': 'blog-monsoon-snacks',
      'the-perfect-mumbai-vada-pav-at-home': 'blog-vada-pav',
      'summer-hydration-7-drinks-to-beat-the-heat': 'blog-summer-drinks',
      'building-immunity-with-everyday-foods': 'blog-immunity-foods',
      'qwikmart-now-delivers-in-8-minutes-across-mumbai': 'blog-fast-delivery',
      'introducing-qwikmart-wallet-cashback': 'blog-wallet-cashback',
    };
    for (const b of blogs) {
      const key = BLOG_PHOTO[b.slug];
      if (!key) continue;
      const f = await photo('hero', key, `blog ${b.slug}`);
      const buf = await sharp(f).rotate().resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
      manifest.blogs[b.id] = { slug: b.slug, image: save(rel('catalog/blogs', `${b.slug}.webp`), await webpUnder(buf, 180_000)) };
    }
    console.log(` blogs: ${Object.keys(manifest.blogs).length}`);
  }

  // ---------------- stores
  if (want('stores')) {
    manifest.stores = {};
    for (const s of stores) {
      const city = String(s.name).replace(/\s*Store$/i, '');
      const front = `store-front-${((s.id - 1) % 3) + 1}`;
      const f = await photo('hero', front, `store ${s.slug} banner`);
      manifest.stores[s.id] = {
        slug: s.slug,
        logo: save(rel('catalog/stores', `${s.slug}-logo.webp`), await webpUnder(await storeLogo(city), 40_000)),
        banner: save(rel('catalog/stores', `${s.slug}-banner.webp`), await webpUnder(await storeBanner(s.name, f), 160_000)),
      };
    }
    console.log(` stores: ${Object.keys(manifest.stores).length}`);
  }

  // ---------------- brands (wordmark tiles, no real logos)
  if (want('brands')) {
    manifest.brands = {};
    for (const b of brands) manifest.brands[b.id] = { slug: b.slug, logo: save(rel('catalog/brands', `${b.slug}.webp`), await webpUnder(await brandTile(b.name), 30_000)) };
    console.log(` brands: ${Object.keys(manifest.brands).length}`);
  }

  // ---------------- promo codes
  if (want('promos')) {
    manifest.promo_codes = {};
    for (const p of promos) {
      const v = Number(p.discount_value);
      const headline = p.discount_type === 'free_delivery' ? 'Free Delivery' : p.discount_type === 'percent' ? `${v}% Off` : `Flat ₹${v} Off`;
      const sub = Number(p.min_order) > 0 ? `On orders above ₹${Number(p.min_order)}` : 'On every order';
      manifest.promo_codes[p.id] = { code: p.code, image: save(rel('catalog/promos', `${String(p.code).toLowerCase()}.webp`), await webpUnder(await promoArt(p.code, p.banner_color || BRAND.primary, headline, sub), 40_000)) };
    }
    console.log(` promo codes: ${Object.keys(manifest.promo_codes).length}`);
  }

  // ---------------- UI illustrations (copied into the apps by hand / see report)
  if (want('ui')) {
    const ui: Record<string, string> = {};
    const out = (name: string, buf: Buffer) => (ui[name] = save(rel('ui', name), buf));
    out('admin-login-illustration.webp', await webpUnder(await adminLogin(), 200_000, 86));
    out('login-cart-scene.webp', await webpUnder(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="728" viewBox="0 0 640 555"><g transform="translate(10 20)">${cartScene(true)}</g></svg>`)).png().toBuffer(), 60_000));
    out('empty-cart.webp', await webpUnder(await sharp(Buffer.from(emptyCartSvg(480))).png().toBuffer(), 40_000));
    out('empty-orders.webp', await webpUnder(await circleArt(await photo('hero', 'hero-delivery-box', 'empty orders illustration'), 480, ['#DDF0E0', '#F4FBF5'], { photoScale: 0.62 }), 60_000));
    out('empty-search.webp', await webpUnder(await sharp(Buffer.from(emptySearchSvg(480))).png().toBuffer(), 40_000));
    out('onboarding-1.webp', await webpUnder(await circleArt(await photo('hero', 'onboarding-1', 'onboarding slide 1'), 640, ['#E9EDA8', '#FBFCEF']), 110_000));
    out('onboarding-2.webp', await webpUnder(await circleArt(await photo('hero', 'onboarding-2', 'onboarding slide 2'), 640, ['#FBD9C9', '#FFF6F1']), 110_000));
    out('onboarding-3.webp', await webpUnder(await circleArt(await photo('hero', 'onboarding-3', 'onboarding slide 3'), 640, ['#CFEBD5', '#F1FAF3']), 110_000));
    out('hero-fallback.webp', readFileSync(path.join(HERE, 'catalog/banners/groceries-in-8-minutes.webp')));
    manifest.ui = ui;
    console.log(` ui: ${Object.keys(ui).length}`);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  writeCredits();
}

function writeCredits() {
  const f = path.join(HERE, 'CREDITS.md');
  // merge with previous runs (partial --only builds)
  const prev = existsSync(path.join(HERE, '.credits.json')) ? JSON.parse(readFileSync(path.join(HERE, '.credits.json'), 'utf8')) : {};
  for (const [page, c] of credits) prev[page] = { source_page: c.source_page, image_url: c.image_url, used_for: [...new Set([...(prev[page]?.used_for ?? []), ...c.used_for])].sort() };
  writeFileSync(path.join(HERE, '.credits.json'), JSON.stringify(prev, null, 2));
  const list = Object.values(prev as Record<string, { source_page: string; image_url: string; used_for: string[] }>).sort((a, b) => a.used_for[0].localeCompare(b.used_for[0]));
  const lines = [
    '# QwikMart catalog image credits',
    '',
    'All photographs are from **Unsplash** and used under the [Unsplash License](https://unsplash.com/license): free for commercial and',
    'non-commercial use, no permission or attribution required (attribution listed here as a courtesy). Unsplash+ (premium) images were',
    'not used. Photos were chosen without visible third-party logos/trademarks; product names in the catalog (e.g. "Amul Butter") are',
    'illustrated with generic photos of the product type.',
    '',
    'Generated artwork (no third-party content): banner text/layout, brand wordmark tiles (`catalog/brands/*` — plain text of the brand',
    'name, not the real logos), store logos/banners overlay, promo-code art, vector cart/bag/box scene (admin login, empty cart), empty-search illustration.',
    'Font: Plus Jakarta Sans (SIL Open Font License 1.1) — `assets/fonts/`, rendered to vector paths.',
    '',
    `Generated by \`assets/build-catalog.ts\`. ${list.length} source photos.`,
    '',
    '| Used for | Source page | Image |',
    '|---|---|---|',
    ...list.map((c) => `| ${esc(c.used_for.join(', '))} | ${c.source_page} | ${c.image_url} |`),
    '',
  ];
  writeFileSync(f, lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
