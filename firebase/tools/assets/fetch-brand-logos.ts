/**
 * Downloads brand logos (the infobox image of each brand's Wikipedia article, rendered to PNG) into
 * assets/.raw/brand-logos/<brandId>.png, plus _report.json with the source page of every file.
 *
 *   npx tsx assets/fetch-brand-logos.ts [--only=2,3]      (run from firebase/tools)
 *
 * Results are checked by eye (contact sheet) before build-brand-logos.ts uses them; anything rejected is listed in
 * REJECT there and keeps the generated wordmark tile. Logos are trademarks of their owners and are shown only to
 * identify products the store sells.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.raw/brand-logos');
mkdirSync(OUT, { recursive: true });
const UA = 'QwikMartCatalogBuilder/1.0 (https://github.com; catalog image builder)';

/** MySQL brand id → English Wikipedia article whose infobox image is the brand logo. */
export const ARTICLES: Record<string, string> = {
  2: 'Amul', 3: 'Mother Dairy', 4: 'Tata Consumer Products', 5: 'Adani Wilmar', 6: 'Aashirvaad', 7: 'KRBL',
  8: 'Saffola', 9: 'Happilo', 10: 'Everest Spices', 11: "Lay's", 12: 'Pringles', 13: "Haldiram's", 14: 'Bikaji Foods',
  15: 'Balaji Wafers', 16: 'Britannia Industries', 17: 'Parle Products', 18: 'Oreo', 19: 'Maggi', 20: 'Coca-Cola',
  21: 'Tropicana Products', 22: 'Red Bull', 23: "Kwality Wall's", 24: 'Lakmé Cosmetics', 25: 'Nivea', 26: 'Dove (brand)',
  27: 'Mamaearth', 28: 'Dettol', 29: 'Dabur', 30: 'Band-Aid', 31: 'Volini', 32: 'Pampers', 33: "Johnson's Baby",
  34: 'Lego', 35: 'Boat (company)', 36: 'Xiaomi', 37: 'Philips', 38: 'Samsung', 39: 'Apple Inc.',
  40: 'Levi Strauss & Co.', 41: 'Puma (brand)', 42: 'Vim (cleaning product)', 43: 'Surf (detergent)', 44: 'TTK Prestige',
  45: 'Harpic', 46: 'Pedigree Petfoods', 47: 'Whiskas',
};

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt < 5) {
    await sleep(4000 * (attempt + 1));
    return get(url, attempt + 1);
  }
  return res;
}

const reportFile = path.join(OUT, '_report.json');
const report: Record<string, { article: string; file: string | null; source: string | null }> =
  existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};

for (const [id, article] of Object.entries(ARTICLES)) {
  if (only && !only.includes(id)) continue;
  const params = new URLSearchParams({
    action: 'query', format: 'json', redirects: '1', titles: article,
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: '640', pilicense: 'any',
  });
  const res = await get(`https://en.wikipedia.org/w/api.php?${params}`);
  const j: any = res.ok ? await res.json() : null;
  const page: any = j ? Object.values(j.query?.pages ?? {})[0] : null;
  const thumb = page?.thumbnail?.source as string | undefined;
  let file: string | null = null;
  if (thumb) {
    const img = await get(thumb);
    if (img.ok) {
      writeFileSync(path.join(OUT, `${id}.png`), Buffer.from(await img.arrayBuffer()));
      file = page.pageimage;
    }
  }
  report[id] = { article, file, source: file ? `https://en.wikipedia.org/wiki/File:${encodeURIComponent(file)}` : null };
  console.log(`${id.padStart(2)} ${article.padEnd(26)} ${file ?? '— no image'}`);
  await sleep(1200);
}
writeFileSync(reportFile, JSON.stringify(report, null, 2));
