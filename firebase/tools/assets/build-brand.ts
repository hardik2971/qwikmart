/**
 * QwikMart brand assets for the admin app and both Flutter apps (the website has build-web-brand.ts).
 *
 *   npx tsx assets/build-brand.ts      (run from firebase/tools)
 *
 * Sources (copied into assets/brand/ on first run):
 *   qwikmart-website.png  full-colour horizontal logo (blue "Qwik" + orange "Mart", transparent)
 *   qwikmart-mobile.png   app icon: white cart-Q on brand blue #033EAB
 *
 * Writes (assets/brand/out/ and copies to the apps):
 *   qwikmart-logo.png        full-colour logo, 160px tall (light backgrounds)
 *   qwikmart-logo-white.png  white mark + white wordmark, 160px tall (dark / brand-blue backgrounds)
 *   qwikmart-icon.png        full-colour cart-Q mark, 512² transparent
 *   qwikmart-mark-white.png  white cart-Q mark, 1024² transparent (icons, splash)
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
// @ts-expect-error opentype.js ships no types
import opentype from 'opentype.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const BRAND = path.join(HERE, 'brand');
const OUT = path.join(BRAND, 'out');
export const BLUE = '#033EAB';
mkdirSync(OUT, { recursive: true });

const sources: Record<string, string> = {
  'qwikmart-website.png': 'C:/Users/di/Desktop/QwikMart-website.png',
  'qwikmart-mobile.png': 'C:/Users/di/Desktop/QwikMart-mobile-512.png',
};
for (const [name, fallback] of Object.entries(sources)) {
  const dest = path.join(BRAND, name);
  if (!existsSync(dest)) copyFileSync(fallback, dest);
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/** White cart-Q mark (alpha from luminance of the mobile icon), trimmed and centred on a square canvas. */
export async function whiteMark(size: number, padding = 0): Promise<Buffer> {
  const src = path.join(BRAND, 'qwikmart-mobile.png');
  // Blue background ≈ luminance 60, white ≈ 255 → map 95..235 to alpha 0..255 (anti-aliased edges kept).
  const alpha = await sharp(src).greyscale().linear(255 / 140, (-95 * 255) / 140).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const { width, height } = alpha.info;
  const white = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha.data, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  const trimmed = await sharp(white).trim({ threshold: 1 }).png().toBuffer();
  const inner = Math.round(size * (1 - padding * 2));
  const fitted = await sharp(trimmed).resize(inner, inner, { fit: 'contain', background: transparent }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: fitted, gravity: 'center' }]).png().toBuffer();
}

/** Full-colour mark: the left part of the website logo (up to the first transparent column gap). */
async function colourMark(): Promise<Buffer> {
  const trimmed = await sharp(path.join(BRAND, 'qwikmart-website.png')).trim({ threshold: 10 }).png().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const opaque = (x: number) => {
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 24) return true;
    return false;
  };
  let gap = -1;
  for (let x = Math.floor(info.width * 0.15), run = 0; x < info.width * 0.6; x++) {
    run = opaque(x) ? 0 : run + 1;
    if (run >= 8) { gap = x - run + 1; break; }
  }
  return sharp(trimmed).extract({ left: 0, top: 0, width: gap > 0 ? gap : Math.round(info.height * 1.5), height: info.height })
    .trim({ threshold: 10 }).png().toBuffer();
}

export function wordmarkSvg(text: string, height: number, fill: string, sub?: string): { svg: Buffer; width: number } {
  const bold = opentype.loadSync(path.join(HERE, 'fonts/PlusJakartaSans-ExtraBold.ttf'));
  const semi = opentype.loadSync(path.join(HERE, 'fonts/PlusJakartaSans-SemiBold.ttf'));
  const size = height * (sub ? 0.56 : 0.78);
  const p = bold.getPath(text, 0, 0, size);
  const b = p.getBoundingBox();
  const sp = sub ? semi.getPath(sub, 0, 0, height * 0.2, { letterSpacing: 0.18 }) : null;
  const sb = sp?.getBoundingBox();
  const width = Math.ceil(Math.max(b.x2 - b.x1, sb ? sb.x2 - sb.x1 : 0) + 6);
  const y = sub ? height * 0.58 : height * 0.8;
  const body = `<path transform="translate(${(width - (b.x2 - b.x1)) / 2 - b.x1} ${y})" d="${p.toPathData(2)}" fill="${fill}"/>` +
    (sp && sb ? `<path transform="translate(${(width - (sb.x2 - sb.x1)) / 2 - sb.x1} ${height * 0.93})" d="${sp.toPathData(2)}" fill="${fill}" fill-opacity="0.85"/>` : '');
  return { svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`), width };
}

async function main() {
  // Full-colour logo.
  const logo = await sharp(path.join(BRAND, 'qwikmart-website.png')).trim({ threshold: 10 }).resize({ height: 160 }).png({ compressionLevel: 9 }).toBuffer();
  await sharp(logo).toFile(path.join(OUT, 'qwikmart-logo.png'));

  // White logo: white mark + white wordmark, same proportions as the colour logo.
  const H = 160;
  const mark = await sharp(await whiteMark(512)).trim({ threshold: 1 }).resize({ height: H }).png().toBuffer();
  const markW = (await sharp(mark).metadata()).width!;
  const word = wordmarkSvg('QwikMart', Math.round(H * 0.72), '#ffffff');
  const wordPng = await sharp(word.svg, { density: 300 }).resize({ height: Math.round(H * 0.72) }).png().toBuffer();
  const wordW = (await sharp(wordPng).metadata()).width!;
  const gapPx = Math.round(H * 0.14);
  await sharp({ create: { width: markW + gapPx + wordW, height: H, channels: 4, background: transparent } })
    .composite([{ input: mark, left: 0, top: 0 }, { input: wordPng, left: markW + gapPx, top: Math.round(H * 0.16) }])
    .png({ compressionLevel: 9 }).toFile(path.join(OUT, 'qwikmart-logo-white.png'));

  // Colour icon + white mark.
  const cm = await colourMark();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: transparent } })
    .composite([{ input: await sharp(cm).resize(460, 460, { fit: 'contain', background: transparent }).png().toBuffer(), gravity: 'center' }])
    .png().toFile(path.join(OUT, 'qwikmart-icon.png'));
  await sharp(await whiteMark(1024)).toFile(path.join(OUT, 'qwikmart-mark-white.png'));

  const files = ['qwikmart-logo.png', 'qwikmart-logo-white.png', 'qwikmart-icon.png', 'qwikmart-mark-white.png'];
  const targets = [
    path.join(ROOT, 'admin/public/images/brand'),
    path.join(ROOT, 'customer_app/assets/brand'),
    path.join(ROOT, 'delivery_app/assets/brand'),
  ];
  for (const t of targets) {
    mkdirSync(t, { recursive: true });
    for (const f of files) copyFileSync(path.join(OUT, f), path.join(t, f));
  }
  console.log('brand assets written to admin/public/images/brand, customer_app/assets/brand, delivery_app/assets/brand');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
