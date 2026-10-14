/**
 * QwikMart one-time migration: MySQL (Laravel) -> Firebase (Firestore + Auth + Storage).
 * Binding spec: docs/FIREBASE_BACKEND.md §3 (collections) and §7 (migration).
 *
 *   npx tsx migrate-from-mysql.ts                      # everything -> emulators (default)
 *   npx tsx migrate-from-mysql.ts --dry-run            # read + map only, print counts, write nothing
 *   npx tsx migrate-from-mysql.ts --only=products,orders
 *   npx tsx migrate-from-mysql.ts --skip-storage       # keep relative paths, no uploads
 *   npx tsx migrate-from-mysql.ts --prod --yes-i-mean-production   # REAL project (needs GOOGLE_APPLICATION_CREDENTIALS)
 *       [--demo-accounts=keep|disable|reset-passwords]   # prod default: disable (accounts with known demo passwords import disabled); demo_mode is forced false
 *
 * MySQL is only read (session is READ ONLY). Every Firestore write is a full set() -> re-runnable.
 * ID strategy: MySQL ids become string doc ids, except users (Firebase uid), delivery_boys (rider uid),
 * languages ({code}), translations ({code}_{platform}), pages ({slug}), email_templates ({key}),
 * store_stocks ({storeId}_{variantId}), home_layouts ({zoneId}_{mode}_{categoryId|'all'}), settings, counters, stats_daily.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { FieldValue, type BulkWriter, type DocumentData } from 'firebase-admin/firestore';
import type { UserImportRecord } from 'firebase-admin/auth';
import {
  activeStatus,
  bool,
  bucket,
  dayHour,
  e164,
  initFirebase,
  json,
  log,
  num,
  numOrNull,
  openMysql,
  parseArgs,
  rows,
  searchKeywords,
  sid,
  slugify,
  stableToken,
  tr,
  trEn,
  ts,
  type Fb,

} from './lib/common.js';
import { addOrderToStats, isRevenueStatus, type StatsDoc } from './lib/stats.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Files uploaded through the old Laravel panels (copied from backend/ before it was removed).
const BACKEND = path.resolve(HERE, 'legacy-files');

/** Step names accepted by --only (= Firestore collection names, plus `auth`). */
export const STEPS = [
  'settings', 'countries', 'zones', 'stores', 'languages', 'translations', 'roles',
  'auth', 'users', 'addresses', 'cart', 'favorites', 'user_notifications', 'wallet_transactions', 'delivery_boys',
  'categories', 'brands', 'attributes', 'taxes', 'products', 'store_stocks', 'reviews', 'banners', 'home_layouts', 'promo_codes',
  'orders', 'return_requests', 'withdrawal_requests', 'cash_collections', 'delivery_earnings', 'referrals',
  'chats', 'notifications', 'blogs', 'blog_categories', 'faqs', 'pages', 'email_templates', 'mail_log',
  'counters', 'stats_daily',
] as const;
type Step = (typeof STEPS)[number];

const ORDER_STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Payment Pending', received: 'Received', processed: 'Processed', shipped: 'Shipped',
  ready_for_pickup: 'Ready for Pickup', picked_up: 'Picked Up', out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};
const ACTIVE_STATUSES = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
const CANCELABLE_STATUSES = ['payment_pending', 'received', 'processed'];
const PAYMENT_METHODS: [key: string, name: string, publicKey: string | null][] = [
  ['cod', 'Cash on Delivery', null], ['wallet', 'Wallet', null], ['stripe', 'Stripe', 'stripe_key'],
  ['razorpay', 'Razorpay', 'razorpay_key'], ['paystack', 'Paystack', 'paystack_public_key'], ['paypal', 'PayPal', 'paypal_client_id'],
  ['cashfree', 'Cashfree', 'cashfree_app_id'], ['phonepe', 'PhonePe', null], ['paytabs', 'PayTabs', null], ['midtrans', 'Midtrans', 'midtrans_client_key'],
];
/** Known demo passwords — only used to make logins work in the Auth EMULATOR (it cannot verify BCRYPT). */
const DEFAULT_EMULATOR_PASSWORDS = ['123456', 'Mumbai@1', 'Store@123', 'Alex@1234'];

// =====================================================================================================
const args = parseArgs();
const fb = initFirebase(args);
const want = (s: Step) => !args.only || args.only.has(s);
if (args.only) {
  const bad = [...args.only].filter((s) => !(STEPS as readonly string[]).includes(s));
  if (bad.length) throw new Error(`Unknown --only step(s): ${bad.join(', ')}. Valid: ${STEPS.join(', ')}`);
}

// ---------------------------------------------------------------- writer
class Writer {
  counts = new Map<string, number>();
  private bw: BulkWriter | null;
  failures = 0;
  constructor(private fb: Fb, private dry: boolean) {
    this.bw = dry ? null : fb.db.bulkWriter({ throttling: { initialOpsPerSecond: 500, maxOpsPerSecond: 2000 } });
    this.bw?.onWriteError((err) => {
      if (err.failedAttempts < 5) return true;
      this.failures++;
      console.error(`  ! write failed ${err.documentRef.path}: ${err.message}`);
      return false;
    });
  }
  set(step: Step, docPath: string, data: DocumentData) {
    this.counts.set(step, (this.counts.get(step) ?? 0) + 1);
    if (this.bw) void this.bw.set(this.fb.db.doc(docPath), data).catch(() => undefined);
  }
  async flush() {
    if (this.bw) await this.bw.flush();
  }
  async close() {
    if (this.bw) await this.bw.close();
  }
}
const W = new Writer(fb, args.dryRun);

// ---------------------------------------------------------------- storage
const uploads = { uploaded: 0, missing: [] as string[], kept: 0 };
const isAbsoluteUrl = (p: string) => /^(https?:)?\/\//i.test(p) || p.startsWith('data:');
function localFileFor(rel: string): string | null {
  const p = rel.replace(/^\/+/, '');
  const candidates = p.startsWith('storage/')
    ? [path.join(BACKEND, 'storage/app/public', p.slice('storage/'.length))]
    : p.startsWith('images/') || p.startsWith('build/')
      ? [path.join(BACKEND, 'public', p), path.join(BACKEND, 'storage/app/public', p)]
      : [path.join(BACKEND, 'storage/app/public', p), path.join(BACKEND, 'public', p)];
  return candidates.find((c) => existsSync(c)) ?? null;
}
function downloadUrl(objectPath: string, token: string) {
  const base = fb.storageHost ? `http://${fb.storageHost}` : 'https://firebasestorage.googleapis.com';
  return `${base}/v0/b/${fb.bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}
const uploadCache = new Map<string, Promise<string>>();
/**
 * Relative Laravel storage path -> upload to Storage `dest` and return {url, path}.
 * Absolute URLs (incl. placehold.co / ui-avatars) are returned unchanged.
 */
async function uploadAsset(rel: string, dest: string): Promise<{ url: string; path: string } | null> {
  const file = localFileFor(rel);
  if (!file) {
    uploads.missing.push(rel);
    return null;
  }
  const token = stableToken(dest);
  if (!args.dryRun && !args.skipStorage) {
    const key = `${dest}`;
    if (!uploadCache.has(key)) {
      uploadCache.set(
        key,
        bucket(fb)
          .file(dest)
          .save(readFileSync(file), {
            resumable: false,
            metadata: { contentType: contentType(file), metadata: { firebaseStorageDownloadTokens: token, source: `laravel:${rel}` } },
          })
          .then(() => {
            uploads.uploaded++;
            return dest;
          }),
      );
    }
    await uploadCache.get(key);
  }
  return { url: downloadUrl(dest, token), path: dest };
}
function contentType(f: string) {
  const ext = path.extname(f).toLowerCase();
  return (
    ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' } as Record<string, string>)[ext] ??
    'application/octet-stream'
  );
}
/** Public image -> URL (catalog/... or users/{uid}/...). */
async function img(v: unknown, prefix = 'catalog'): Promise<string | null> {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  if (isAbsoluteUrl(s)) {
    uploads.kept++;
    return s;
  }
  if (args.skipStorage) return s;
  // catalog keeps the Laravel relative path; user-owned prefixes get just the file name
  const rel = prefix === 'catalog' ? s.replace(/^\/+/, '').replace(/^storage\//, '') : path.posix.basename(s);
  const r = await uploadAsset(s, `${prefix}/${rel}`);
  return r ? r.url : s;
}
/** Rider document -> Storage PATH under delivery_docs/{uid}/ (spec: "storage path"); absolute URLs unchanged. */
async function riderDoc(v: unknown, uid: string): Promise<string | null> {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  if (isAbsoluteUrl(s) || args.skipStorage) return s;
  const r = await uploadAsset(s, `delivery_docs/${uid}/${path.posix.basename(s)}`);
  return r ? r.path : s;
}
// ---------------------------------------------------------------- catalog images (assets/manifest.json)
// Stock photos + generated artwork built by assets/build-catalog.ts. When the manifest has a file for a doc it is uploaded
// to Storage at the same path (catalog/<type>/<file>) and its download URL replaces the MySQL value (placehold.co etc.);
// the MySQL value stays the fallback. Disable with --no-catalog-images.
/** Brand mailbox (support / no-reply) on the old seed domain → same mailbox at qwikmart.app. Login e-mails are untouched. */
const brandMailbox = (v: unknown): string | null => (typeof v === 'string' && v ? v.replace(/@snapbuy\.app$/i, '@qwikmart.app') : null);
const ASSETS = path.resolve(HERE, 'assets');
interface Manifest {
  products?: Record<string, { images: string[]; thumbnail: string; variants?: Record<string, string> }>;
  categories?: Record<string, { image?: string; icon?: string; banner?: string }>;
  brands?: Record<string, { logo: string }>;
  banners?: Record<string, { image: string }>;
  blogs?: Record<string, { image: string }>;
  stores?: Record<string, { logo: string; banner: string }>;
  promo_codes?: Record<string, { image: string }>;
  notifications?: Record<string, { image: string }>;
  placeholders?: Record<string, string>;
}
const M: Manifest =
  !process.argv.includes('--no-catalog-images') && existsSync(path.join(ASSETS, 'manifest.json'))
    ? JSON.parse(readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'))
    : {};
const catalogStats = { used: 0, missing: [] as string[] };
/** Manifest asset (path relative to assets/, e.g. catalog/products/x.webp) -> download URL; falls back to img(fallback). */
async function catalogAsset(rel: string | null | undefined, fallback: unknown): Promise<string | null> {
  if (!rel) return img(fallback);
  const file = path.join(ASSETS, rel);
  if (!existsSync(file)) {
    catalogStats.missing.push(rel);
    return img(fallback);
  }
  catalogStats.used++;
  const dest = rel.replace(/\\/g, '/');
  const token = stableToken(dest);
  if (!args.dryRun && !args.skipStorage) {
    if (!uploadCache.has(dest)) {
      uploadCache.set(
        dest,
        bucket(fb)
          .file(dest)
          .save(readFileSync(file), {
            resumable: false,
            metadata: { contentType: contentType(file), cacheControl: 'public, max-age=86400', metadata: { firebaseStorageDownloadTokens: token, source: `assets:${dest}` } },
          })
          .then(() => {
            uploads.uploaded++;
            return dest;
          }),
      );
    }
    await uploadCache.get(dest);
  } else if (args.skipStorage) return dest;
  return downloadUrl(dest, token);
}
/** Image inside a home-layout section: placeholder URLs with generated art in the manifest are replaced. */
const layoutImg = (v: unknown) => (typeof v === 'string' && M.placeholders?.[v] ? catalogAsset(M.placeholders[v], v) : img(v));

const imgs = async (v: unknown, prefix = 'catalog') => {
  const arr = json<unknown[]>(v, []);
  const out: string[] = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    const u = await img(x, prefix);
    if (u) out.push(u);
  }
  return out;
};

// =====================================================================================================
async function main() {
  const t0 = Date.now();
  const conn = await openMysql();
  log(`MySQL connected (read-only). Target: ${args.prod ? 'PRODUCTION' : 'emulators'}${args.dryRun ? ' [DRY RUN]' : ''}${args.only ? ` only=${[...args.only].join(',')}` : ''}`);

  // ---------- load all tables (small dataset; everything in memory) ----------
  const T: Record<string, any[]> = {};
  const tables = [
    'settings', 'countries', 'zones', 'stores', 'languages', 'translations', 'roles', 'users', 'delivery_boys', 'addresses',
    'carts', 'favorites', 'user_notifications', 'notifications', 'wallet_transactions', 'categories', 'brands', 'attributes',
    'attribute_values', 'taxes', 'products', 'product_variants', 'product_relations', 'store_stocks', 'reviews', 'banners',
    'home_layouts', 'promo_codes', 'orders', 'order_items', 'order_status_histories', 'return_requests', 'withdrawal_requests',
    'cash_collections', 'delivery_boy_earnings', 'referrals', 'chats', 'chat_messages', 'blogs', 'blog_categories', 'faqs',
    'pages', 'email_templates', 'email_logs',
  ];
  for (const t of tables) T[t] = await rows(conn, `SELECT * FROM \`${t}\` ORDER BY ${t === 'settings' ? 'id' : 'id'}`);
  await conn.end();
  log(`Loaded ${tables.length} tables: ${tables.map((t) => `${t}=${T[t].length}`).join(' ')}`);

  const byId = <R extends { id: number }>(list: R[]) => new Map(list.map((r) => [Number(r.id), r]));
  const groupBy = <R,>(list: R[], key: (r: R) => unknown) => {
    const m = new Map<string, R[]>();
    for (const r of list) {
      const k = String(key(r));
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  };

  const users = byId(T.users);
  const uidOf = (userId: unknown): string | null => {
    if (userId === null || userId === undefined) return null;
    const u = users.get(Number(userId));
    if (u?.firebase_uid) return String(u.firebase_uid);
    return `user_${userId}`;
  };
  const liveUsers = T.users.filter((u) => !u.deleted_at);
  // Store staff (Laravel type 'staff' + store_id) become type 'store' with their store role_id, so their permissions are
  // store-scoped (a 'staff' claim would apply the role across ALL stores). Store owners = type 'store' without role_id.
  for (const u of liveUsers) {
    if (u.type === 'staff' && u.store_id) {
      if (!u.role_id) console.warn(`  users: store staff ${u.id} (${u.email ?? ''}) has no role_id — it becomes a store OWNER (full store access)`);
      u.type = 'store';
    }
  }
  const countries = byId(T.countries);
  const zones = byId(T.zones);
  const stores = byId(T.stores);
  const deliveryBoys = byId(T.delivery_boys);
  const riderUidOf = (deliveryBoyId: unknown) => {
    if (deliveryBoyId === null || deliveryBoyId === undefined) return null;
    const d = deliveryBoys.get(Number(deliveryBoyId));
    return d ? uidOf(d.user_id) : `delivery_boy_${deliveryBoyId}`;
  };
  const userPhone = (u: any) => (u ? e164(u.phone, u.country_code) : null);
  const categories = byId(T.categories);
  const brands = byId(T.brands);
  const taxes = byId(T.taxes);
  const attributes = byId(T.attributes);
  const attrValues = byId(T.attribute_values);
  const productsAll = byId(T.products);
  const liveProducts = T.products.filter((p) => !p.deleted_at);
  const liveProductIds = new Set(liveProducts.map((p) => Number(p.id)));
  const variantsAll = byId(T.product_variants);
  const variantsByProduct = groupBy(T.product_variants, (v) => v.product_id);
  const orders = byId(T.orders);
  const itemsByOrder = groupBy(T.order_items, (i) => i.order_id);
  const orderItems = byId(T.order_items);
  const histByOrder = groupBy(T.order_status_histories, (h) => h.order_id);
  const reviewedItems = new Set(T.reviews.map((r) => Number(r.order_item_id)).filter(Boolean));
  const returnsByItem = groupBy(T.return_requests, (r) => r.order_item_id);
  const promos = byId(T.promo_codes);
  const notificationsById = byId(T.notifications);
  const languages = byId(T.languages);
  const dbByUser = new Map(T.delivery_boys.map((d) => [Number(d.user_id), d]));

  const ancestors = (catId: unknown): string[] => {
    const chain: string[] = [];
    let c = catId ? categories.get(Number(catId)) : undefined;
    let guard = 0;
    while (c && guard++ < 20) {
      chain.unshift(String(c.id));
      c = c.parent_id ? categories.get(Number(c.parent_id)) : undefined;
    }
    return chain;
  };

  // ---------- derived counters from orders ----------
  const userCounters = new Map<string, { orders_count: number; total_spent: number }>();
  const storeCounters = new Map<string, { orders_count: number; revenue: number }>();
  const soldCount = new Map<string, number>();
  const stats = new Map<string, StatsDoc>();
  const grandTotal = (o: any) => num(num(o.total) + num(o.wallet_used));
  for (const o of T.orders) {
    if (o.deleted_at) continue;
    const inRevenue = isRevenueStatus(o.status); // spec §8: revenue = status not in payment_pending|cancelled|returned
    const counted = o.status !== 'payment_pending';
    const items = itemsByOrder.get(String(o.id)) ?? [];
    const uid = uidOf(o.user_id);
    if (uid) {
      const c = userCounters.get(uid) ?? { orders_count: 0, total_spent: 0 };
      if (counted) c.orders_count++;
      if (inRevenue) c.total_spent = num(c.total_spent + grandTotal(o));
      userCounters.set(uid, c);
    }
    if (o.store_id) {
      const k = String(o.store_id);
      const c = storeCounters.get(k) ?? { orders_count: 0, revenue: 0 };
      if (counted) c.orders_count++;
      if (inRevenue) c.revenue = num(c.revenue + grandTotal(o));
      storeCounters.set(k, c);
    }
    if (inRevenue) for (const it of items) if (it.product_id) soldCount.set(String(it.product_id), (soldCount.get(String(it.product_id)) ?? 0) + Number(it.qty));
    addOrderToStats(stats, {
      status: o.status,
      mode: o.mode,
      created_at: o.created_at,
      grand_total: grandTotal(o),
      delivery_charge: num(o.delivery_charge),
      tax_amount: num(o.tax_amount),
      store_id: sid(o.store_id),
      zone_id: sid(o.zone_id),
      items: items.map((it) => ({
        product_id: sid(it.product_id),
        category_id: sid(productsAll.get(Number(it.product_id))?.category_id),
        qty: Number(it.qty),
        total: num(it.total),
      })),
    });
  }

  // =====================================================================================================
  // SETTINGS
  if (want('settings')) {
    const raw = new Map<string, { value: unknown; group: string }>();
    for (const s of T.settings) raw.set(s.key, { value: castSetting(s.value), group: s.group });
    const S = (k: string, d: unknown = null) => {
      const v = raw.get(k)?.value;
      return v === null || v === undefined || v === '' ? d : v;
    };
    const defaultCountry = T.countries.find((c) => bool(c.is_default)) ?? T.countries[0];
    const defaultZone = T.zones.find((z) => z.country_id === defaultCountry?.id && bool(z.status)) ?? T.zones[0];
    const fbWeb = S('firebase_web_config', null);
    const pub = {
      app_name: S('app_name', 'QwikMart'),
      tagline: S('app_tagline', ''),
      // QwikMart brand files (assets/brand/out, built by assets/build-brand.ts) replace the legacy SnapBuy logo uploads.
      logo: await catalogAsset('brand/out/qwikmart-logo.png', S('app_logo')),
      logo_white: await catalogAsset('brand/out/qwikmart-logo-white.png', null),
      logo_icon: await catalogAsset('brand/out/qwikmart-icon.png', S('app_logo_icon')),
      favicon: await catalogAsset('brand/out/qwikmart-icon.png', S('app_favicon') ?? S('app_logo_icon')),
      primary_color: S('primary_color', '#0E9623'),
      currency_code: S('currency_code', 'INR'),
      currency_symbol: S('currency_symbol', '₹'),
      timezone: S('timezone', 'Asia/Kolkata'),
      // Public brand mailboxes move to the QwikMart domain (placeholder — set the real address in Admin → Settings).
      support: { phone: S('support_phone'), email: brandMailbox(S('support_email')), whatsapp: S('support_whatsapp') },
      social: { facebook: S('facebook_url'), instagram: S('instagram_url'), twitter: S('twitter_url'), youtube: S('youtube_url') },
      company: { name: S('company_name'), address: S('company_address') ?? S('address'), gstin: S('company_gstin') },
      default_country_id: sid(defaultCountry?.id),
      default_zone_id: sid(defaultZone?.id),
      // never ship demo mode to production (demo banners / demo logins)
      demo_mode: args.prod ? false : bool(S('demo_mode', false)),
      tax_inclusive: bool(S('tax_inclusive', true)),
      payment_methods: PAYMENT_METHODS.map(([key, name, pk]) => ({
        key,
        name,
        logo: null,
        enabled: bool(S(`${key}_enabled`, key === 'cod' || key === 'wallet')),
        public_key: pk ? S(pk) : null,
        mode: S(`${key}_mode`, key === 'cod' || key === 'wallet' ? 'live' : 'sandbox'),
      })),
      referral: {
        enabled: bool(S('referral_enabled', false)),
        referrer_reward: num(S('referrer_reward', 0)),
        referred_reward: num(S('referred_reward', 0)),
        min_order: num(S('referral_min_order', 0)),
      },
      wallet: {
        enabled: bool(S('wallet_enabled', true)),
        min_recharge: num(S('wallet_min_recharge', 0)),
        max_recharge: num(S('wallet_max_recharge', 0)),
        min_withdraw: num(S('wallet_min_withdraw', 0)),
        withdraw_enabled: bool(S('wallet_withdraw_enabled', true)),
      },
      cod: { enabled: bool(S('cod_enabled', true)), max_amount: num(S('cod_max_amount', 0)) },
      app_versions: {
        customer_min: S('customer_app_min_version_android') ?? S('min_app_version_android', '1.0.0'),
        customer_min_ios: S('customer_app_min_version_ios') ?? S('min_app_version_ios', '1.0.0'),
        delivery_min: S('delivery_app_min_version_android') ?? S('min_app_version_android', '1.0.0'),
        delivery_min_ios: S('delivery_app_min_version_ios') ?? S('min_app_version_ios', '1.0.0'),
        latest: S('latest_app_version', '1.0.0'),
        force_update: bool(S('customer_app_force_update', false)) || bool(S('force_update', false)),
        delivery_force_update: bool(S('delivery_app_force_update', false)),
        play_store_url: S('play_store_url'),
        app_store_url: S('app_store_url'),
        delivery_play_store_url: S('delivery_play_store_url') ?? S('delivery_app_play_store_url'),
        delivery_app_store_url: S('delivery_app_store_url'),
      },
      maintenance: {
        app: bool(S('app_maintenance_mode', false)),
        web: bool(S('maintenance_mode', false)),
        message: S('app_maintenance_message'),
      },
      delivery: {
        auto_assign: bool(S('auto_assign_delivery', false)),
        assign_mode: S('delivery_assign_mode') ?? (bool(S('auto_assign_delivery', false)) ? 'auto' : 'manual'),
        default_commission: num(S('default_delivery_commission', 0)),
        commission_type: S('delivery_commission_type'),
        commission_value: numOrNull(S('delivery_commission_value')),
        location_interval_sec: Number(S('delivery_location_interval_sec', 10)),
        radius_km: numOrNull(S('delivery_radius_km')),
        otp_required: bool(S('delivery_otp_required', true)),
      },
      ai_features: {
        product_content: bool(S('ai_product_content_enabled', false)),
        translate: bool(S('ai_translate_enabled', false)),
        search: bool(S('ai_search_enabled', false)),
        recommendations: bool(S('ai_recommendations_enabled', false)),
      },
      firebase_web: fbWeb && typeof fbWeb === 'object' ? { ...(fbWeb as object), vapid_key: S('firebase_vapid_key') } : null,
      cookie_consent: S('cookie_consent', true) === true || bool(S('cookie_consent', true)),
      home_search_hints: (S('home_search_hints', []) as unknown[]) ?? [],
      updated_at: FieldValue.serverTimestamp(),
    };
    W.set('settings', 'settings/public', pub);
    // Secret groups → canonical key names shared by the admin Settings page and the functions
    // (functions still accept the Laravel names as a fallback, see functions/src/services/notify.ts).
    const group = (g: string) => {
      const data: Record<string, unknown> = {};
      for (const [k, v] of raw) if (v.group === g) data[k] = v.value ?? null;
      return data;
    };
    const pay = group('payment'); // already canonical: ${gateway}_${key}, ${gateway}_enabled, ${gateway}_mode
    const sms = group('sms');
    const smsData: Record<string, unknown> = { gateway: sms.sms_gateway ?? 'log' };
    for (const [k, v] of Object.entries(sms)) if (k !== 'sms_gateway') smsData[k] = v;
    const smtp = group('smtp');
    const enc = smtp.mail_encryption ? String(smtp.mail_encryption).toLowerCase() : null;
    const smtpPort = numOrNull(smtp.mail_port, 0);
    const smtpData = {
      host: smtp.mail_host ?? null, port: smtpPort, username: smtp.mail_username ?? null, password: smtp.mail_password ?? null,
      encryption: enc === 'null' || enc === '' ? 'none' : enc, secure: enc === 'ssl' || smtpPort === 465,
      from_email: brandMailbox(smtp.mail_from_address ?? null), from_name: smtp.mail_from_name ?? null, mailer: smtp.mail_mailer ?? null,
    };
    const ai = group('ai');
    const aiData = { gemini_api_key: ai.gemini_api_key ?? null, gemini_model: ai.gemini_model ?? 'gemini-2.5-flash' };
    W.set('settings', 'settings/private_payment', { ...pay, updated_at: FieldValue.serverTimestamp() });
    W.set('settings', 'settings/private_sms', { ...smsData, updated_at: FieldValue.serverTimestamp() });
    W.set('settings', 'settings/private_smtp', { ...smtpData, updated_at: FieldValue.serverTimestamp() });
    W.set('settings', 'settings/private_ai', { ...aiData, updated_at: FieldValue.serverTimestamp() });
  }

  // GEOGRAPHY
  if (want('countries'))
    for (const c of T.countries)
      W.set('countries', `countries/${c.id}`, {
        name: c.name, iso2: c.iso2, dial_code: c.dial_code, currency_code: c.currency_code, currency_symbol: c.currency_symbol,
        timezone: c.timezone, date_format: c.date_format, flag: c.flag, is_default: bool(c.is_default), status: activeStatus(c.status),
        created_at: ts(c.created_at), updated_at: ts(c.updated_at),
      });

  if (want('zones'))
    for (const z of T.zones) {
      const polygon = (json<any[]>(z.polygon, []) ?? []).map((p) => ({ lat: num(p.lat, 7), lng: num(p.lng, 7) }));
      const center = polygon.length
        ? { lat: num(polygon.reduce((a, p) => a + p.lat, 0) / polygon.length, 7), lng: num(polygon.reduce((a, p) => a + p.lng, 0) / polygon.length, 7) }
        : null;
      const zoneStores = T.stores.filter((s) => s.zone_id === z.id);
      const defaultStore = zoneStores.find((s) => bool(s.status)) ?? zoneStores[0];
      W.set('zones', `zones/${z.id}`, {
        country_id: sid(z.country_id), name: z.name, slug: slugify(z.name), city: z.city, polygon, center,
        fulfillment_type: z.fulfillment_type, base_charge: num(z.base_charge), base_distance_km: num(z.base_distance_km),
        per_km_charge: num(z.per_km_charge), free_delivery_above: numOrNull(z.free_delivery_above), min_order: num(z.min_order),
        surge_slots: (json<any[]>(z.surge_slots, []) ?? []).map((s) => ({ from: s.from, to: s.to, amount: num(s.amount) })),
        additional_charges: (json<any[]>(z.additional_charges, []) ?? []).map((c) => ({ name: tr(c.name), amount: num(c.amount), refundable: bool(c.refundable ?? false) })),
        delivery_time_minutes: Number(z.delivery_time_minutes), default_store_id: sid(defaultStore?.id), status: activeStatus(z.status),
        created_at: ts(z.created_at), updated_at: ts(z.updated_at),
      });
    }

  if (want('stores'))
    for (const s of T.stores) {
      const owner = liveUsers.find((u) => u.type === 'store' && u.store_id === s.id && !u.role_id) ?? liveUsers.find((u) => u.type === 'store' && u.store_id === s.id);
      const c = storeCounters.get(String(s.id)) ?? { orders_count: 0, revenue: 0 };
      W.set('stores', `stores/${s.id}`, {
        zone_id: sid(s.zone_id), country_id: sid(s.country_id), name: s.name, slug: s.slug, email: s.email, phone: s.phone,
        address: s.address, city: s.city, lat: numOrNull(s.lat, 7), lng: numOrNull(s.lng, 7),
        logo: await catalogAsset(M.stores?.[s.id]?.logo, s.logo), banner: await catalogAsset(M.stores?.[s.id]?.banner, s.banner),
        opening_time: s.opening_time ? String(s.opening_time).slice(0, 5) : null, closing_time: s.closing_time ? String(s.closing_time).slice(0, 5) : null,
        fulfillment_type: s.fulfillment_type, commission_percent: num(s.commission_percent), status: activeStatus(s.status), is_open: bool(s.is_open),
        owner_uid: owner ? uidOf(owner.id) : null, orders_count: c.orders_count, revenue: c.revenue,
        created_at: ts(s.created_at), updated_at: ts(s.updated_at),
      });
    }

  if (want('languages'))
    for (const l of T.languages)
      W.set('languages', `languages/${l.code}`, {
        code: l.code, name: l.name, is_rtl: bool(l.is_rtl), is_default: bool(l.is_default), status: activeStatus(l.status),
        created_at: ts(l.created_at), updated_at: ts(l.updated_at),
      });
  if (want('translations'))
    for (const t of T.translations) {
      const code = languages.get(Number(t.language_id))?.code;
      if (!code) continue;
      W.set('translations', `translations/${code}_${t.platform}`, { language: code, platform: t.platform, data: json(t.data, {}), updated_at: ts(t.updated_at) });
    }

  if (want('roles'))
    for (const r of T.roles)
      W.set('roles', `roles/${r.id}`, {
        name: r.name, scope: r.guard, store_id: sid(r.store_id), permissions: json<string[]>(r.permissions, []),
        created_at: ts(r.created_at), updated_at: ts(r.updated_at),
      });

  // =====================================================================================================
  // AUTH
  if (want('auth')) await migrateAuth();

  // USERS (+ subcollections)
  if (want('users'))
    for (const u of liveUsers) {
      const uid = uidOf(u.id)!;
      const c = userCounters.get(uid) ?? { orders_count: 0, total_spent: 0 };
      const phone = userPhone(u);
      const avatar = await img(u.avatar, `users/${uid}`);
      W.set('users', `users/${uid}`, {
        type: u.type, name: u.name, email: u.email ?? null, phone, avatar,
        store_id: sid(u.store_id), role_id: sid(u.role_id), zone_id: u.type === 'delivery_boy' ? sid(dbByUser.get(u.id)?.zone_id) : null,
        referral_code: u.referral_code ?? null, referred_by: uidOf(u.referred_by),
        wallet_balance: num(u.wallet_balance), orders_count: c.orders_count, total_spent: c.total_spent,
        fcm_tokens: u.fcm_token ? [String(u.fcm_token)] : [], status: activeStatus(u.status), language: 'en',
        email_verified: !!u.email_verified_at, mysql_id: Number(u.id),
        created_at: ts(u.created_at), updated_at: ts(u.updated_at), last_login_at: ts(u.last_login_at),
        search_keywords: searchKeywords(u.name, u.email, phone, u.phone, u.referral_code),
      });
    }

  if (want('addresses'))
    for (const a of T.addresses) {
      const u = users.get(Number(a.user_id));
      if (!u || u.deleted_at) continue;
      const dial = a.country_id ? countries.get(Number(a.country_id))?.dial_code : u.country_code;
      W.set('addresses', `users/${uidOf(a.user_id)}/addresses/${a.id}`, {
        label: a.label, name: a.name, phone: e164(a.phone, dial ?? u.country_code) ?? a.phone, address_line: a.address_line,
        landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, country_id: sid(a.country_id),
        lat: numOrNull(a.lat, 7), lng: numOrNull(a.lng, 7), is_default: bool(a.is_default),
        created_at: ts(a.created_at), updated_at: ts(a.updated_at),
      });
    }

  if (want('cart'))
    for (const c of T.carts) {
      if (!c.user_id) continue; // guest-token carts cannot be mapped to an anonymous uid
      const u = users.get(Number(c.user_id));
      const v = variantsAll.get(Number(c.product_variant_id));
      if (!u || u.deleted_at || !v || !liveProductIds.has(Number(v.product_id))) continue;
      const lineId = `${c.mode}_${c.store_id ?? 'central'}_${c.product_variant_id}`;
      W.set('cart', `users/${uidOf(c.user_id)}/cart/${lineId}`, {
        product_id: String(v.product_id), variant_id: String(c.product_variant_id), store_id: sid(c.store_id), mode: c.mode,
        qty: Number(c.qty), added_at: ts(c.created_at), updated_at: ts(c.updated_at),
      });
    }

  if (want('favorites'))
    for (const f of T.favorites) {
      const u = users.get(Number(f.user_id));
      if (!u || u.deleted_at || !liveProductIds.has(Number(f.product_id))) continue;
      W.set('favorites', `users/${uidOf(f.user_id)}/favorites/${f.product_id}`, { created_at: ts(f.created_at) });
    }

  if (want('user_notifications'))
    for (const n of T.user_notifications) {
      const u = users.get(Number(n.user_id));
      if (!u || u.deleted_at) continue;
      const parent = n.notification_id ? notificationsById.get(Number(n.notification_id)) : undefined;
      const data = json<Record<string, unknown>>(n.data, {}) ?? {};
      W.set('user_notifications', `users/${uidOf(n.user_id)}/notifications/${n.id}`, {
        title: n.title, message: n.message ?? '', type: (data.type as string) ?? parent?.type ?? 'default', data,
        image: parent ? await catalogAsset(M.notifications?.[parent.id]?.image, parent.image) : null, notification_id: sid(n.notification_id), read_at: ts(n.read_at), created_at: ts(n.created_at),
      });
    }

  if (want('wallet_transactions'))
    for (const w of T.wallet_transactions) {
      const u = users.get(Number(w.user_id));
      if (!u || u.deleted_at) continue;
      W.set('wallet_transactions', `users/${uidOf(w.user_id)}/wallet_transactions/${w.id}`, {
        type: w.type, amount: num(w.amount), balance_after: num(w.balance_after), payment_type: w.payment_type, txn_id: w.txn_id,
        order_id: sid(w.order_id), message: w.message, status: w.status, created_at: ts(w.created_at),
      });
    }

  if (want('delivery_boys')) {
    const earningsTotal = new Map<string, number>();
    for (const e of T.delivery_boy_earnings) earningsTotal.set(String(e.delivery_boy_id), num((earningsTotal.get(String(e.delivery_boy_id)) ?? 0) + num(e.amount)));
    for (const d of T.delivery_boys) {
      const u = users.get(Number(d.user_id));
      if (!u || u.deleted_at) continue;
      const uid = uidOf(d.user_id)!;
      W.set('delivery_boys', `delivery_boys/${uid}`, {
        name: u.name, email: u.email ?? null, phone: userPhone(u), avatar: await img(u.avatar, `users/${uid}`), mysql_id: Number(d.id),
        zone_id: sid(d.zone_id), country_id: sid(d.country_id), dob: d.dob ? dayHour(d.dob).day : null, address: d.address,
        vehicle_type: d.vehicle_type, vehicle_number: d.vehicle_number,
        driving_license: await riderDoc(d.driving_license, uid), id_proof: await riderDoc(d.id_proof, uid),
        bank: { name: d.bank_name, account: d.bank_account, ifsc: d.ifsc },
        commission_type: d.commission_type, commission_value: num(d.commission_value), salary: num(d.salary), cash_in_hand: num(d.cash_in_hand),
        earnings_total: earningsTotal.get(String(d.id)) ?? 0, rating_avg: 0, rating_count: 0, is_online: bool(d.is_online),
        location: d.current_lat !== null && d.current_lng !== null ? { lat: num(d.current_lat, 7), lng: num(d.current_lng, 7), updated_at: ts(d.location_updated_at) } : null,
        approval_status: d.approval_status, approval_remark: null, status: activeStatus(d.status), created_at: ts(d.created_at), updated_at: ts(d.updated_at),
      });
    }
  }

  // =====================================================================================================
  // CATALOG
  const productCount = new Map<string, number>();
  for (const p of liveProducts) {
    if (p.status !== 'active') continue;
    for (const c of new Set([...ancestors(p.category_id), ...ancestors(p.sub_category_id)])) productCount.set(c, (productCount.get(c) ?? 0) + 1);
  }
  if (want('categories'))
    for (const c of T.categories) {
      const anc = ancestors(c.id);
      W.set('categories', `categories/${c.id}`, {
        parent_id: sid(c.parent_id), ancestor_ids: anc.slice(0, -1), depth: anc.length - 1, name: tr(c.name), slug: c.slug,
        image: await catalogAsset(M.categories?.[c.id]?.image, c.image), icon: await catalogAsset(M.categories?.[c.id]?.icon, c.icon),
        banner: await catalogAsset(M.categories?.[c.id]?.banner, c.banner), header_color: c.header_color,
        sort_order: Number(c.sort_order), status: activeStatus(c.status), show_in_quick: bool(c.show_in_quick), show_in_ecommerce: bool(c.show_in_ecommerce),
        product_count: productCount.get(String(c.id)) ?? 0, search_keywords: searchKeywords(tr(c.name), c.slug),
        created_at: ts(c.created_at), updated_at: ts(c.updated_at),
      });
    }
  if (want('brands'))
    for (const b of T.brands)
      W.set('brands', `brands/${b.id}`, {
        name: b.name, slug: b.slug, logo: await catalogAsset(M.brands?.[b.id]?.logo, b.logo), status: activeStatus(b.status), sort_order: Number(b.sort_order ?? b.id),
        search_keywords: searchKeywords(b.name), created_at: ts(b.created_at), updated_at: ts(b.updated_at),
      });
  if (want('attributes')) {
    const valuesByAttr = groupBy(T.attribute_values, (v) => v.attribute_id);
    for (const a of T.attributes)
      W.set('attributes', `attributes/${a.id}`, {
        name: tr(a.name),
        values: (valuesByAttr.get(String(a.id)) ?? []).map((v) => ({ id: String(v.id), value: v.value, color_hex: v.color_hex ?? null })),
        created_at: ts(a.created_at), updated_at: ts(a.updated_at),
      });
  }
  if (want('taxes'))
    for (const t of T.taxes)
      W.set('taxes', `taxes/${t.id}`, { name: t.name, percent: num(t.percent), status: activeStatus(t.status), created_at: ts(t.created_at), updated_at: ts(t.updated_at) });

  // store stock (needed for products.in_stock_store_ids)
  const inStockStores = new Map<string, Set<string>>();
  for (const s of T.store_stocks) {
    const v = variantsAll.get(Number(s.product_variant_id));
    if (!v || Number(s.stock) <= 0 || !bool(v.status)) continue;
    const k = String(v.product_id);
    (inStockStores.get(k) ?? inStockStores.set(k, new Set()).get(k)!).add(String(s.store_id));
  }
  if (want('products')) {
    const relations = groupBy(T.product_relations, (r) => r.product_id);
    for (const p of liveProducts) {
      const name = tr(p.name);
      const variants = (variantsByProduct.get(String(p.id)) ?? []).sort((a, b) => a.id - b.id);
      const attrOrder: string[] = [];
      const attrValuesMap = new Map<string, Set<string>>();
      const mappedVariants = [];
      for (const v of variants) {
        const avIds = (json<unknown[]>(v.attribute_value_ids, []) ?? []).map(String);
        const attrs: Record<string, string> = {};
        for (const avId of avIds) {
          const av = attrValues.get(Number(avId));
          if (!av) continue;
          const an = trEn(tr(attributes.get(Number(av.attribute_id))?.name)) || `attribute_${av.attribute_id}`;
          const key = an.toLowerCase().replace(/\s+/g, '_');
          attrs[key] = av.value;
          if (!attrValuesMap.has(an)) {
            attrOrder.push(an);
            attrValuesMap.set(an, new Set());
          }
          attrValuesMap.get(an)!.add(av.value);
        }
        mappedVariants.push({
          id: String(v.id), name: v.name, sku: v.sku, attribute_value_ids: avIds, attrs, attrs_derived: false as boolean, price: num(v.price), sale_price: numOrNull(v.sale_price),
          stock: Number(v.stock), low_stock_alert: Number(v.low_stock_alert), weight: v.weight,
          image: M.products?.[p.id]?.variants?.[v.id] ? await catalogAsset(M.products[p.id].variants![v.id], v.image) : await img(v.image), status: activeStatus(v.status),
        });
      }
      // Some Laravel variants have no attribute_value_ids (e.g. "Amul Butter 100 g" next to "500 g" = Weight:500 g).
      // Derive attrs: (1) the variant name equals an attribute value → that value (+ its id); (2) siblings use exactly one
      // attribute → that attribute = variant name; (3) several variants without any attribute → { variant: name }.
      if (mappedVariants.length > 1 || p.product_type === 'variable') {
        const allValues = [...attrValues.values()];
        for (const mv of mappedVariants) {
          if (Object.keys(mv.attrs).length || !mv.name) continue;
          const nm = String(mv.name).trim();
          const hit = allValues.find((av) => String(av.value).trim().toLowerCase() === nm.toLowerCase());
          let an: string | null = null;
          if (hit) {
            an = trEn(tr(attributes.get(Number(hit.attribute_id))?.name)) || `attribute_${hit.attribute_id}`;
            mv.attribute_value_ids = [String(hit.id)];
          } else if (attrOrder.length === 1) an = attrOrder[0];
          else if (attrOrder.length === 0 && mappedVariants.length > 1) an = 'Variant';
          if (!an) continue;
          mv.attrs = { [an.toLowerCase().replace(/\s+/g, '_')]: hit ? String(hit.value) : nm };
          mv.attrs_derived = true;
          if (!attrValuesMap.has(an)) { attrOrder.push(an); attrValuesMap.set(an, new Set()); }
          attrValuesMap.get(an)!.add(hit ? String(hit.value) : nm);
        }
      }
      for (const mv of mappedVariants) if (!mv.attrs_derived) delete (mv as { attrs_derived?: boolean }).attrs_derived;
      const active = mappedVariants.filter((v) => v.status === 'active');
      const priced = (active.length ? active : mappedVariants).map((v) => ({ eff: v.sale_price !== null && v.sale_price < v.price ? v.sale_price : v.price, price: v.price }));
      const minPrice = priced.length ? Math.min(...priced.map((x) => x.eff)) : 0;
      const maxDisc = priced.length ? Math.max(...priced.map((x) => (x.price > 0 ? Math.round(((x.price - x.eff) / x.price) * 100) : 0))) : 0;
      const tax = p.tax_id ? taxes.get(Number(p.tax_id)) : undefined;
      const brand = p.brand_id ? brands.get(Number(p.brand_id)) : undefined;
      const rel = relations.get(String(p.id)) ?? [];
      const tags = json<string[]>(p.tags, []) ?? [];
      W.set('products', `products/${p.id}`, {
        store_id: sid(p.store_id), category_id: sid(p.category_id), sub_category_id: sid(p.sub_category_id),
        category_ids: [...new Set([...ancestors(p.category_id), ...ancestors(p.sub_category_id)])],
        brand_id: sid(p.brand_id), brand_name: brand?.name ?? null, name, slug: p.slug,
        short_description: tr(p.short_description), description: tr(p.description),
        images: M.products?.[p.id]?.images?.length ? await Promise.all(M.products[p.id].images.map((f) => catalogAsset(f, null))).then((a) => a.filter(Boolean) as string[]) : await imgs(p.images),
        thumbnail: await catalogAsset(M.products?.[p.id]?.thumbnail, p.thumbnail), product_type: p.product_type,
        tax_id: sid(p.tax_id), tax_percent: tax ? num(tax.percent) : 0, is_veg: p.is_veg === null ? null : bool(p.is_veg),
        return_allowed: bool(p.return_allowed), return_days: Number(p.return_days), cancelable: bool(p.cancelable), cod_allowed: bool(p.cod_allowed),
        max_qty_per_order: Number(p.max_qty_per_order), fulfillment_type: p.fulfillment_type,
        seo: { title: tr(p.seo_title), description: tr(p.seo_description), keywords: tr(p.seo_keywords) }, schema_markup: p.schema_markup ?? null,
        tags, attributes: attrOrder.map((n) => ({ name: n, values: [...attrValuesMap.get(n)!] })), variants: mappedVariants,
        cross_sell_ids: rel.filter((r) => r.type === 'cross_sell' && liveProductIds.has(Number(r.related_product_id))).map((r) => String(r.related_product_id)),
        up_sell_ids: rel.filter((r) => r.type === 'up_sell' && liveProductIds.has(Number(r.related_product_id))).map((r) => String(r.related_product_id)),
        rating_avg: num(p.rating_avg, 1), rating_count: Number(p.rating_count), sold_count: soldCount.get(String(p.id)) ?? 0,
        is_featured: bool(p.is_featured), status: p.status, min_price: num(minPrice), max_discount_percent: maxDisc,
        in_stock_store_ids: [...(inStockStores.get(String(p.id)) ?? [])].sort(),
        search_keywords: searchKeywords(name, brand?.name, ...mappedVariants.map((v) => v.sku ?? ''), ...tags),
        created_at: ts(p.created_at), updated_at: ts(p.updated_at),
      });
    }
  }
  if (want('store_stocks'))
    for (const s of T.store_stocks) {
      const v = variantsAll.get(Number(s.product_variant_id));
      if (!v || !liveProductIds.has(Number(v.product_id))) continue;
      W.set('store_stocks', `store_stocks/${s.store_id}_${s.product_variant_id}`, {
        store_id: String(s.store_id), product_id: String(v.product_id), variant_id: String(s.product_variant_id), stock: Number(s.stock),
        price: numOrNull(s.price), sale_price: numOrNull(s.sale_price), low_stock_alert: Number(v.low_stock_alert), updated_at: ts(s.updated_at),
      });
    }
  if (want('reviews'))
    for (const r of T.reviews) {
      const u = users.get(Number(r.user_id));
      const it = r.order_item_id ? orderItems.get(Number(r.order_item_id)) : undefined;
      W.set('reviews', `reviews/${r.id}`, {
        product_id: String(r.product_id), user_id: uidOf(r.user_id), user_name: u?.name ?? 'Customer', user_avatar: u ? await img(u.avatar, `users/${uidOf(u.id)}`) : null,
        order_id: sid(it?.order_id), item_variant_id: sid(it?.product_variant_id), rating: Number(r.rating), comment: r.comment ?? '',
        images: await imgs(r.images), status: activeStatus(r.status), created_at: ts(r.created_at), updated_at: ts(r.updated_at),
      });
    }
  if (want('banners'))
    for (const b of T.banners)
      W.set('banners', `banners/${b.id}`, {
        title: tr(b.title), subtitle: tr(b.subtitle ?? null), image: await catalogAsset(M.banners?.[b.id]?.image, b.image), link_type: b.link_type, link_value: b.link_value ?? null,
        zone_id: sid(b.zone_id), mode: b.mode, status: activeStatus(b.status), sort_order: Number(b.position), created_at: ts(b.created_at), updated_at: ts(b.updated_at),
      });
  if (want('home_layouts'))
    for (const h of T.home_layouts) {
      const id = `${h.zone_id}_${h.mode}_${h.category_id ?? 'all'}`;
      const header = { bg_type: h.header_bg_type, bg_value: await img(h.header_bg_type === 'image' ? h.header_bg_value : null) ?? h.header_bg_value, text_color: h.text_color };
      // public doc: published data only; the working copy goes to the panel-only home_layout_drafts/{id}
      W.set('home_layouts', `home_layouts/${id}`, {
        zone_id: String(h.zone_id), mode: h.mode, category_id: sid(h.category_id), header,
        published_sections: await remapSections(json<any[]>(h.published_sections, [])),
        is_published: bool(h.is_published), published_at: ts(h.published_at), mysql_id: Number(h.id),
        created_at: ts(h.created_at), updated_at: ts(h.updated_at),
      });
      W.set('home_layouts', `home_layout_drafts/${id}`, {
        zone_id: String(h.zone_id), mode: h.mode, category_id: sid(h.category_id), header,
        draft_sections: await remapSections(json<any[]>(h.draft_sections, [])), store_id: null, mysql_id: Number(h.id),
        updated_at: ts(h.updated_at),
      });
    }
  if (want('promo_codes'))
    for (const p of T.promo_codes) {
      const ids = (v: unknown) => (json<unknown[]>(v, []) ?? []).map(String);
      W.set('promo_codes', `promo_codes/${p.id}`, {
        code: String(p.code).toUpperCase(), title: tr(p.title), description: tr(p.description), image: await catalogAsset(M.promo_codes?.[p.id]?.image, p.image), banner_color: p.banner_color,
        discount_type: p.discount_type, discount_value: num(p.discount_value), max_discount: numOrNull(p.max_discount), min_order: num(p.min_order),
        usage_limit_total: p.usage_limit_total ?? null, usage_limit_per_user: p.usage_limit_per_user ?? null, used_count: Number(p.used_count),
        starts_at: ts(p.starts_at), ends_at: ts(p.ends_at), is_permanent: bool(p.is_permanent), applies_to: p.applies_to, applies_to_ids: ids(p.applies_to_ids),
        audience: p.audience, channels: json(p.channels, []), platforms: json(p.platforms, []), zone_ids: ids(p.zone_ids), country_ids: ids(p.country_ids),
        time_from: p.time_from ? String(p.time_from).slice(0, 5) : null, time_to: p.time_to ? String(p.time_to).slice(0, 5) : null,
        is_instant: bool(p.is_instant), is_cashback: bool(p.is_cashback), status: activeStatus(p.status),
        store_id: 'store_id' in p ? sid(p.store_id) : null, // Laravel promo_codes has no store_id column (store promos are new)
        created_at: ts(p.created_at), updated_at: ts(p.updated_at),
      });
    }

  // =====================================================================================================
  // ORDERS & MONEY
  // order line images: the product's catalog thumbnail (MySQL keeps placeholder URLs in order_items.image)
  const productThumb = new Map<string, string>();
  if (want('orders'))
    for (const [pid, e] of Object.entries(M.products ?? {})) {
      const u = await catalogAsset(e.thumbnail, null);
      if (u) productThumb.set(pid, u);
    }
  if (want('orders'))
    for (const o of T.orders) {
      if (o.deleted_at) continue;
      const u = users.get(Number(o.user_id));
      const promo = o.promo_code_id ? promos.get(Number(o.promo_code_id)) : undefined;
      const promoCashback = promo ? bool(promo.is_cashback) : false;
      const dial = o.country_id ? countries.get(Number(o.country_id))?.dial_code : null;
      const snap = json<Record<string, any> | null>(o.address_snapshot, null);
      const address = snap
        ? { ...snap, phone: snap.phone ? e164(snap.phone, dial ?? u?.country_code) ?? snap.phone : null, lat: numOrNull(snap.lat, 7), lng: numOrNull(snap.lng, 7) }
        : null;
      const d = o.delivery_boy_id ? deliveryBoys.get(Number(o.delivery_boy_id)) : undefined;
      const du = d ? users.get(Number(d.user_id)) : undefined;
      const items = (itemsByOrder.get(String(o.id)) ?? []).map((it) => {
        const rets = (returnsByItem.get(String(it.id)) ?? []).sort((a, b) => b.id - a.id);
        const p = it.product_id ? productsAll.get(Number(it.product_id)) : undefined;
        const tax = p?.tax_id ? taxes.get(Number(p.tax_id)) : undefined;
        const salePrice = numOrNull(it.sale_price);
        return {
          id: String(it.id), variant_id: sid(it.product_variant_id), product_id: sid(it.product_id), name: it.product_name, variant_name: it.variant_name ?? '',
          image: (it.product_id && productThumb.get(String(it.product_id))) || it.image, price: num(it.price), sale_price: salePrice, unit_price: salePrice ?? num(it.price), qty: Number(it.qty),
          tax_percent: tax ? num(tax.percent) : 0, tax_amount: num(it.tax_amount), total: num(it.total),
          status: it.status, is_reviewed: reviewedItems.has(Number(it.id)), return_status: rets.length ? rets[0].status : null,
          category_id: sid(p?.category_id), stock_source: o.mode === 'quick' && o.store_id ? 'store' : 'central',
          return_allowed: p ? bool(p.return_allowed) : false, return_days: p ? Number(p.return_days) : 0, cancelable: p ? bool(p.cancelable) : true,
        };
      });
      const discount = num(o.discount);
      const promoDiscount = num(o.promo_discount);
      const timeline = (histByOrder.get(String(o.id)) ?? [])
        .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at) || a.id - b.id)
        .map((h) => ({ status: h.status, label: ORDER_STATUS_LABELS[h.status] ?? h.status, at: ts(h.created_at), by: uidOf(h.changed_by_id), note: h.note ?? null }));
      const customerPhone = userPhone(u);
      W.set('orders', `orders/${o.id}`, {
        order_number: o.order_number, user_id: uidOf(o.user_id), customer: { name: u?.name ?? snap?.name ?? 'Customer', phone: customerPhone, email: u?.email ?? null },
        store_id: sid(o.store_id), zone_id: sid(o.zone_id), country_id: sid(o.country_id), address_id: sid(o.address_id), address,
        mode: o.mode, delivery_type: o.delivery_type, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status, transaction_id: o.transaction_id,
        items,
        totals: {
          subtotal: num(o.subtotal), savings: num(discount + (promoCashback ? 0 : promoDiscount)), discount, promo_discount: promoDiscount,
          delivery_charge: num(o.delivery_charge), surge_charge: num(o.surge_charge), additional_charges: 0, tax_amount: num(o.tax_amount),
          wallet_used: num(o.wallet_used), total: num(o.total), grand_total: grandTotal(o),
        },
        promo_code: promo ? String(promo.code).toUpperCase() : null, promo_code_id: sid(o.promo_code_id), promo_is_cashback: promoCashback,
        delivery_boy_id: riderUidOf(o.delivery_boy_id),
        delivery_boy: d && du ? { name: du.name, phone: userPhone(du), avatar: du.avatar ? await img(du.avatar, `users/${uidOf(du.id)}`) : null, vehicle_number: d.vehicle_number } : null,
        rider: d && ACTIVE_STATUSES.includes(o.status) && d.current_lat !== null ? { lat: num(d.current_lat, 7), lng: num(d.current_lng, 7), updated_at: ts(d.location_updated_at) } : null,
        timeline, cancel_reason: o.cancel_reason, cancelled_by: o.cancelled_by, notes: o.notes,
        estimated_delivery_at: ts(o.estimated_delivery_at), assigned_at: ts(o.assigned_at), delivered_at: ts(o.delivered_at), invoice_path: o.invoice_path,
        can_cancel: CANCELABLE_STATUSES.includes(o.status), all_cancelable: items.every((i) => i.cancelable), platform: null,
        search_keywords: searchKeywords(o.order_number, u?.name, customerPhone, u?.phone),
        created_at: ts(o.created_at), updated_at: ts(o.updated_at),
      });
      W.set('orders', `orders/${o.id}/secret/otp`, { delivery_otp: o.delivery_otp ?? null });
    }

  if (want('return_requests'))
    for (const r of T.return_requests) {
      const o = orders.get(Number(r.order_id));
      const it = orderItems.get(Number(r.order_item_id));
      W.set('return_requests', `return_requests/${r.id}`, {
        return_number: r.return_number, order_id: String(r.order_id), order_number: o?.order_number ?? null, user_id: uidOf(r.user_id),
        item_id: String(r.order_item_id), item_variant_id: sid(it?.product_variant_id), product_id: sid(it?.product_id),
        item_name: it ? [it.product_name, it.variant_name].filter(Boolean).join(' - ') : null, qty: Number(r.qty), reason: r.reason,
        images: await imgs(r.images, `users/${uidOf(r.user_id)}/returns`), status: r.status, refund_amount: num(r.refund_amount), refund_method: r.refund_method,
        delivery_boy_id: riderUidOf(r.delivery_boy_id), admin_remark: r.admin_remark, store_id: sid(o?.store_id), zone_id: sid(o?.zone_id),
        created_at: ts(r.created_at), updated_at: ts(r.updated_at),
      });
    }
  if (want('withdrawal_requests'))
    for (const w of T.withdrawal_requests) {
      const uid = uidOf(w.user_id)!;
      W.set('withdrawal_requests', `withdrawal_requests/${w.id}`, {
        user_id: uid, user_type: w.user_type, user_name: users.get(Number(w.user_id))?.name ?? null, amount: num(w.amount), message: w.message,
        status: w.status, remark: w.remark, receipt_image: await img(w.receipt_image, `users/${uid}/withdrawals`),
        created_at: ts(w.created_at), processed_at: ts(w.processed_at), updated_at: ts(w.updated_at),
      });
    }
  // cash_collections.store_id: the order's store, else the store of the rider's zone (zone default store / first store)
  const cashStoreId = (c: any): string | null => {
    const o = c.order_id ? orders.get(Number(c.order_id)) : null;
    if (o?.store_id) return sid(o.store_id);
    const boy = deliveryBoys.get(Number(c.delivery_boy_id));
    const zone = boy?.zone_id ? zones.get(Number(boy.zone_id)) : null;
    if (!zone) return null;
    const st = (zone.default_store_id && stores.get(Number(zone.default_store_id))) || T.stores.find((x) => Number(x.zone_id) === Number(zone.id));
    return st ? sid(st.id) : null;
  };
  if (want('cash_collections'))
    for (const c of T.cash_collections)
      W.set('cash_collections', `cash_collections/${c.id}`, {
        delivery_boy_id: riderUidOf(c.delivery_boy_id), order_id: sid(c.order_id), order_number: c.order_id ? orders.get(Number(c.order_id))?.order_number ?? null : null,
        store_id: cashStoreId(c), amount: num(c.amount), type: c.type, message: c.message,
        status: c.status, created_at: ts(c.created_at),
      });
  if (want('delivery_earnings'))
    for (const e of T.delivery_boy_earnings)
      W.set('delivery_earnings', `delivery_earnings/${e.id}`, {
        delivery_boy_id: riderUidOf(e.delivery_boy_id), order_id: sid(e.order_id), order_number: e.order_id ? orders.get(Number(e.order_id))?.order_number ?? null : null,
        amount: num(e.amount), type: e.type, status: e.status,
        created_at: ts(e.created_at), updated_at: ts(e.updated_at),
      });
  if (want('referrals'))
    for (const r of T.referrals)
      W.set('referrals', `referrals/${r.id}`, {
        referrer_id: uidOf(r.referrer_id), referred_id: uidOf(r.referred_id), referred_name: users.get(Number(r.referred_id))?.name ?? null,
        referrer_reward: num(r.referrer_reward), referred_reward: num(r.referred_reward), min_order: num(r.min_order), status: r.status,
        created_at: ts(r.created_at), updated_at: ts(r.updated_at),
      });

  // ENGAGEMENT
  if (want('chats')) {
    const msgsByChat = groupBy(T.chat_messages, (m) => m.chat_id);
    for (const c of T.chats) {
      const uid = uidOf(c.user_id)!;
      const msgs = (msgsByChat.get(String(c.id)) ?? []).sort((a, b) => a.id - b.id);
      const last = msgs[msgs.length - 1];
      const fromUser = (t: string) => t === 'customer' || t === 'delivery_boy';
      W.set('chats', `chats/${c.id}`, {
        user_id: uid, user_uid: uid, store_id: c.order_id ? sid(orders.get(Number(c.order_id))?.store_id) : null, user_type: c.user_type, user_name: users.get(Number(c.user_id))?.name ?? null,
        order_id: sid(c.order_id), order_number: c.order_id ? orders.get(Number(c.order_id))?.order_number ?? null : null, subject: c.subject, status: c.status,
        last_message: last ? { text: last.message ?? (last.attachment ? '[attachment]' : ''), sender_type: last.sender_type, at: ts(last.created_at) } : null,
        last_message_at: ts(c.last_message_at ?? last?.created_at),
        unread_admin: msgs.filter((m) => !m.read_at && fromUser(m.sender_type)).length,
        unread_user: msgs.filter((m) => !m.read_at && !fromUser(m.sender_type)).length,
        created_at: ts(c.created_at), updated_at: ts(c.updated_at),
      });
      for (const m of msgs)
        W.set('chats', `chats/${c.id}/messages/${m.id}`, {
          user_uid: uid, sender_id: uidOf(m.sender_id), sender_type: m.sender_type, sender_name: m.sender_id ? users.get(Number(m.sender_id))?.name ?? null : null,
          message: m.message ?? '', attachment: await img(m.attachment, `users/${uid}/chat`), read_at: ts(m.read_at), created_at: ts(m.created_at),
        });
    }
  }
  if (want('notifications')) {
    const sent = groupBy(T.user_notifications, (n) => n.notification_id);
    for (const n of T.notifications)
      W.set('notifications', `notifications/${n.id}`, {
        title: n.title, message: n.message, type: n.type, link: n.link, image: await catalogAsset(M.notifications?.[n.id]?.image, n.image), target: n.target, user_id: uidOf(n.user_id),
        user_name: n.user_id ? users.get(Number(n.user_id))?.name ?? null : null, store_id: 'store_id' in n ? sid(n.store_id) : null, // admin broadcasts
        sent_at: ts(n.sent_at), sent_count: (sent.get(String(n.id)) ?? []).length, created_at: ts(n.created_at),
      });
  }
  if (want('blog_categories'))
    for (const b of T.blog_categories)
      W.set('blog_categories', `blog_categories/${b.id}`, { name: tr(b.name), slug: b.slug, created_at: ts(b.created_at), updated_at: ts(b.updated_at) });
  if (want('blogs'))
    for (const b of T.blogs)
      W.set('blogs', `blogs/${b.id}`, {
        category_id: sid(b.blog_category_id), title: tr(b.title), slug: b.slug, image: await catalogAsset(M.blogs?.[b.id]?.image, b.image), excerpt: tr(b.excerpt), content: tr(b.content),
        read_minutes: Number(b.read_minutes), views: Number(b.views), status: activeStatus(b.status), published_at: ts(b.created_at),
        search_keywords: searchKeywords(tr(b.title)), created_at: ts(b.created_at), updated_at: ts(b.updated_at),
      });
  if (want('faqs'))
    for (const f of T.faqs)
      W.set('faqs', `faqs/${f.id}`, { question: tr(f.question), answer: tr(f.answer), sort_order: Number(f.sort), status: activeStatus(f.status), created_at: ts(f.created_at), updated_at: ts(f.updated_at) });
  if (want('pages'))
    for (const p of T.pages) W.set('pages', `pages/${p.slug}`, { slug: p.slug, title: tr(p.title), content: tr(p.content), updated_at: ts(p.updated_at) });
  if (want('email_templates'))
    for (const e of T.email_templates) W.set('email_templates', `email_templates/${e.key}`, { key: e.key, subject: e.subject, body: e.body ?? '', updated_at: ts(e.updated_at) });
  if (want('mail_log'))
    for (const e of T.email_logs) W.set('mail_log', `mail_log/${e.id}`, { to: e.to, subject: e.subject, body: e.body, status: e.status, error: e.error, created_at: ts(e.created_at) });

  if (want('counters')) {
    const maxSeq = (list: string[]) => list.reduce((m, s) => Math.max(m, Number(String(s).match(/(\d+)\s*$/)?.[1] ?? 0)), 0);
    W.set('counters', 'counters/orders', { value: maxSeq(T.orders.map((o) => o.order_number)) });
    W.set('counters', 'counters/returns', { value: maxSeq(T.return_requests.map((r) => r.return_number)) });
  }
  if (want('stats_daily')) for (const [key, doc] of stats) W.set('stats_daily', `stats_daily/${key}`, doc);

  await W.close();
  log('Writes per step:');
  for (const s of STEPS) if (W.counts.has(s)) console.log(`  ${s.padEnd(22)} ${W.counts.get(s)}`);
  log(`Catalog images (assets/manifest.json): used=${catalogStats.used} missing-files=${catalogStats.missing.length}${catalogStats.missing.length ? ' ' + JSON.stringify(catalogStats.missing.slice(0, 10)) : ''}`);
  log(`Storage: uploaded=${uploads.uploaded} absolute-urls-kept=${uploads.kept} missing-local-files=${uploads.missing.length}${uploads.missing.length ? ' ' + JSON.stringify(uploads.missing) : ''}`);
  if (W.failures) throw new Error(`${W.failures} Firestore writes failed`);
  log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s${args.dryRun ? ' (dry run — nothing written)' : ''}.`);

  // ---------------------------------------------------------------------------------------------------
  async function remapSections(sections: any[] | null) {
    const out = [];
    for (const s of Array.isArray(sections) ? sections : []) {
      const st = { ...(s.settings ?? {}) };
      for (const k of ['banner_ids', 'category_ids', 'product_ids', 'brand_ids']) if (Array.isArray(st[k])) st[k] = st[k].map(String);
      for (const k of ['category_id', 'parent_id']) if (k in st) st[k] = sid(st[k]);
      if (typeof st.image === 'string') st.image = await layoutImg(st.image);
      if (Array.isArray(st.images)) st.images = await Promise.all(st.images.map(async (i: any) => (i && typeof i === 'object' ? { ...i, image: await layoutImg(i.image), link_value: sid(i.link_value) } : i)));
      if ('link_value' in st) st.link_value = sid(st.link_value);
      if (s.type === 'product_slider' && typeof st.limit === 'number') st.limit = Math.min(30, st.limit);
      out.push({ id: String(s.id), type: s.type, title: tr(s.title), is_active: s.is_active !== false, sort: Number(s.sort ?? out.length + 1), settings: st });
    }
    return out;
  }

  async function migrateAuth() {
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const records: UserImportRecord[] = [];
    const skipped: string[] = [];
    for (const u of liveUsers) {
      const uid = uidOf(u.id)!;
      const rec: UserImportRecord = { uid, displayName: u.name || undefined, disabled: !bool(u.status) };
      const email = u.email ? String(u.email).trim().toLowerCase() : null;
      if (email) {
        if (seenEmail.has(email)) skipped.push(`${uid}: duplicate email ${email}`);
        else {
          seenEmail.add(email);
          rec.email = email;
          rec.emailVerified = !!u.email_verified_at;
        }
      }
      const phone = userPhone(u);
      if (u.phone && !phone) skipped.push(`${uid}: invalid phone ${u.country_code ?? ''} ${u.phone}`);
      if (phone) {
        if (seenPhone.has(phone)) skipped.push(`${uid}: duplicate phone ${phone}`);
        else {
          seenPhone.add(phone);
          rec.phoneNumber = phone;
        }
      }
      if (u.avatar && /^https?:\/\//.test(u.avatar)) rec.photoURL = u.avatar;
      if (u.password && /^\$2[aby]\$/.test(u.password)) rec.passwordHash = Buffer.from(String(u.password).replace(/^\$2y\$/, '$2a$'));
      const claims: Record<string, string> = { role: u.type };
      if (u.store_id) claims.store_id = String(u.store_id);
      if (u.role_id) claims.role_id = String(u.role_id);
      const db = dbByUser.get(Number(u.id));
      if (u.type === 'delivery_boy' && db?.zone_id && db.approval_status === 'approved') claims.zone_id = String(db.zone_id);
      rec.customClaims = claims;
      rec.metadata = {
        creationTime: u.created_at ? new Date(u.created_at).toUTCString() : undefined,
        lastSignInTime: u.last_login_at ? new Date(u.last_login_at).toUTCString() : undefined,
      };
      records.push(rec);
    }
    for (const s of skipped) console.warn(`  auth: ${s}`);
    W.counts.set('auth', records.length);

    // Demo accounts = users whose BCRYPT hash matches a known demo password (DEFAULT_EMULATOR_PASSWORDS + --emulator-passwords),
    // e.g. admin@gmail.com / 123456. Production default: import them disabled (--demo-accounts=disable).
    if (args.demoAccounts !== 'keep' || args.prod) {
      const known = [...new Set([...DEFAULT_EMULATOR_PASSWORDS, ...args.emulatorPasswords])];
      const byUid = new Map(liveUsers.map((u) => [uidOf(u.id)!, u]));
      const demo: { rec: UserImportRecord; type: string }[] = [];
      await Promise.all(records.map(async (rec) => {
        const u = byUid.get(rec.uid);
        if (!u?.password || !/^\$2[aby]\$/.test(u.password)) return;
        const hash = String(u.password).replace(/^\$2y\$/, '$2a$');
        for (const pw of known) if (await bcrypt.compare(pw, hash)) { demo.push({ rec, type: String(u.type) }); return; }
      }));
      for (const { rec } of demo) {
        if (args.demoAccounts === 'disable') rec.disabled = true;
        else if (args.demoAccounts === 'reset-passwords') delete rec.passwordHash; // no password: sign in via "Forgot password"
      }
      const action = { keep: 'KEPT ACTIVE with their demo passwords (!)', disable: 'imported DISABLED', 'reset-passwords': 'imported WITHOUT a password (use password reset)' }[args.demoAccounts];
      console.warn(`\n=== Demo accounts (known demo password): ${demo.length} — ${action} ===`);
      for (const { rec, type } of demo.sort((a, b) => a.type.localeCompare(b.type))) console.warn(`  [${type}] ${rec.uid}  ${rec.email ?? rec.phoneNumber ?? ''}`);
      if (args.prod && args.demoAccounts === 'keep' && demo.length) console.warn('  WARNING: --demo-accounts=keep in production leaves well-known credentials (e.g. admin@gmail.com / 123456) working.');
      console.warn('');
      W.counts.set('auth_demo_accounts', demo.length);
    }
    if (args.dryRun) return;
    let ok = 0;
    for (let i = 0; i < records.length; i += 1000) {
      const batch = records.slice(i, i + 1000);
      // Idempotency: importUsers replaces existing accounts with the same uid.
      let res = await fb.auth.importUsers(batch, { hash: { algorithm: 'BCRYPT' } });
      ok += res.successCount;
      // Re-run: accounts that already exist cannot be overwritten by importUsers -> delete + re-import them
      // (uid is preserved; the account is reset to the MySQL state, including the BCRYPT hash).
      const existing = res.errors.filter((e) => /exist|overwrite/i.test(`${e.error.code} ${e.error.message}`)).map((e) => batch[e.index]);
      const other = res.errors.filter((e) => !existing.includes(batch[e.index]));
      if (existing.length) {
        await fb.auth.deleteUsers(existing.map((r) => r.uid));
        res = await fb.auth.importUsers(existing, { hash: { algorithm: 'BCRYPT' } });
        ok += res.successCount;
        other.push(...res.errors.map((e) => ({ ...e, index: batch.indexOf(existing[e.index]) })));
        log(`Auth: ${existing.length} existing accounts replaced (delete + re-import)`);
      }
      for (const e of other) console.error(`  auth import error uid=${batch[e.index].uid}: ${e.error.message}`);
    }
    log(`Auth: imported ${ok}/${records.length} users (BCRYPT hashes)`);

    if (fb.emulator) {
      // The Auth emulator stores imported hashes verbatim and can only verify its own fake hash format,
      // so BCRYPT-imported passwords never verify there. For local dev only, re-set the plaintext password of
      // users whose BCRYPT hash matches one of the known demo passwords (bcrypt-verified locally).
      const candidates = [...new Set([...DEFAULT_EMULATOR_PASSWORDS, ...args.emulatorPasswords])];
      let shimmed = 0;
      const work = liveUsers.filter((u) => u.password && /^\$2[aby]\$/.test(u.password));
      await Promise.all(
        work.map(async (u) => {
          const hash = String(u.password).replace(/^\$2y\$/, '$2a$');
          for (const pw of candidates) {
            if (await bcrypt.compare(pw, hash)) {
              await fb.auth.updateUser(uidOf(u.id)!, { password: pw });
              shimmed++;
              return;
            }
          }
        }),
      );
      log(`Auth emulator shim: plaintext demo password set for ${shimmed}/${work.length} users (emulator only).`);
    }
  }
}

/** Laravel Setting::castValue */
function castSetting(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value) && !/^(0\d|\+)/.test(value) && value.length < 16) return value.includes('.') ? parseFloat(value) : parseInt(value, 10);
  if (value[0] === '{' || value[0] === '[') {
    try {
      return JSON.parse(value);
    } catch {
      /* raw */
    }
  }
  return value;
}

main().catch((e) => {
  console.error('MIGRATION FAILED:', e);
  process.exit(1);
});
