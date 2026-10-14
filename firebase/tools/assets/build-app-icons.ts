/**
 * Launcher icons, Play Store icons and native-splash images for both Flutter apps (QwikMart brand).
 *
 *   npx tsx assets/build-app-icons.ts        (run from firebase/tools; uses assets/brand/qwikmart-mobile.png)
 *
 * Output per app in <app>/assets/icon/ (consumed by flutter_launcher_icons + flutter_native_splash):
 *   app_icon.png             1024² full-bleed launcher icon (iOS, legacy Android, web)
 *   app_icon_foreground.png  1024² adaptive-icon foreground (flutter_launcher_icons adds a 16% inset)
 *   app_icon_monochrome.png  1024² Android 13 themed-icon layer (alpha only)
 *   app_icon_round.png       1024² legacy round icon
 *   play_store_512.png       512² Google Play listing icon (32-bit PNG, opaque)
 *   splash_logo.png          480² splash mark (shown at 120dp; xxxhdpi source)
 *   splash_android12.png     1152² Android 12+ splash icon (mark inside the 768px visible circle)
 *   splash_branding.png      wordmark shown at the bottom of the splash
 * The customer app uses the white cart-Q on brand blue; the delivery app adds a truck badge.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BLUE, whiteMark, wordmarkSvg } from './build-brand.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const BLUE_DARK = '#022C7A';
const N = 1024;

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

const blueBg = svg(N, N, `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0A4FCC"/><stop offset="0.55" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_DARK}"/>
  </linearGradient></defs><rect width="${N}" height="${N}" fill="url(#g)"/>`);

/** White disc with a brand-blue delivery truck (lucide "truck"), centred at (cx, cy). */
function truckBadge(cx: number, cy: number, r: number, holeOnly = false): string {
  const s = (r * 1.15) / 24;
  const truck = `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s})" fill="none" stroke="${holeOnly ? '#fff' : BLUE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/>
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
      <circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></g>`;
  return holeOnly ? truck : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>${truck}`;
}

/** Layer = white mark of `size` px centred at (cx, cy) [+ truck badge], on a transparent N² canvas. */
async function layer(markSize: number, cx: number, cy: number, badge?: { cx: number; cy: number; r: number }, mono = false) {
  const m = await whiteMark(markSize);
  const parts: sharp.OverlayOptions[] = [{ input: m, left: Math.round(cx - markSize / 2), top: Math.round(cy - markSize / 2) }];
  if (badge) {
    // Cut a ring around the badge so it reads as a separate sticker, then draw it.
    parts.push({ input: svg(N, N, `<circle cx="${badge.cx}" cy="${badge.cy}" r="${badge.r * 1.12}" fill="#000"/>`), blend: 'dest-out' });
    parts.push({
      input: svg(N, N, mono
        ? `<circle cx="${badge.cx}" cy="${badge.cy}" r="${badge.r}" fill="#fff"/>`
        : truckBadge(badge.cx, badge.cy, badge.r)),
    });
    if (mono) parts.push({ input: svg(N, N, truckBadge(badge.cx, badge.cy, badge.r, true).replace(/stroke="#fff"/, 'stroke="#000"')), blend: 'dest-out' });
  }
  return sharp({ create: { width: N, height: N, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
}

async function buildApp(app: 'customer_app' | 'delivery_app') {
  const out = path.join(ROOT, app, 'assets/icon');
  mkdirSync(out, { recursive: true });
  const delivery = app === 'delivery_app';

  // Full-bleed launcher icon.
  const iconLayer = delivery
    ? await layer(600, 480, 470, { cx: 745, cy: 755, r: 160 })
    : await layer(700, 512, 512);
  const icon = await sharp(blueBg).composite([{ input: iconLayer }]).flatten({ background: BLUE }).png().toBuffer();
  await sharp(icon).toFile(path.join(out, 'app_icon.png'));
  await sharp(icon).resize(512, 512).png().toFile(path.join(out, 'play_store_512.png'));
  await sharp(icon)
    .composite([{ input: svg(N, N, `<circle cx="${N / 2}" cy="${N / 2}" r="${N / 2}"/>`), blend: 'dest-in' }])
    .png().toFile(path.join(out, 'app_icon_round.png'));

  // Adaptive foreground + monochrome (the generator wraps these in a 16% inset → this canvas ≈ visible area).
  const fg = delivery ? await layer(620, 480, 470, { cx: 745, cy: 755, r: 165 }) : await layer(700, 512, 512);
  await sharp(fg).toFile(path.join(out, 'app_icon_foreground.png'));
  const mono = delivery ? await layer(620, 480, 470, { cx: 745, cy: 755, r: 165 }, true) : fg;
  await sharp(mono).toFile(path.join(out, 'app_icon_monochrome.png'));

  // Splash images (on the brand-blue splash background set in flutter_native_splash.yaml).
  await sharp(await whiteMark(480, 0.1)).toFile(path.join(out, 'splash_logo.png'));
  const a12 = await whiteMark(560);
  await sharp({ create: { width: 1152, height: 1152, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: a12, gravity: 'center' }]).png().toFile(path.join(out, 'splash_android12.png'));
  const word = wordmarkSvg('QwikMart', 200, '#ffffff', delivery ? 'DELIVERY PARTNER' : undefined);
  await sharp(word.svg, { density: 300 }).resize({ height: 200 }).png().toFile(path.join(out, 'splash_branding.png'));

  console.log(`${app}: icons + splash written to ${path.relative(ROOT, out)}`);
}

await buildApp('customer_app');
await buildApp('delivery_app');
