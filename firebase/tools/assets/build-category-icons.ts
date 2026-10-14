/**
 * Colourful 3D category-tab icons (Microsoft Fluent Emoji 3D, MIT licence) for the top-level categories, plus the
 * "All" tab icon. Sources: assets/.raw/fluent/<slug>.png (downloaded from github.com/microsoft/fluentui-emoji).
 *
 *   npx tsx assets/build-category-icons.ts      (run from firebase/tools)
 *
 * Writes assets/catalog/categories/icons/<slug>.webp (manifest categories[id].icon → categories.icon in Firestore)
 * and the "All" icon to the website and both apps.
 */
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const RAW = path.join(HERE, '.raw/fluent');
const OUT = path.join(HERE, 'catalog/categories/icons');
mkdirSync(OUT, { recursive: true });

/** top-level category slug → Fluent emoji (for credits). */
const ICONS: Record<string, string> = {
  grocery: 'Shopping cart', 'fresh-fruits-vegetables': 'Red apple', snacks: 'Popcorn', summer: 'Sun', beauty: 'Lipstick',
  pharmacy: 'Pill', kids: 'Teddy bear', electronics: 'Headphone', mobiles: 'Mobile phone', fashion: 'Dress',
  'home-kitchen': 'Couch and lamp', 'pet-care': 'Paw prints',
};

const icon = (slug: string, size: number) =>
  sharp(path.join(RAW, `${slug}.png`)).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

const manifest = JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
let n = 0;
for (const [id, c] of Object.entries<any>(manifest.categories ?? {})) {
  if (!ICONS[c.slug]) continue;
  const rel = `catalog/categories/icons/${c.slug}.webp`;
  await icon(c.slug, 160).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(HERE, rel));
  manifest.categories[id] = { ...c, icon: rel };
  n++;
}
writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2));

// "All" tab icon for the clients.
const all = await icon('all', 160).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
const allPng = await icon('all', 160).png().toBuffer();
for (const dir of ['web/public/images/icons', 'customer_app/assets/images/icons']) {
  mkdirSync(path.join(ROOT, dir), { recursive: true });
}
writeFileSync(path.join(ROOT, 'web/public/images/icons/all.webp'), all);
writeFileSync(path.join(ROOT, 'customer_app/assets/images/icons/all.png'), allPng);
copyFileSync(path.join(RAW, 'LICENSE.txt'), path.join(OUT, 'LICENSE-fluentui-emoji.txt'));

appendFileSync(path.join(HERE, 'CREDITS.md'), `\n## Category tab icons\nMicrosoft Fluent Emoji 3D (https://github.com/microsoft/fluentui-emoji), MIT licence: ${Object.entries(ICONS).map(([s, e]) => `${s} = ${e}`).join(', ')}, all = Shopping bags.\n`);
console.log(`category icons: ${n} (+ All)`);
