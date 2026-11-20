/**
 * Writes the CMS pages in content/cms-pages.ts to Firestore pages/{slug}, filling {{…}} from settings/public.
 *   npx tsx update-cms-pages.ts                                  # dry run: prints what would be written
 *   npx tsx update-cms-pages.ts --prod --yes                     # writes every page to the live project
 *   npx tsx update-cms-pages.ts --only=privacy,delete-account    # limit to these slugs (dry run or write)
 *   npx tsx update-cms-pages.ts --key=<service-account.json>     # another project (default: the live project's key)
 * Default key: ../../secret/qwikmart-infidec-firebase.json (project qwikmart-infidec, see .firebaserc).
 * The previous documents are saved to content/backup-pages-<timestamp>.json before writing.
 * Only `en` content is written; the website/apps fall back to English for other languages.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { PAGES } from './content/cms-pages';

const argv = process.argv.slice(2);
const args = new Set(argv);
const opt = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const write = args.has('--prod') && args.has('--yes');
const only = opt('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const keyPath = opt('key') ?? new URL('../../secret/qwikmart-infidec-firebase.json', import.meta.url);

const key = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(key), projectId: key.project_id });
const db = getFirestore();
const slugs = Object.keys(PAGES).filter((s) => !only || only.includes(s));
if (only) for (const s of only) if (!(s in PAGES)) throw new Error(`Unknown page "${s}". Pages: ${Object.keys(PAGES).join(', ')}`);
console.log(`Project: ${key.project_id}${write ? '  (WRITING)' : '  (dry run)'}  ·  pages: ${slugs.join(', ')}\n`);

// payment_methods keys → names shown in the policies ("Razorpay and Stripe")
const GATEWAYS: Record<string, string> = {
  razorpay: 'Razorpay', stripe: 'Stripe', paypal: 'PayPal', cashfree: 'Cashfree', phonepe: 'PhonePe', paytabs: 'PayTabs', midtrans: 'Midtrans', paystack: 'Paystack',
};
const listJoin = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

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
    payment_partners: listJoin(((s.payment_methods ?? []) as { key?: string; enabled?: boolean }[])
      .filter((m) => m?.enabled && m.key && GATEWAYS[m.key]).map((m) => GATEWAYS[m.key!])) || 'our payment gateway',
  };
  const fill = (html: string) =>
    html.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}}`);
      return esc(vars[k]);
    }).replace(/\n\s*/g, '\n').trim();

  const backup: Record<string, unknown> = {};
  for (const slug of slugs) {
    const snap = await db.doc(`pages/${slug}`).get();
    if (snap.exists) backup[slug] = snap.data();
  }

  if (write) {
    const file = new URL(`./content/backup-pages-${Date.now()}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log('Backup of previous pages:', file.pathname);
  }

  for (const slug of slugs) {
    const p = PAGES[slug];
    const html = fill(p.html);
    console.log(`${write ? 'WRITE' : 'DRY  '} pages/${slug}  "${p.title.en}"  ${html.length} chars${backup[slug] ? '' : '  (new)'}`);
    if (!write) continue;
    await db.doc(`pages/${slug}`).set(
      { slug, title: p.title, content: { en: html }, status: 'active', updated_at: FieldValue.serverTimestamp() },
      // mergeFields replaces content/title entirely (stale hi/ar copies are dropped) and keeps any other fields
      { mergeFields: ['slug', 'title', 'content', 'status', 'updated_at'] },
    );
  }
  if (!write) console.log(`\nDry run only. Re-run with --prod --yes to write to project ${key.project_id}.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
