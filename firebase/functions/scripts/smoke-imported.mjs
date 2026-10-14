// Smoke test against the migrated emulator data (firebase/tools/emulator-data).
// Run inside emulators:exec with --import (see README): signs in customer@gmail.com, places a COD order in the
// Mumbai zone and checks that stats_daily all/store_x/zone_x increment.
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const P = { auth: process.env.AUTH_PORT ?? '9099', fn: Number(process.env.FUNCTIONS_PORT ?? 5001) };
adminInit({ projectId: 'qwikmart-37299' });
const db = getFirestore();
const app = initializeApp({ projectId: 'qwikmart-37299', apiKey: 'fake' });
const a = getAuth(app);
connectAuthEmulator(a, `http://127.0.0.1:${P.auth}`, { disableWarnings: true });
const fns = getFunctions(app, 'asia-south1');
connectFunctionsEmulator(fns, '127.0.0.1', P.fn);
const call = async (n, d) => (await httpsCallable(fns, n, { timeout: 120_000 })(d)).data;
const ist = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const cred = await signInWithEmailAndPassword(a, process.env.SMOKE_EMAIL ?? 'customer@gmail.com', process.env.SMOKE_PASSWORD ?? '123456');
const uid = cred.user.uid;
console.log('signed in', uid);
const prof = await call('syncProfile', { app: 'customer' });
console.log('profile', prof.user.name, 'wallet', prof.user.wallet_balance, 'is_new', prof.is_new);

const zone = await call('detectZone', { lat: 19.076, lng: 72.8777 });
console.log('detectZone', zone.deliverable, zone.zone?.id, zone.store?.id, zone.distance_km);
const zoneId = zone.zone.id;
const storeId = zone.store.id;

// pick an in-stock product of that store
const ss = await db.collection('store_stocks').where('store_id', '==', storeId).where('stock', '>', 3).limit(20).get();
let line = null;
for (const s of ss.docs) {
  const p = await db.doc(`products/${s.get('product_id')}`).get();
  if (p.exists && p.get('status') === 'active' && ['quick', 'both'].includes(p.get('fulfillment_type')) && p.get('cod_allowed') !== false) { line = s.data(); break; }
}
if (!line) throw new Error('no in-stock product found for store ' + storeId);
await db.doc(`users/${uid}/cart/quick_${storeId}_${line.variant_id}`).set({ product_id: line.product_id, variant_id: line.variant_id, store_id: storeId, mode: 'quick', qty: 2, added_at: new Date() });

let addresses = await db.collection(`users/${uid}/addresses`).get();
let address = addresses.docs.find((d) => d.get('lat'));
if (!address) {
  const ref = await db.collection(`users/${uid}/addresses`).add({ label: 'Smoke', name: 'Smoke', phone: '+919999999999', address_line: 'Andheri', city: 'Mumbai', lat: 19.08, lng: 72.88, is_default: false });
  address = await ref.get();
}
const summary = await call('cartSummary', { zone_id: zoneId, mode: 'quick', address_id: address.id });
console.log('cartSummary', { subtotal: summary.subtotal, delivery: summary.delivery_charge, surge: summary.surge_charge, grand: summary.grand_total, issues: summary.issues });

const date = ist();
const scopes = ['all', `store_${storeId}`, `zone_${zoneId}`];
const before = {};
for (const s of scopes) before[s] = (await db.doc(`stats_daily/${s}_${date}`).get()).data() ?? { orders: 0, revenue: 0 };
const order = await call('placeOrder', { zone_id: zoneId, mode: 'quick', address_id: address.id, delivery_type: 'delivery', payment_method: 'cod', platform: 'app' });
console.log('placed', order.order_number, order.order_id);
const o = (await db.doc(`orders/${order.order_id}`).get()).data();
const grand = o.totals.grand_total;

const deadline = Date.now() + 30_000;
let ok = false;
while (Date.now() < deadline && !ok) {
  ok = true;
  for (const s of scopes) {
    const d = (await db.doc(`stats_daily/${s}_${date}`).get()).data() ?? {};
    if ((d.orders ?? 0) !== (before[s].orders ?? 0) + 1 || Math.abs((d.revenue ?? 0) - (before[s].revenue ?? 0) - grand) > 0.01) ok = false;
  }
  if (!ok) await new Promise((r) => setTimeout(r, 500));
}
for (const s of scopes) {
  const d = (await db.doc(`stats_daily/${s}_${date}`).get()).data();
  console.log(`stats_daily/${s}_${date}`, 'orders', before[s].orders ?? 0, '→', d?.orders, 'revenue', before[s].revenue ?? 0, '→', d?.revenue);
}
// clean up: cancel the smoke order (restocks + reverses stats revenue)
await call('cancelOrder', { order_id: order.order_id, reason: 'smoke test' });
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(ok ? 0 : 1);
