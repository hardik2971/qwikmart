/**
 * Website brand assets from the QwikMart logo.
 *
 *   npx tsx assets/build-web-brand.ts [path/to/QwikMart-website.png]   (run from firebase/tools)
 *
 * Writes:
 *   assets/brand/qwikmart-website.png          original logo (kept as the source of truth)
 *   web/public/images/brand/qwikmart-logo.png  trimmed logo, 160px tall (header/footer, 2× for 40px)
 *   web/public/images/brand/qwikmart-logo.webp same, WebP
 *   web/public/images/brand/qwikmart-icon.png  512² cart-Q mark on white (icon-only logo)
 *   web/src/app/icon.png, apple-icon.png       favicon / home-screen icon (Next.js file convention)
 *   web/src/app/opengraph-image.png            1200×630 social share image (+ twitter-image.png)
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
// @ts-expect-error opentype.js ships no types
import opentype from 'opentype.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const WEB = path.join(ROOT, 'web');
const SRC_COPY = path.join(HERE, 'brand/qwikmart-website.png');
const BLUE = '#1D4ED8';
const BLUE_DARK = '#0B2A8A';
const ORANGE = '#F97316';

const input = process.argv[2] ?? (existsSync(SRC_COPY) ? SRC_COPY : 'C:/Users/di/Desktop/QwikMart-website.png');
mkdirSync(path.dirname(SRC_COPY), { recursive: true });
if (path.resolve(input) !== path.resolve(SRC_COPY)) copyFileSync(input, SRC_COPY);

const outBrand = path.join(WEB, 'public/images/brand');
mkdirSync(outBrand, { recursive: true });

const font = (w: string) => opentype.loadSync(path.join(HERE, `fonts/PlusJakartaSans-${w}.ttf`));
const ExtraBold = font('ExtraBold');
const SemiBold = font('SemiBold');
const Bold = font('Bold');

/** Text as an SVG path (no system fonts needed). Returns { svg, width }. */
function text(str: string, f: any, size: number, x: number, y: number, fill: string, anchor: 'start' | 'middle' = 'start') {
  const p = f.getPath(str, 0, 0, size);
  const b = p.getBoundingBox();
  const w = b.x2 - b.x1;
  const tx = anchor === 'middle' ? x - w / 2 - b.x1 : x - b.x1;
  return { svg: `<path transform="translate(${tx} ${y})" d="${p.toPathData(2)}" fill="${fill}"/>`, width: w };
}

// 1. Trimmed logo.
const trimmed = await sharp(SRC_COPY).trim({ threshold: 10 }).png().toBuffer();
const meta = await sharp(trimmed).metadata();
await sharp(trimmed).resize({ height: 160 }).png({ compressionLevel: 9 }).toFile(path.join(outBrand, 'qwikmart-logo.png'));
await sharp(trimmed).resize({ height: 160 }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outBrand, 'qwikmart-logo.webp'));

// 2. Icon mark = the cart-Q on the left: find the first fully transparent column gap after the mark.
const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const colOpaque = (x: number) => {
  for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 24) return true;
  return false;
};
let gapStart = -1;
for (let x = Math.floor(info.width * 0.15), run = 0; x < info.width * 0.6; x++) {
  run = colOpaque(x) ? 0 : run + 1;
  if (run >= Math.max(8, info.width * 0.006)) { gapStart = x - run + 1; break; }
}
const markW = gapStart > 0 ? gapStart : Math.round(meta.height! * 1.45);
const mark = await sharp(trimmed).extract({ left: 0, top: 0, width: markW, height: info.height }).trim({ threshold: 10 }).png().toBuffer();
const iconSquare = async (size: number, pad: number, bg: string) => {
  const inner = Math.round(size * (1 - pad * 2));
  const m = await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: m, gravity: 'center' }]).png();
};
await (await iconSquare(512, 0.1, '#ffffff')).toFile(path.join(outBrand, 'qwikmart-icon.png'));
await (await iconSquare(512, 0.08, '#ffffff')).toFile(path.join(WEB, 'src/app/icon.png'));
await (await iconSquare(180, 0.12, '#ffffff')).flatten({ background: '#ffffff' }).toFile(path.join(WEB, 'src/app/apple-icon.png'));

// favicon.ico (16/32/48 px PNG frames in an ICO container) for browsers that request /favicon.ico directly.
const frames = await Promise.all([16, 32, 48].map(async (s) => ({ s, png: await (await iconSquare(s, 0.04, '#ffffff')).toBuffer() })));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const entries = frames.map(({ s, png }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync(path.join(WEB, 'src/app/favicon.ico'), Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]));

// 3. Open Graph image 1200×630.
const W = 1200, H = 630;
const bg = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#EEF4FF"/><stop offset="0.55" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFF1E6"/>
    </linearGradient>
    <linearGradient id="pill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_DARK}"/></linearGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FDBA2D"/><stop offset="1" stop-color="${ORANGE}"/></linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0B2A8A" flood-opacity="0.14"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1120" cy="70" r="210" fill="${ORANGE}" fill-opacity="0.08"/>
  <circle cx="60" cy="600" r="230" fill="${BLUE}" fill-opacity="0.06"/>`;

const headline1 = text('Groceries in minutes.', ExtraBold, 54, 70, 268, BLUE_DARK);
const headline2 = text('Everything else in days.', ExtraBold, 54, 70, 336, ORANGE);
const sub = text('Fresh produce, essentials, electronics & fashion.', SemiBold, 22, 72, 384, '#475569');
const badgeText = text('⚡ Delivery in 10 minutes', Bold, 22, 0, 0, '#fff');
const badgeW = Math.round(text('Delivery in 10 minutes', Bold, 22, 0, 0, '#fff').width + 74);
const badge = `
  <g transform="translate(70 418)">
    <rect width="${badgeW}" height="52" rx="26" fill="url(#pill)"/>
    <path transform="translate(22 13) scale(1.1)" d="M13 2 L3 14 h9 l-1 8 L21 10 h-9 l1-8 Z" fill="#FDBA2D"/>
    ${text('Delivery in 10 minutes', Bold, 22, 52, 34, '#fff').svg}
  </g>`;
void badgeText;
const cta = `
  <g transform="translate(${70 + badgeW + 16} 418)">
    <rect width="190" height="52" rx="26" fill="url(#cta)"/>
    ${text('Shop now  →', Bold, 22, 95, 34, '#fff', 'middle').svg}
  </g>`;
const url = text('Order on the web or the QwikMart app', SemiBold, 19, 72, 548, '#94A3B8');

// Product photo cards on the right (fresh produce from the catalog).
const products = ['fresh-tomato-local', 'banana-robusta', 'shimla-apple', 'amul-taaza-toned-milk'];
const cardPos = [
  { x: 745, y: 105, s: 185 }, { x: 955, y: 80, s: 165 }, { x: 930, y: 270, s: 205 },
  { x: 750, y: 320, s: 165 },
];
const cards = cardPos.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.s}" height="${c.s}" rx="${c.s * 0.18}" fill="#fff" filter="url(#sh)"/>`).join('');
const photos = await Promise.all(products.map(async (p, i) => {
  const c = cardPos[i];
  const inner = Math.round(c.s * 0.82);
  const img = await sharp(path.join(HERE, `catalog/products/${p}.webp`)).resize(inner, inner, { fit: 'cover' })
    .composite([{ input: Buffer.from(`<svg width="${inner}" height="${inner}"><rect width="${inner}" height="${inner}" rx="${inner * 0.16}"/></svg>`), blend: 'dest-in' }])
    .png().toBuffer();
  return { input: img, left: Math.round(c.x + (c.s - inner) / 2), top: Math.round(c.y + (c.s - inner) / 2) };
}));

const logoW = 470;
const logoOg = await sharp(trimmed).resize({ width: logoW }).png().toBuffer();
const logoH = (await sharp(logoOg).metadata()).height!;

const og = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg}${cards}${headline1.svg}${headline2.svg}${sub.svg}${badge}${cta}${url.svg}
</svg>`)).composite([{ input: logoOg, left: 66, top: Math.round(150 - logoH / 2) }, ...photos]);
const ogBuf = await og.png({ compressionLevel: 9 }).toBuffer();
writeFileSync(path.join(WEB, 'src/app/opengraph-image.png'), ogBuf);
writeFileSync(path.join(WEB, 'src/app/twitter-image.png'), ogBuf);
const alt = 'QwikMart — groceries in minutes, everything else in days. Delivery in 10 minutes.';
writeFileSync(path.join(WEB, 'src/app/opengraph-image.alt.txt'), alt);
writeFileSync(path.join(WEB, 'src/app/twitter-image.alt.txt'), alt);

console.log(`logo ${meta.width}×${meta.height} trimmed; mark ${markW}px wide; OG ${W}×${H} written`);
