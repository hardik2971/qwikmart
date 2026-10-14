/**
 * Verifies a migration run: Firestore counts vs MySQL, spot checks, demo logins.
 *
 *   npx tsx verify-migration.ts            # against the emulators (default)
 *   npx tsx verify-migration.ts --prod --yes-i-mean-production   # read-only checks against the real project
 *
 * Exit code 1 when any check fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initFirebase, num, openMysql, parseArgs, PROJECT_ID, rows } from './lib/common.js';

const MANIFEST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'manifest.json');

const args = parseArgs();
const fb = initFirebase(args);
const { db } = fb;

let failed = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

const DEMO_LOGINS: [string, string, string][] = [
  ['admin@gmail.com', '123456', 'admin'],
  ['mumbai@store.com', 'Mumbai@1', 'store'],
  ['alex@gmail.com', 'Alex@1234', 'delivery_boy'],
  ['customer@gmail.com', '123456', 'customer'],
];

async function count(path: string, group = false) {
  const q = group ? db.collectionGroup(path) : db.collection(path);
  return (await q.count().get()).data().count;
}

async function main() {
  const conn = await openMysql();
  const one = async (sql: string) => Number(Object.values((await rows<any>(conn, sql))[0])[0]);

  // ---------------------------------------------------------------- counts
  console.log('\n== Counts (Firestore vs MySQL) ==');
  const liveUser = 'user_id IN (SELECT id FROM users WHERE deleted_at IS NULL)';
  const liveProductVariant = 'product_variant_id IN (SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.deleted_at IS NULL)';
  const checks: [string, boolean, string][] = [
    ['countries', false, 'SELECT COUNT(*) FROM countries'],
    ['zones', false, 'SELECT COUNT(*) FROM zones'],
    ['stores', false, 'SELECT COUNT(*) FROM stores'],
    ['languages', false, 'SELECT COUNT(*) FROM languages'],
    ['translations', false, 'SELECT COUNT(*) FROM translations'],
    ['roles', false, 'SELECT COUNT(*) FROM roles'],
    ['users', false, 'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'],
    ['addresses', true, `SELECT COUNT(*) FROM addresses WHERE ${liveUser}`],
    ['notifications', true, `SELECT (SELECT COUNT(*) FROM user_notifications WHERE ${liveUser}) + (SELECT COUNT(*) FROM notifications)`],
    ['wallet_transactions', true, `SELECT COUNT(*) FROM wallet_transactions WHERE ${liveUser}`],
    ['favorites', true, `SELECT COUNT(*) FROM favorites WHERE ${liveUser} AND product_id IN (SELECT id FROM products WHERE deleted_at IS NULL)`],
    ['cart', true, `SELECT COUNT(DISTINCT user_id, mode, IFNULL(store_id,0), product_variant_id) FROM carts WHERE ${liveUser} AND ${liveProductVariant}`],
    ['delivery_boys', false, 'SELECT COUNT(*) FROM delivery_boys WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NULL)'],
    ['categories', false, 'SELECT COUNT(*) FROM categories'],
    ['brands', false, 'SELECT COUNT(*) FROM brands'],
    ['attributes', false, 'SELECT COUNT(*) FROM attributes'],
    ['taxes', false, 'SELECT COUNT(*) FROM taxes'],
    ['products', false, 'SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'],
    ['store_stocks', false, `SELECT COUNT(*) FROM store_stocks WHERE ${liveProductVariant}`],
    ['reviews', false, 'SELECT COUNT(*) FROM reviews'],
    ['banners', false, 'SELECT COUNT(*) FROM banners'],
    ['home_layouts', false, 'SELECT COUNT(*) FROM home_layouts'],
    ['home_layout_drafts', false, 'SELECT COUNT(*) FROM home_layouts'],
    ['promo_codes', false, 'SELECT COUNT(*) FROM promo_codes'],
    ['orders', false, 'SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL'],
    ['secret', true, 'SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL'],
    ['return_requests', false, 'SELECT COUNT(*) FROM return_requests'],
    ['withdrawal_requests', false, 'SELECT COUNT(*) FROM withdrawal_requests'],
    ['cash_collections', false, 'SELECT COUNT(*) FROM cash_collections'],
    ['delivery_earnings', false, 'SELECT COUNT(*) FROM delivery_boy_earnings'],
    ['referrals', false, 'SELECT COUNT(*) FROM referrals'],
    ['chats', false, 'SELECT COUNT(*) FROM chats'],
    ['messages', true, 'SELECT COUNT(*) FROM chat_messages'],
    ['blogs', false, 'SELECT COUNT(*) FROM blogs'],
    ['blog_categories', false, 'SELECT COUNT(*) FROM blog_categories'],
    ['faqs', false, 'SELECT COUNT(*) FROM faqs'],
    ['pages', false, 'SELECT COUNT(*) FROM pages'],
    ['email_templates', false, 'SELECT COUNT(*) FROM email_templates'],
    ['mail_log', false, 'SELECT COUNT(*) FROM email_logs'],
  ];
  for (const [coll, group, sql] of checks) {
    const [fs, my] = [await count(coll, group), await one(sql)];
    ok(fs === my, `${(group ? '**/' : '') + coll}`.padEnd(26) + ` firestore=${fs} mysql=${my}`);
  }
  const settingsDocs = (await db.collection('settings').listDocuments()).map((d) => d.id).sort();
  ok(
    ['private_ai', 'private_payment', 'private_sms', 'private_smtp', 'public'].every((k) => settingsDocs.includes(k)),
    'settings docs',
    settingsDocs.join(','),
  );
  const smtpDoc = (await db.doc('settings/private_smtp').get()).data() ?? {};
  ok(!Object.keys(smtpDoc).some((k) => k.startsWith('mail_')) && 'host' in smtpDoc && 'from_email' in smtpDoc, 'settings/private_smtp uses canonical keys', Object.keys(smtpDoc).sort().join(','));
  const smsDoc = (await db.doc('settings/private_sms').get()).data() ?? {};
  ok('gateway' in smsDoc && !('sms_gateway' in smsDoc), 'settings/private_sms uses canonical keys', String(smsDoc.gateway));
  const secretInPublic = Object.keys((await db.doc('settings/public').get()).data() ?? {}).filter((k) => /secret|password|api_key|salt|token/i.test(k));
  ok(secretInPublic.length === 0, 'settings/public has no secret keys', secretInPublic.join(','));

  // ---------------------------------------------------------------- counters
  const maxOrder = (await rows<any>(conn, "SELECT MAX(CAST(SUBSTRING_INDEX(order_number,'-',-1) AS UNSIGNED)) m FROM orders"))[0].m;
  const maxRet = (await rows<any>(conn, "SELECT MAX(CAST(SUBSTRING_INDEX(return_number,'-',-1) AS UNSIGNED)) m FROM return_requests"))[0].m;
  ok((await db.doc('counters/orders').get()).get('value') === Number(maxOrder), 'counters/orders', `value=${maxOrder}`);
  ok((await db.doc('counters/returns').get()).get('value') === Number(maxRet), 'counters/returns', `value=${maxRet}`);

  // ---------------------------------------------------------------- spot checks
  console.log('\n== Spot checks ==');
  // catalog images (assets/manifest.json): no placehold.co URLs left where the manifest provides a file
  if (existsSync(MANIFEST) && !process.argv.includes('--no-catalog-images')) {
    const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const ph = (u: unknown) => typeof u !== 'string' || !u || u.includes('placehold.co');
    const docs = async (col: string) => (await db.collection(col).get()).docs;
    const bad: string[] = [];
    for (const d of await docs('products')) if (man.products?.[d.id] && (ph(d.get('thumbnail')) || !(d.get('images') ?? []).length || (d.get('images') as unknown[]).some(ph))) bad.push(`products/${d.id}`);
    for (const d of await docs('categories')) if (man.categories?.[d.id]?.image && (ph(d.get('image')) || ph(d.get('icon')))) bad.push(`categories/${d.id}`);
    for (const d of await docs('brands')) if (man.brands?.[d.id] && ph(d.get('logo'))) bad.push(`brands/${d.id}`);
    for (const d of await docs('banners')) if (man.banners?.[d.id] && ph(d.get('image'))) bad.push(`banners/${d.id}`);
    for (const d of await docs('blogs')) if (man.blogs?.[d.id] && ph(d.get('image'))) bad.push(`blogs/${d.id}`);
    for (const d of await docs('stores')) if (man.stores?.[d.id] && (ph(d.get('logo')) || ph(d.get('banner')))) bad.push(`stores/${d.id}`);
    for (const d of await docs('home_layouts')) if (JSON.stringify(d.get('published_sections') ?? []).includes('placehold.co')) bad.push(`home_layouts/${d.id}`);
    ok(bad.length === 0, 'catalog images from assets/manifest.json (no placehold.co left)', bad.length ? bad.slice(0, 8).join(', ') : 'products, categories, brands, banners, blogs, stores, home_layouts');
    if (!args.prod) {
      const sample = (await db.doc(`products/${Object.keys(man.products ?? {})[0]}`).get()).get('thumbnail');
      const res = sample ? await fetch(sample).catch(() => null) : null;
      ok(!!res?.ok && /image\//.test(res.headers.get('content-type') ?? ''), 'product thumbnail downloads from Storage', `${res?.status} ${res?.headers.get('content-type')} ${String(sample).slice(0, 90)}`);
    }
  }
  // product with variants
  const [pv] = await rows<any>(
    conn,
    `SELECT p.id, COUNT(v.id) n, MIN(COALESCE(LEAST(v.sale_price, v.price), v.price)) mp FROM products p JOIN product_variants v ON v.product_id=p.id AND v.status=1
     WHERE p.deleted_at IS NULL AND p.product_type='variable' GROUP BY p.id HAVING n > 1 ORDER BY p.id LIMIT 1`,
  );
  const pdoc = (await db.doc(`products/${pv.id}`).get()).data()!;
  const allVariants = await one(`SELECT COUNT(*) FROM product_variants WHERE product_id=${pv.id}`);
  ok(pdoc.variants.length === allVariants, `products/${pv.id} variants embedded`, `${pdoc.variants.length} variants`);
  ok(pdoc.variants.every((v: any) => typeof v.attrs === 'object' && typeof v.id === 'string'), `products/${pv.id} variants have attrs map + string id`, JSON.stringify(pdoc.variants[0].attrs));
  ok(num(pdoc.min_price) === num(pv.mp), `products/${pv.id} min_price`, `${pdoc.min_price} vs ${pv.mp}`);
  ok(Array.isArray(pdoc.category_ids) && pdoc.category_ids.includes(pdoc.category_id), `products/${pv.id} category_ids`, pdoc.category_ids.join(','));
  ok(typeof pdoc.name === 'object' && !!pdoc.name.en, `products/${pv.id} name is translatable map`, JSON.stringify(pdoc.name));
  ok(Array.isArray(pdoc.search_keywords) && pdoc.search_keywords.length > 0, `products/${pv.id} search_keywords`, `${pdoc.search_keywords.length} keywords`);
  const relCount = await one(`SELECT COUNT(*) FROM product_relations r JOIN products p ON p.id=r.related_product_id AND p.deleted_at IS NULL WHERE r.product_id=${pv.id}`);
  ok(pdoc.cross_sell_ids.length + pdoc.up_sell_ids.length === relCount, `products/${pv.id} cross/up-sell ids`, `${pdoc.cross_sell_ids.length}+${pdoc.up_sell_ids.length}`);
  const inStock = (await rows<any>(conn, `SELECT DISTINCT s.store_id FROM store_stocks s JOIN product_variants v ON v.id=s.product_variant_id AND v.status=1 WHERE v.product_id=${pv.id} AND s.stock>0 ORDER BY s.store_id`)).map((r) => String(r.store_id));
  ok(JSON.stringify([...pdoc.in_stock_store_ids].sort()) === JSON.stringify(inStock.sort()), `products/${pv.id} in_stock_store_ids`, pdoc.in_stock_store_ids.join(','));
  const sold = await one(`SELECT COALESCE(SUM(i.qty),0) FROM order_items i JOIN orders o ON o.id=i.order_id AND o.deleted_at IS NULL AND o.status NOT IN ('payment_pending','cancelled','returned') WHERE i.product_id=${pv.id}`);
  ok(pdoc.sold_count === sold, `products/${pv.id} sold_count`, `${pdoc.sold_count} vs ${sold}`);

  // order with items + timeline + OTP
  const [ord] = await rows<any>(
    conn,
    `SELECT o.* FROM orders o WHERE o.deleted_at IS NULL AND o.delivery_otp IS NOT NULL AND o.delivery_boy_id IS NOT NULL
       AND (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) > 1 ORDER BY o.id LIMIT 1`,
  );
  const odoc = (await db.doc(`orders/${ord.id}`).get()).data()!;
  const itemCount = await one(`SELECT COUNT(*) FROM order_items WHERE order_id=${ord.id}`);
  const histCount = await one(`SELECT COUNT(*) FROM order_status_histories WHERE order_id=${ord.id}`);
  ok(odoc.order_number === ord.order_number, `orders/${ord.id} order_number`, odoc.order_number);
  ok(odoc.items.length === itemCount, `orders/${ord.id} items embedded`, `${odoc.items.length}`);
  ok(odoc.timeline.length === histCount && odoc.timeline.every((t: any) => t.status && t.label && t.at), `orders/${ord.id} timeline`, odoc.timeline.map((t: any) => t.status).join('>'));
  ok(num(odoc.totals.grand_total) === num(num(ord.total) + num(ord.wallet_used)) && num(odoc.totals.total) === num(ord.total), `orders/${ord.id} totals`, JSON.stringify(odoc.totals));
  ok(!!odoc.customer?.name && typeof odoc.user_id === 'string', `orders/${ord.id} customer snapshot`, JSON.stringify(odoc.customer));
  ok(!!odoc.delivery_boy?.name && typeof odoc.delivery_boy_id === 'string', `orders/${ord.id} delivery_boy snapshot`, `${odoc.delivery_boy_id} ${JSON.stringify(odoc.delivery_boy)}`);
  const rider = (await db.doc(`delivery_boys/${odoc.delivery_boy_id}`).get()).exists;
  ok(rider, `orders/${ord.id} delivery_boy_id resolves to delivery_boys/{uid}`);
  const otp = (await db.doc(`orders/${ord.id}/secret/otp`).get()).get('delivery_otp');
  ok(otp === ord.delivery_otp, `orders/${ord.id}/secret/otp`, `otp=${otp}`);
  ok(!('delivery_otp' in odoc), `orders/${ord.id} main doc has no OTP`);

  // wallet balance == last ledger balance_after
  const [wu] = await rows<any>(
    conn,
    `SELECT u.id, u.firebase_uid, u.wallet_balance FROM users u WHERE u.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.user_id=u.id) ORDER BY (u.email='customer@gmail.com') DESC, u.id LIMIT 1`,
  );
  const wuid = wu.firebase_uid || `user_${wu.id}`;
  const udoc = (await db.doc(`users/${wuid}`).get()).data()!;
  const lastTx = await db.collection(`users/${wuid}/wallet_transactions`).orderBy('created_at', 'desc').get();
  // ties on created_at are broken by the MySQL id (doc id)
  const last = lastTx.docs
    .map((d) => ({ id: Number(d.id), at: d.get('created_at').toMillis(), bal: d.get('balance_after') }))
    .sort((a, b) => b.at - a.at || b.id - a.id)[0];
  ok(num(udoc.wallet_balance) === num(last.bal) && num(udoc.wallet_balance) === num(wu.wallet_balance), `users/${wuid} wallet_balance == last ledger balance_after`, `${udoc.wallet_balance} / ${last.bal} / mysql ${wu.wallet_balance}`);
  const mismatched = await one(
    `SELECT COUNT(*) FROM users u WHERE u.deleted_at IS NULL AND EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.user_id=u.id)
       AND u.wallet_balance <> (SELECT w.balance_after FROM wallet_transactions w WHERE w.user_id=u.id ORDER BY w.created_at DESC, w.id DESC LIMIT 1)`,
  );
  console.log(`INFO  MySQL users whose wallet_balance != last ledger balance_after: ${mismatched} (migrated as-is)`);

  // stats_daily (spec §8): revenue == Σ grand_total over orders NOT in payment_pending|cancelled|returned
  const REV = "deleted_at IS NULL AND status NOT IN ('payment_pending','cancelled','returned')";
  const statsAll = await db.collection('stats_daily').where('scope', '==', 'all').get();
  const fsRevenue = num(statsAll.docs.reduce((a, d) => a + d.get('revenue'), 0));
  const myRevenue = num((await rows<any>(conn, `SELECT SUM(total + wallet_used) s FROM orders WHERE ${REV}`))[0].s);
  ok(fsRevenue === myRevenue, 'stats_daily(all) Σrevenue == Σ grand_total (non-revenue statuses excluded)', `${fsRevenue} vs ${myRevenue}`);
  const fsOrders = statsAll.docs.reduce((a, d) => a + d.get('orders'), 0);
  const myOrders = await one("SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status <> 'payment_pending'");
  ok(fsOrders === myOrders, 'stats_daily(all) Σorders', `${fsOrders} vs ${myOrders}`);
  // Cross-check per day / per hour against Laravel DashboardService-style SQL (revenue(), unitsSold(); created_at is
  // stored as Asia/Kolkata wall clock, so DATE()/HOUR() are IST buckets).
  const dayRows = await rows<any>(
    conn,
    `SELECT DATE_FORMAT(created_at,'%Y-%m-%d') d, SUM(total + wallet_used) rev, SUM(tax_amount) tax, SUM(delivery_charge) dc FROM orders WHERE ${REV} GROUP BY d`,
  );
  const unitRows = await rows<any>(
    conn,
    `SELECT DATE_FORMAT(o.created_at,'%Y-%m-%d') d, SUM(i.qty) u FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.${REV.replace('status', 'o.status')} GROUP BY d`,
  );
  const fsByDay = new Map(statsAll.docs.map((d) => [d.get('date'), d.data()]));
  const unitsByDay = new Map(unitRows.map((r) => [r.d, Number(r.u)]));
  const badDays = dayRows.filter((r) => {
    const s = fsByDay.get(r.d);
    return !s || num(s.revenue) !== num(r.rev) || num(s.tax) !== num(r.tax) || num(s.delivery_charges) !== num(r.dc) || s.units !== (unitsByDay.get(r.d) ?? 0);
  });
  ok(badDays.length === 0, 'stats_daily(all) per-day revenue/tax/delivery/units == Laravel dashboard SQL', `${dayRows.length} days, mismatches: ${badDays.map((r) => r.d).join(',') || 'none'}`);
  const hourRows = await rows<any>(conn, `SELECT HOUR(created_at) h, SUM(total + wallet_used) rev FROM orders WHERE ${REV} GROUP BY h`);
  const fsHour = new Map<number, number>();
  for (const d of statsAll.docs) for (const [h, b] of Object.entries(d.get('by_hour') as Record<string, any>)) fsHour.set(Number(h), num((fsHour.get(Number(h)) ?? 0) + b.revenue));
  ok(hourRows.every((r) => num(fsHour.get(Number(r.h)) ?? 0) === num(r.rev)), 'stats_daily(all) by_hour revenue == SQL HOUR() buckets');
  const modeRows = await rows<any>(conn, `SELECT mode, SUM(total + wallet_used) rev FROM orders WHERE ${REV} GROUP BY mode`);
  const fsMode = (m: string) => num(statsAll.docs.reduce((a, d) => a + (d.get('by_mode')?.[m]?.revenue ?? 0), 0));
  ok(modeRows.every((r) => fsMode(r.mode) === num(r.rev)), 'stats_daily(all) by_mode revenue == SQL', modeRows.map((r) => `${r.mode}=${num(r.rev)}`).join(' '));
  const storeStats = await db.collection('stats_daily').where('scope', '==', 'store_1').get();
  const myStore1 = num((await rows<any>(conn, `SELECT SUM(total + wallet_used) s FROM orders WHERE ${REV} AND store_id=1`))[0].s);
  ok(num(storeStats.docs.reduce((a, d) => a + d.get('revenue'), 0)) === myStore1, 'stats_daily(store_1) Σrevenue', `${myStore1}`);
  const store1 = (await db.doc('stores/1').get()).data()!;
  ok(num(store1.revenue) === myStore1, 'stores/1 revenue counter', `${store1.revenue}`);

  // home layout ids remapped to strings
  const hl = (await db.doc('home_layouts/1_quick_all').get()).data();
  const hld = (await db.doc('home_layout_drafts/1_quick_all').get()).data();
  ok(!!hl && !('draft_sections' in hl) && Array.isArray(hld?.draft_sections), 'home_layouts holds published data only; draft in home_layout_drafts');
  const bs = hl?.published_sections?.find((s: any) => s.type === 'banner_slider') ?? hld?.draft_sections?.find((s: any) => s.type === 'banner_slider');
  ok(!!hl && Array.isArray(bs?.settings?.banner_ids) && bs.settings.banner_ids.every((x: unknown) => typeof x === 'string'), 'home_layouts/1_quick_all section ids are strings', JSON.stringify(bs?.settings?.banner_ids));
  const zone1 = (await db.doc('zones/1').get()).data();
  ok(!!zone1?.default_store_id && zone1.polygon.length > 2 && !!zone1.center, 'zones/1 default_store_id + polygon + center', `store=${zone1?.default_store_id}`);

  // ---------------------------------------------------------------- auth
  console.log('\n== Auth ==');
  const liveUsers = await one('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
  let authCount = 0;
  let pageToken: string | undefined;
  do {
    const page = await fb.auth.listUsers(1000, pageToken);
    authCount += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  ok(authCount === liveUsers, 'Auth user count', `auth=${authCount} mysql(live)=${liveUsers}`);
  const admin = await fb.auth.getUserByEmail('admin@gmail.com');
  ok(admin.customClaims?.role === 'admin', 'admin custom claims', JSON.stringify(admin.customClaims));
  const alex = await fb.auth.getUserByEmail('alex@gmail.com');
  ok(alex.customClaims?.role === 'delivery_boy' && !!alex.customClaims?.zone_id, 'rider custom claims include zone_id', JSON.stringify(alex.customClaims));
  const store = await fb.auth.getUserByEmail('mumbai@store.com');
  ok(store.customClaims?.role === 'store' && store.customClaims?.store_id === '1', 'store custom claims include store_id', JSON.stringify(store.customClaims));
  // store staff are role 'store' + store_id + role_id (never platform 'staff' with a store)
  const staffWithStore = (await db.collection('users').where('type', '==', 'staff').get()).docs.filter((d) => d.get('store_id'));
  ok(staffWithStore.length === 0, 'no platform staff bound to a store', staffWithStore.map((d) => d.id).join(','));
  const storeStaff = await fb.auth.getUserByEmail('staff@mumbaistore.com').catch(() => null);
  if (storeStaff) ok(storeStaff.customClaims?.role === 'store' && !!storeStaff.customClaims?.store_id && !!storeStaff.customClaims?.role_id, 'store staff claims are role store + store_id + role_id', JSON.stringify(storeStaff.customClaims));

  if (fb.emulator) {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    for (const [email, password, role] of DEMO_LOGINS) {
      const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const body: any = await res.json();
      let claimRole: string | undefined;
      if (body.idToken) claimRole = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString()).role;
      ok(res.ok && claimRole === role, `login ${email}`, res.ok ? `uid=${body.localId} role=${claimRole}` : body.error?.message);
    }
    const bad = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@gmail.com', password: 'wrong-password', returnSecureToken: true }),
    });
    ok(!bad.ok, 'wrong password is rejected');
    // The imported BCRYPT hash itself (what production verifies) — checked offline against the demo passwords.
    const bcrypt = (await import('bcryptjs')).default;
    for (const [email, password] of DEMO_LOGINS) {
      const [u] = await rows<any>(conn, 'SELECT password FROM users WHERE email=?', [email]);
      ok(await bcrypt.compare(password, String(u.password).replace(/^\$2y\$/, '$2a$')), `BCRYPT hash ($2y$->$2a$) verifies for ${email}`);
    }
  } else {
    console.log(`SKIP  password logins (production: use the web API key of ${PROJECT_ID} manually)`);
  }

  await conn.end();
  console.log(`\n${failed ? `${failed} check(s) FAILED` : 'All checks passed'}.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e);
  process.exit(1);
});
