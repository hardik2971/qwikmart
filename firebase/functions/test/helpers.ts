/** Test helpers: admin SDK against the emulators, client users that call callables through the Functions emulator. */
import { initializeApp as adminInit, getApps as adminApps } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectFirestoreEmulator, getFirestore as clientFirestore, Firestore as ClientFirestore } from 'firebase/firestore';

export const PROJECT_ID = 'qwikmart-37299';
export const PORTS = {
  firestore: Number(process.env.FIRESTORE_PORT ?? 8080),
  auth: Number(process.env.AUTH_PORT ?? 9099),
  functions: Number(process.env.FUNCTIONS_PORT ?? 5001),
  storage: Number(process.env.STORAGE_PORT ?? 9199),
};
process.env.GCLOUD_PROJECT ??= PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${PORTS.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${PORTS.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= `127.0.0.1:${PORTS.storage}`;

if (!adminApps().length) adminInit({ projectId: PROJECT_ID });
export const db = getFirestore();
export const auth = adminAuth();
export { Timestamp };

export const CALL_TIMEOUT = Number(process.env.CALL_TIMEOUT ?? 80_000);
export const RUN = Math.random().toString(36).slice(2, 7);
let seq = 0;
export const uniq = (p: string) => `${p}_${RUN}_${++seq}`;

export interface Client {
  uid: string;
  app: FirebaseApp;
  call<T = any>(name: string, data?: unknown): Promise<T>;
  fs: ClientFirestore;
}

/** Create an Auth emulator user (+ claims) and a signed-in client SDK instance. */
export async function makeUser(opts: { claims?: Record<string, unknown>; profile?: Record<string, unknown> | false; phone?: string } = {}): Promise<Client> {
  const email = `${uniq('u')}@test.qwikmart`.toLowerCase();
  const password = 'secret123';
  const rec = await auth.createUser({ email, password, displayName: 'Test User', ...(opts.phone ? { phoneNumber: opts.phone } : {}) });
  if (opts.claims) await auth.setCustomUserClaims(rec.uid, opts.claims);
  if (opts.profile !== false) {
    await db.doc(`users/${rec.uid}`).set({
      type: (opts.claims?.role as string) ?? 'customer', name: 'Test User', email, phone: opts.phone ?? '+919999900000', avatar: null,
      referral_code: rec.uid.slice(0, 8).toUpperCase(), referred_by: null, wallet_balance: 0, orders_count: 0, total_spent: 0,
      fcm_tokens: [], status: 'active', language: 'en', created_at: Timestamp.now(), ...(opts.profile ?? {}),
    });
  }
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key', authDomain: `${PROJECT_ID}.firebaseapp.com` }, rec.uid);
  const a = getAuth(app);
  connectAuthEmulator(a, `http://127.0.0.1:${PORTS.auth}`, { disableWarnings: true });
  await signInWithEmailAndPassword(a, email, password);
  const fns = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(fns, '127.0.0.1', PORTS.functions);
  const fs = clientFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', PORTS.firestore);
  return {
    uid: rec.uid,
    app,
    fs,
    call: async (name, data) => (await httpsCallable(fns, name, { timeout: CALL_TIMEOUT })(data ?? {})).data as any,
  };
}

/** Anonymous client (no auth) for open callables. */
export function anonClient(): { call<T = any>(name: string, data?: unknown): Promise<T> } {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, uniq('anon'));
  const fns = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(fns, '127.0.0.1', PORTS.functions);
  return { call: async (name, data) => (await httpsCallable(fns, name, { timeout: CALL_TIMEOUT })(data ?? {})).data as any };
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 30_000, stepMs = 300): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor timed out${last ? `: ${String(last)}` : ''}`);
}

/** Expect a callable to reject with an HttpsError code (client SDK prefixes "functions/"). */
export async function expectCode(p: Promise<unknown>, code: string, msg?: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== `functions/${code}`) throw new Error(`expected ${code}, got ${err.code}: ${err.message}`);
    if (msg && !msg.test(String(err.message))) throw new Error(`message "${err.message}" does not match ${msg}`);
    return;
  }
  throw new Error(`expected rejection with ${code}`);
}

/* ------------------------------------------------------------------ fixtures */
// A polygon around Mumbai.
export const MUMBAI_POLY = [
  { lat: 18.85, lng: 72.75 }, { lat: 18.85, lng: 73.05 }, { lat: 19.35, lng: 73.05 }, { lat: 19.35, lng: 72.75 },
];
export const STORE_LAT = 19.076;
export const STORE_LNG = 72.8777;

export async function seedSettings() {
  await db.doc('settings/public').set({
    app_name: 'QwikMart Test', tax_inclusive: true, currency_code: 'INR', currency_symbol: '₹',
    payment_methods: [
      { key: 'cod', name: 'Cash on Delivery', enabled: true }, { key: 'wallet', name: 'Wallet', enabled: true },
      { key: 'stripe', name: 'Stripe', enabled: false },
    ],
    cod: { enabled: true, max_amount: 0 },
    wallet: { min_recharge: 100, max_recharge: 10000, min_withdraw: 100 },
    referral: { enabled: true, referrer_reward: 50, referred_reward: 25, min_order: 100 },
  }, { merge: true });
}

export interface World {
  zoneId: string; storeId: string; p1: string; v1: string; p2: string; v2: string; categoryId: string;
}

/** Seed an isolated zone/store/catalog. */
export async function seedWorld(opts: { surge?: { from: string; to: string; amount: number }[]; tag?: string } = {}): Promise<World> {
  await seedSettings();
  const t = uniq(opts.tag ?? 'w');
  const zoneId = `zone_${t}`, storeId = `store_${t}`, categoryId = `cat_${t}`;
  const p1 = `p1_${t}`, v1 = `v1_${t}`, p2 = `p2_${t}`, v2 = `v2_${t}`;
  await db.doc('countries/in').set({ name: 'India', iso2: 'IN', dial_code: '+91', currency_code: 'INR', currency_symbol: '₹', timezone: 'Asia/Kolkata', status: 'active', is_default: true });
  await db.doc(`zones/${zoneId}`).set({
    country_id: 'in', name: `Mumbai ${t}`, slug: t, city: 'Mumbai', polygon: MUMBAI_POLY, center: { lat: STORE_LAT, lng: STORE_LNG },
    fulfillment_type: 'both', base_charge: 20, base_distance_km: 2, per_km_charge: 5, free_delivery_above: 500, min_order: 50,
    surge_slots: opts.surge ?? [], additional_charges: [], delivery_time_minutes: 10, default_store_id: storeId, status: 'active',
  });
  await db.doc(`stores/${storeId}`).set({
    zone_id: zoneId, country_id: 'in', name: `Store ${t}`, address: 'Andheri', city: 'Mumbai', lat: STORE_LAT, lng: STORE_LNG,
    fulfillment_type: 'both', commission_percent: 5, status: 'active', is_open: true, owner_uid: null,
  });
  await db.doc(`categories/${categoryId}`).set({ parent_id: null, name: { en: 'Grocery' }, slug: categoryId, status: 'active', sort_order: 1, show_in_quick: true, show_in_ecommerce: true });
  const product = (id: string, name: string, variant: Record<string, unknown>) => ({
    store_id: null, category_id: categoryId, sub_category_id: null, category_ids: [categoryId], brand_id: null, name: { en: name }, slug: id,
    product_type: 'simple', tax_percent: 5, return_allowed: true, return_days: 7, cancelable: true, cod_allowed: true, max_qty_per_order: 10,
    fulfillment_type: 'both', variants: [variant], rating_avg: 0, rating_count: 0, sold_count: 0, is_featured: true, status: 'active',
    images: [], thumbnail: null, created_at: Timestamp.now(),
  });
  await db.doc(`products/${p1}`).set(product(p1, 'Basmati Rice', { id: v1, name: '1 kg', price: 100, sale_price: 80, stock: 20, status: true }));
  await db.doc(`products/${p2}`).set(product(p2, 'Olive Oil', { id: v2, name: '1 L', price: 300, sale_price: null, stock: 5, status: true }));
  await db.doc(`store_stocks/${storeId}_${v1}`).set({ store_id: storeId, product_id: p1, variant_id: v1, stock: 50, price: null, sale_price: null });
  await db.doc(`store_stocks/${storeId}_${v2}`).set({ store_id: storeId, product_id: p2, variant_id: v2, stock: 10, price: null, sale_price: null });
  return { zoneId, storeId, p1, v1, p2, v2, categoryId };
}

export async function addAddress(uid: string, lat: number, lng: number): Promise<string> {
  const ref = await db.collection(`users/${uid}/addresses`).add({ label: 'Home', name: 'Test', phone: '+919999900000', address_line: 'Line 1', city: 'Mumbai', lat, lng, is_default: true });
  return ref.id;
}

export async function addToCart(uid: string, w: World, variant: 'v1' | 'v2', qty: number, mode: 'quick' | 'ecommerce' = 'quick') {
  const vid = w[variant];
  const pid = variant === 'v1' ? w.p1 : w.p2;
  const storeId = mode === 'quick' ? w.storeId : null;
  await db.doc(`users/${uid}/cart/${mode}_${storeId ?? 'central'}_${vid}`).set({ product_id: pid, variant_id: vid, store_id: storeId, mode, qty, added_at: Timestamp.now() });
}

export async function addPromo(code: string, data: Record<string, unknown>) {
  await db.collection('promo_codes').doc(code).set({
    code, title: { en: code }, discount_type: 'percent', discount_value: 10, max_discount: null, min_order: 0, usage_limit_total: null,
    usage_limit_per_user: null, used_count: 0, is_permanent: true, applies_to: 'all', applies_to_ids: [], audience: 'all', channels: [], platforms: [],
    zone_ids: [], country_ids: [], time_from: null, time_to: null, is_cashback: false, status: 'active', ...data,
  });
}

export async function makeRider(w: World, opts: { commission_type?: 'percent' | 'fixed'; commission_value?: number } = {}): Promise<Client> {
  const c = await makeUser({ claims: { role: 'delivery_boy', zone_id: w.zoneId }, profile: { type: 'delivery_boy', name: 'Rider' } });
  await db.doc(`delivery_boys/${c.uid}`).set({
    zone_id: w.zoneId, country_id: 'in', vehicle_number: 'MH01', commission_type: opts.commission_type ?? 'percent', commission_value: opts.commission_value ?? 10,
    cash_in_hand: 0, earnings_total: 0, rating_avg: 0, rating_count: 0, is_online: false, location: null, approval_status: 'approved', status: 'active', name: 'Rider',
  });
  return c;
}

export const makeAdmin = () => makeUser({ claims: { role: 'admin' }, profile: { type: 'admin', name: 'Admin' } });
