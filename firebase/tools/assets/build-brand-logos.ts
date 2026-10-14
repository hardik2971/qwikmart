/**
 * Brand logo tiles (400×200, white) from the logos fetched by fetch-brand-logos.ts, replacing the generated wordmark
 * tiles in assets/catalog/brands/ for every brand whose logo passed the visual check. Brands in REJECT (wrong logo,
 * product photo, nothing found) keep their wordmark tile. Credits are appended to CREDITS.md.
 *
 *   npx tsx assets/build-brand-logos.ts      (run from firebase/tools)
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, '.raw/brand-logos');
/** Checked by eye: 5 AWL (not Fortune), 6/18/33/42 product photos, 7 unrelated radio logo, 8 Marico (parent, not Saffola), 31 cluttered. */
const REJECT = new Set(['5', '6', '7', '8', '18', '31', '33', '42']);
const W = 400, H = 200, PAD_X = 44, PAD_Y = 30;

const report: Record<string, { article: string; file: string | null; source: string | null }> =
  JSON.parse(readFileSync(path.join(RAW, '_report.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

const credits: string[] = [];
let done = 0;
for (const [id, r] of Object.entries(report)) {
  if (!r.file || REJECT.has(id) || !existsSync(path.join(RAW, `${id}.png`))) continue;
  const entry = manifest.brands?.[id];
  if (!entry?.logo) continue;
  const logo = await sharp(path.join(RAW, `${id}.png`))
    .flatten({ background: '#ffffff' })
    .trim({ threshold: 12 })
    .resize(W - PAD_X * 2, H - PAD_Y * 2, { fit: 'inside' })
    .png()
    .toBuffer();
  const tile = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([{ input: logo, gravity: 'center' }])
    .webp({ quality: 90 })
    .toBuffer();
  writeFileSync(path.join(HERE, entry.logo), tile);
  credits.push(`| brand ${entry.slug} | ${r.source} | trademark of its owner (Wikipedia/Wikimedia file "${r.file}") |`);
  done++;
}
if (credits.length) {
  appendFileSync(path.join(HERE, 'CREDITS.md'), `\n## Brand logos\nLogos are trademarks of their respective owners, shown only to identify the brands the store sells.\n\n| asset | source | note |\n|---|---|---|\n${credits.join('\n')}\n`);
}
console.log(`brand logo tiles written: ${done}`);
