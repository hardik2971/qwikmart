/**
 * Writes the CMS pages in content/cms-pages.ts to Firestore pages/{slug}, filling {{…}} from settings/public.
 *   npx tsx update-cms-pages.ts                       # dry run: prints what would be written
 *   npx tsx update-cms-pages.ts --prod --yes          # writes to the live project (service-account.json)
 * The previous documents are saved to content/backup-pages-<timestamp>.json before writing.
 * Only `en` content is written; the website/apps fall back to English for other languages.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { PAGES } from './content/cms-pages';

const args = new Set(process.argv.slice(2));
const write = args.has('--prod') && args.has('--yes');

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'))) });
const db = getFirestore();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

(async () => {
  const s = (await db.doc('settings/public').get()).data() ?? {};
  const phone = String(s.support?.phone ?? '');
  const vars: Record<string, string> = {
    app: String(s.app_name ?? 'QwikMart'),
    company: String(s.company?.name ?? 'QwikMart Retail Pvt. Ltd.'),
    address: String(s.company?.address ?? ''),
    gstin: String(s.company?.gstin ?? '—'),
    email: String(s.support?.email ?? 'support@qwikmart.app'),
    phone,
    phone_tel: phone.replace(/[^\d+]/g, ''),
    cod_max: Number(s.cod?.max_amount ?? 10000).toLocaleString('en-IN'),
    wallet_min: String(s.wallet?.min_recharge ?? 100),
    wallet_max: Number(s.wallet?.max_recharge ?? 10000).toLocaleString('en-IN'),
    withdraw_min: String(s.wallet?.min_withdraw ?? 100),
    ref_min: String(s.referral?.min_order ?? 199),
    ref_referrer: String(s.referral?.referrer_reward ?? 50),
    ref_referred: String(s.referral?.referred_reward ?? 25),
  };
  const fill = (html: string) =>
    html.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}}`);
      return esc(vars[k]);
    }).replace(/\n\s*/g, '\n').trim();

  const backup: Record<string, unknown> = {};
  for (const slug of Object.keys(PAGES)) {
    const snap = await db.doc(`pages/${slug}`).get();
    if (snap.exists) backup[slug] = snap.data();
  }

  if (write) {
    const file = new URL(`./content/backup-pages-${Date.now()}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log('Backup of previous pages:', file.pathname);
  }

  for (const [slug, p] of Object.entries(PAGES)) {
    const html = fill(p.html);
    console.log(`${write ? 'WRITE' : 'DRY  '} pages/${slug}  "${p.title.en}"  ${html.length} chars${backup[slug] ? '' : '  (new)'}`);
    if (!write) continue;
    await db.doc(`pages/${slug}`).set(
      { slug, title: p.title, content: { en: html }, status: 'active', updated_at: FieldValue.serverTimestamp() },
      // mergeFields replaces content/title entirely (stale hi/ar copies are dropped) and keeps any other fields
      { mergeFields: ['slug', 'title', 'content', 'status', 'updated_at'] },
    );
  }
  if (!write) console.log('\nDry run only. Re-run with --prod --yes to write to the live project.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
