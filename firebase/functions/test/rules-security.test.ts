/** Backend QA: adversarial Firestore + Storage rules tests (each attack must fail, legitimate access must work). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';
import { PORTS, PROJECT_ID, uniq } from './helpers';

let env: RulesTestEnvironment;
const T = uniq('rs');
const ids = {
  cust: `c_${T}`, other: `o_${T}`, rider: `r_${T}`, rider2: `r2_${T}`, farRider: `fr_${T}`, store: `su_${T}`, storeStaff: `ss_${T}`, staffNo: `sn_${T}`, admin: `a_${T}`,
  storeA: `sA_${T}`, storeB: `sB_${T}`, zoneA: `zA_${T}`, zoneB: `zB_${T}`, order: `ord_${T}`, orderB: `ordB_${T}`, prodA: `pA_${T}`, prodB: `pB_${T}`, prodPlat: `pP_${T}`,
  roleNo: `rn_${T}`, roleStoreList: `rsl_${T}`, chat: `ch_${T}`, promoB: `prB_${T}`,
};
const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims);
const as = {
  anon: () => env.unauthenticatedContext(),
  guest: () => ctx(`g_${T}`, { firebase: { sign_in_provider: 'anonymous' } }),
  cust: () => ctx(ids.cust, { role: 'customer' }),
  other: () => ctx(ids.other, { role: 'customer' }),
  rider: () => ctx(ids.rider, { role: 'delivery_boy', zone_id: ids.zoneA }),
  rider2: () => ctx(ids.rider2, { role: 'delivery_boy', zone_id: ids.zoneA }),
  store: () => ctx(ids.store, { role: 'store', store_id: ids.storeA }),
  storeStaff: () => ctx(ids.storeStaff, { role: 'store', store_id: ids.storeA, role_id: ids.roleStoreList }),
  staffNo: () => ctx(ids.staffNo, { role: 'staff', role_id: ids.roleNo }),
  admin: () => ctx(ids.admin, { role: 'admin' }),
};
const fs = (c: ReturnType<typeof as.cust>) => c.firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: PORTS.firestore },
    storage: { rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'), host: '127.0.0.1', port: PORTS.storage },
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const set = (p: string, v: Record<string, unknown>) => setDoc(doc(d, p), v);
    await set('settings/private_sms', { twilio_token: 'secret' });
    await set('settings/private_ai', { gemini_api_key: 'k' });
    await set(`roles/${ids.roleNo}`, { name: 'Blog', scope: 'admin', permissions: ['blog.*'] });
    await set(`roles/${ids.roleStoreList}`, { name: 'Lister', scope: 'store', store_id: ids.storeA, permissions: ['order.list'] });
    await set(`stores/${ids.storeA}`, { zone_id: ids.zoneA, name: 'A', status: 'active', orders_count: 0, revenue: 0 });
    await set(`stores/${ids.storeB}`, { zone_id: ids.zoneB, name: 'B', status: 'active' });
    await set(`users/${ids.cust}`, { type: 'customer', name: 'C', wallet_balance: 10, fcm_tokens: [], referral_code: 'AAA' });
    await set(`users/${ids.cust}/addresses/home`, { name: 'C', phone: '1', address_line: 'x', lat: 1, lng: 1 });
    await set(`users/${ids.cust}/wallet_transactions/t1`, { type: 'credit', amount: 10 });
    await set(`users/${ids.cust}/notifications/n1`, { title: 't', read_at: null });
    await set(`orders/${ids.order}`, { user_id: ids.cust, store_id: ids.storeA, zone_id: ids.zoneA, delivery_boy_id: ids.rider, status: 'out_for_delivery', totals: { total: 100 } });
    await set(`orders/${ids.order}/secret/otp`, { delivery_otp: '123456' });
    await set(`orders/${ids.orderB}`, { user_id: ids.other, store_id: ids.storeB, zone_id: ids.zoneB, delivery_boy_id: null, status: 'received' });
    await set(`delivery_boys/${ids.rider}`, { zone_id: ids.zoneA, cash_in_hand: 0, approval_status: 'approved', location: null, bank: { account: '1' } });
    await set(`delivery_boys/${ids.farRider}`, { zone_id: ids.zoneB, cash_in_hand: 0, approval_status: 'approved', location: null, bank: { account: '2' } });
    await set(`products/${ids.prodA}`, { status: 'active', store_id: ids.storeA, name: { en: 'A' }, rating_avg: 0, rating_count: 0, sold_count: 0, in_stock_store_ids: [ids.storeA] });
    await set(`products/${ids.prodB}`, { status: 'active', store_id: ids.storeB, name: { en: 'B' } });
    await set(`products/${ids.prodPlat}`, { status: 'active', store_id: null, name: { en: 'P' } });
    await set(`store_stocks/${ids.storeB}_v1`, { store_id: ids.storeB, variant_id: 'v1', product_id: ids.prodB, stock: 5 });
    await set(`promo_codes/${ids.promoB}`, { code: 'BBB', store_id: ids.storeB, used_count: 0, status: 'active' });
    await set(`chats/${ids.chat}`, { user_id: ids.cust, user_uid: ids.cust, user_type: 'customer', status: 'open', store_id: ids.storeA });
    await set(`chats/${ids.chat}/messages/m1`, { user_uid: ids.cust, sender_id: ids.cust, sender_type: 'customer', message: 'hi' });
    await set(`stats_daily/store_${ids.storeB}_2026-01-01`, { scope: `store_${ids.storeB}`, orders: 1 });
    await set(`withdrawal_requests/w_${T}`, { user_id: ids.cust, amount: 5, status: 'pending' });
    await set(`return_requests/rr_${T}`, { user_id: ids.cust, store_id: ids.storeA, status: 'pending' });
    await set(`counters/orders`, { value: 1 });
    await set(`promo_usages/x_${ids.cust}`, { count: 1 });
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const s = c.storage();
    await uploadString(ref(s, `users/${ids.other}/pic.jpg`), 'x', 'raw', { contentType: 'image/jpeg' });
    await uploadString(ref(s, `delivery_docs/${ids.rider}/licence.jpg`), 'x', 'raw', { contentType: 'image/jpeg' });
    await uploadString(ref(s, `catalog/products/platform.jpg`), 'x', 'raw', { contentType: 'image/jpeg' });
    await uploadString(ref(s, `invoices/${ids.order}/inv.pdf`), 'x', 'raw', { contentType: 'application/pdf' });
    await uploadString(ref(s, `exports/${ids.admin}/r.csv`), 'x', 'raw', { contentType: 'text/csv' });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('(a) other users\' private data', () => {
  it('orders, addresses, wallet, notifications, chats, withdrawals, returns of another customer are unreadable', async () => {
    const o = fs(as.other());
    await assertFails(getDoc(doc(o, `orders/${ids.order}`)));
    await assertFails(getDocs(query(collection(o, 'orders'))));
    await assertFails(getDocs(query(collection(o, 'orders'), where('user_id', '==', ids.cust))));
    await assertFails(getDoc(doc(o, `users/${ids.cust}`)));
    await assertFails(getDoc(doc(o, `users/${ids.cust}/addresses/home`)));
    await assertFails(getDocs(collection(o, `users/${ids.cust}/addresses`)));
    await assertFails(getDoc(doc(o, `users/${ids.cust}/wallet_transactions/t1`)));
    await assertFails(getDocs(collectionGroup(o, 'wallet_transactions')));
    await assertFails(getDoc(doc(o, `users/${ids.cust}/notifications/n1`)));
    await assertFails(getDoc(doc(o, `chats/${ids.chat}`)));
    await assertFails(getDoc(doc(o, `chats/${ids.chat}/messages/m1`)));
    await assertFails(addDoc(collection(o, `chats/${ids.chat}/messages`), { user_uid: ids.cust, sender_id: ids.other, sender_type: 'customer', sender_name: 'x', message: 'spoof' }));
    await assertFails(getDoc(doc(o, `withdrawal_requests/w_${T}`)));
    await assertFails(getDoc(doc(o, `return_requests/rr_${T}`)));
    await assertFails(getDocs(query(collection(o, 'users'))));
    // owner works
    const c = fs(as.cust());
    await assertSucceeds(getDoc(doc(c, `orders/${ids.order}`)));
    await assertSucceeds(getDocs(query(collection(c, 'orders'), where('user_id', '==', ids.cust))));
    await assertSucceeds(getDoc(doc(c, `users/${ids.cust}/wallet_transactions/t1`)));
  });
  it('a rider only sees assigned / own-zone pool orders, never other zones or other riders\' orders', async () => {
    await assertSucceeds(getDoc(doc(fs(as.rider()), `orders/${ids.order}`)));
    await assertFails(getDoc(doc(fs(as.rider2()), `orders/${ids.order}`)));
    await assertFails(getDoc(doc(fs(as.rider()), `orders/${ids.orderB}`)));
    await assertFails(getDoc(doc(fs(as.rider()), `delivery_boys/${ids.farRider}`)));
  });
});

describe('(b) delivery OTP', () => {
  it('readable by the owner / authorised panel only — never by the rider, other customers or unauthorised store staff', async () => {
    const p = `orders/${ids.order}/secret/otp`;
    await assertSucceeds(getDoc(doc(fs(as.cust()), p)));
    await assertSucceeds(getDoc(doc(fs(as.admin()), p)));
    await assertSucceeds(getDoc(doc(fs(as.store()), p)));
    await assertFails(getDoc(doc(fs(as.rider()), p)));
    await assertFails(getDoc(doc(fs(as.rider2()), p)));
    await assertFails(getDoc(doc(fs(as.other()), p)));
    await assertFails(getDoc(doc(fs(as.storeStaff()), p)));
    await assertFails(getDoc(doc(fs(as.staffNo()), p)));
    await assertFails(getDoc(doc(fs(as.anon()), p)));
    await assertFails(setDoc(doc(fs(as.cust()), p), { delivery_otp: '000000' }));
  });
});

describe('(c) self-escalation and server-owned fields', () => {
  it('customers cannot change role/type/wallet/counters or create/delete their profile docs', async () => {
    const c = fs(as.cust());
    for (const f of [{ type: 'admin' }, { role: 'admin' }, { wallet_balance: 99999 }, { orders_count: 0 }, { referral_code: 'X' }, { store_id: ids.storeA }, { role_id: 'r' }, { status: 'active' }]) {
      await assertFails(updateDoc(doc(c, `users/${ids.cust}`), f));
    }
    await assertSucceeds(updateDoc(doc(c, `users/${ids.cust}`), { name: 'New' }));
    await assertFails(setDoc(doc(fs(as.other()), `users/${ids.other}`), { type: 'admin', wallet_balance: 1e6 }));
    await assertFails(deleteDoc(doc(c, `users/${ids.cust}`)));
    await assertFails(setDoc(doc(c, `users/${ids.cust}/wallet_transactions/x`), { type: 'credit', amount: 1e6 }));
    await assertFails(setDoc(doc(c, `roles/${uniq('r')}`), { name: 'x', permissions: ['*'] }));
  });
  it('customers cannot write orders, prices, stock, status, ratings, reviews, promos, counters, stats', async () => {
    const c = fs(as.cust());
    await assertFails(updateDoc(doc(c, `orders/${ids.order}`), { status: 'delivered' }));
    await assertFails(updateDoc(doc(c, `orders/${ids.order}`), { 'totals.total': 0 }));
    await assertFails(setDoc(doc(c, `orders/${uniq('o')}`), { user_id: ids.cust, status: 'received', totals: { total: 0 } }));
    await assertFails(updateDoc(doc(c, `products/${ids.prodA}`), { rating_avg: 5 }));
    await assertFails(updateDoc(doc(c, `products/${ids.prodA}`), { variants: [{ id: 'v', price: 1 }] }));
    await assertFails(updateDoc(doc(c, `store_stocks/${ids.storeB}_v1`), { stock: 999 }));
    await assertFails(setDoc(doc(c, `reviews/${uniq('rv')}`), { product_id: ids.prodA, user_id: ids.cust, rating: 5, status: 'active' }));
    await assertFails(updateDoc(doc(c, `promo_codes/${ids.promoB}`), { used_count: 0 }));
    await assertFails(getDoc(doc(c, `promo_codes/${ids.promoB}`)));
    await assertFails(updateDoc(doc(c, 'counters/orders'), { value: 0 }));
    await assertFails(getDoc(doc(c, `promo_usages/x_${ids.cust}`)));
    await assertFails(setDoc(doc(c, `stats_daily/all_2026-01-01`), { revenue: 1 }));
    await assertFails(updateDoc(doc(c, `delivery_boys/${ids.rider}`), { cash_in_hand: 0 }));
    await assertFails(setDoc(doc(c, `delivery_boys/${ids.cust}`), { approval_status: 'approved', zone_id: ids.zoneA }));
  });
  it('riders cannot touch cash/earnings/approval/zone on their own doc', async () => {
    const r = fs(as.rider());
    for (const f of [{ cash_in_hand: 0 }, { approval_status: 'approved' }, { zone_id: ids.zoneB }, { earnings_total: 1e6 }, { rating_avg: 5 }, { commission_value: 99 }]) {
      await assertFails(updateDoc(doc(r, `delivery_boys/${ids.rider}`), f));
    }
    await assertSucceeds(updateDoc(doc(r, `delivery_boys/${ids.rider}`), { location: { lat: 1, lng: 2, updated_at: null } }));
  });
});

describe('(d) store users are confined to their store', () => {
  it('cannot write another store\'s products / stock / promos / store doc, or read its orders and stats', async () => {
    const s = fs(as.store());
    await assertFails(updateDoc(doc(s, `products/${ids.prodB}`), { name: { en: 'hacked' }, store_id: ids.storeB }));
    await assertFails(updateDoc(doc(s, `products/${ids.prodB}`), { store_id: ids.storeA }));
    await assertFails(updateDoc(doc(s, `products/${ids.prodPlat}`), { name: { en: 'x' }, store_id: ids.storeA }));
    await assertFails(deleteDoc(doc(s, `products/${ids.prodB}`)));
    await assertFails(updateDoc(doc(s, `store_stocks/${ids.storeB}_v1`), { stock: 0 }));
    await assertFails(setDoc(doc(s, `store_stocks/${ids.storeB}_v2`), { store_id: ids.storeB, variant_id: 'v2', product_id: ids.prodB, stock: 1 }));
    await assertFails(updateDoc(doc(s, `promo_codes/${ids.promoB}`), { discount_value: 100, store_id: ids.storeB }));
    await assertFails(updateDoc(doc(s, `stores/${ids.storeB}`), { is_open: false }));
    await assertFails(updateDoc(doc(s, `stores/${ids.storeA}`), { commission_percent: 0 }));
    await assertFails(updateDoc(doc(s, `stores/${ids.storeA}`), { revenue: 1e9 }));
    await assertFails(getDoc(doc(s, `orders/${ids.orderB}`)));
    await assertFails(getDoc(doc(s, `stats_daily/store_${ids.storeB}_2026-01-01`)));
    await assertFails(setDoc(doc(s, `zones/${ids.zoneA}`), { name: 'x' }));
    await assertFails(setDoc(doc(s, 'settings/public'), { app_name: 'x' }));
    await assertSucceeds(updateDoc(doc(s, `stores/${ids.storeA}`), { is_open: false }));
  });
  it('cannot list its product in other stores (in_stock_store_ids) or self-approve; stock values validated', async () => {
    const s = fs(as.store());
    await assertFails(updateDoc(doc(s, `products/${ids.prodA}`), { in_stock_store_ids: [ids.storeA, ids.storeB], store_id: ids.storeA }));
    await assertFails(setDoc(doc(s, `products/${uniq('np')}`), { store_id: ids.storeA, status: 'active', name: { en: 'x' } }));
    await assertFails(setDoc(doc(s, `products/${uniq('np')}`), { store_id: ids.storeA, status: 'pending_approval', in_stock_store_ids: [ids.storeB] }));
    await assertSucceeds(setDoc(doc(s, `products/${uniq('np')}`), { store_id: ids.storeA, status: 'pending_approval', name: { en: 'ok' } }));
    await assertSucceeds(updateDoc(doc(s, `products/${ids.prodA}`), { name: { en: 'renamed' }, store_id: ids.storeA }));
    await assertFails(setDoc(doc(s, `store_stocks/${ids.storeA}_vneg`), { store_id: ids.storeA, variant_id: 'vneg', product_id: ids.prodA, stock: -5 }));
    await assertFails(setDoc(doc(s, `store_stocks/${ids.storeA}_vzero`), { store_id: ids.storeA, variant_id: 'vzero', product_id: ids.prodA, stock: 5, price: 0 }));
    await assertSucceeds(setDoc(doc(s, `store_stocks/${ids.storeA}_vok`), { store_id: ids.storeA, variant_id: 'vok', product_id: ids.prodA, stock: 5, price: 50, sale_price: null }));
  });
  it('reads riders of its own zone only (bank details of other riders stay private)', async () => {
    const s = fs(as.store());
    await assertSucceeds(getDoc(doc(s, `delivery_boys/${ids.rider}`)));
    await assertFails(getDoc(doc(s, `delivery_boys/${ids.farRider}`)));
    await assertSucceeds(getDocs(query(collection(s, 'delivery_boys'), where('zone_id', '==', ids.zoneA))));
    await assertFails(getDocs(query(collection(s, 'delivery_boys'))));
  });
});

describe('(e) staff without permission', () => {
  it('cannot write catalog, settings, orders or read customers / private settings', async () => {
    const s = fs(as.staffNo());
    await assertFails(setDoc(doc(s, `products/${uniq('p')}`), { status: 'active', name: { en: 'x' } }));
    await assertFails(setDoc(doc(s, `categories/${uniq('c')}`), { name: { en: 'x' } }));
    await assertFails(setDoc(doc(s, `brands/${uniq('b')}`), { name: 'x' }));
    await assertFails(setDoc(doc(s, `zones/${uniq('z')}`), { name: 'x' }));
    await assertFails(setDoc(doc(s, 'settings/public'), { app_name: 'x' }, { merge: true }));
    await assertFails(getDoc(doc(s, `users/${ids.cust}`)));
    await assertFails(getDoc(doc(s, `orders/${ids.order}`)));
    await assertFails(setDoc(doc(s, `roles/${ids.roleNo}`), { name: 'Blog', scope: 'admin', permissions: ['*'] }));
    await assertSucceeds(setDoc(doc(s, `blogs/${uniq('b')}`), { title: { en: 'ok' }, status: 'active' }));
  });
});

describe('(f) anonymous / guest users', () => {
  it('guests cannot write reviews, orders, other carts; unauthenticated cannot read profiles', async () => {
    const g = fs(as.guest());
    await assertFails(setDoc(doc(g, `reviews/${uniq('r')}`), { rating: 5 }));
    await assertFails(setDoc(doc(g, `orders/${uniq('o')}`), { user_id: `g_${T}` }));
    await assertFails(setDoc(doc(g, `users/${ids.cust}/cart/quick_central_v1`), { product_id: 'p', variant_id: 'v1', store_id: null, mode: 'quick', qty: 1 }));
    await assertSucceeds(setDoc(doc(g, `users/g_${T}/cart/quick_central_v1`), { product_id: 'p', variant_id: 'v1', store_id: null, mode: 'quick', qty: 1 }));
    await assertFails(getDoc(doc(fs(as.anon()), `users/${ids.cust}`)));
    await assertFails(getDocs(collection(fs(as.anon()), 'orders')));
  });
});

describe('(h) secrets', () => {
  it('settings/private_* are readable by role admin only', async () => {
    for (const who of [as.cust, as.rider, as.store, as.storeStaff, as.staffNo, as.anon, as.guest]) {
      await assertFails(getDoc(doc(fs(who()), 'settings/private_sms')));
      await assertFails(getDoc(doc(fs(who()), 'settings/private_ai')));
      await assertFails(setDoc(doc(fs(who()), 'settings/private_ai'), { gemini_api_key: 'mine' }));
    }
    await assertSucceeds(getDoc(doc(fs(as.admin()), 'settings/private_sms')));
  });
});

describe('(i) Storage', () => {
  const img = (n = 10) => new Uint8Array(n);
  it('users cannot overwrite / read others\' files; only raster images ≤ 5 MB in their own folder', async () => {
    const s = as.cust().storage();
    await assertFails(uploadBytes(ref(s, `users/${ids.other}/pic.jpg`), img(), { contentType: 'image/jpeg' }));
    await assertFails(deleteObject(ref(s, `users/${ids.other}/pic.jpg`)));
    await assertFails(getBytes(ref(s, `users/${ids.other}/pic.jpg`)));
    await assertFails(uploadBytes(ref(s, `users/${ids.cust}/x.html`), img(), { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(s, `users/${ids.cust}/x.svg`), img(), { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(s, `users/${ids.cust}/big.jpg`), img(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadBytes(ref(s, `users/${ids.cust}/ok.jpg`), img(), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(s, `reviews/${ids.other}/r.jpg`), img(), { contentType: 'image/jpeg' }));
  });
  it('rider documents: owner + panel read; other users / riders cannot read; store users cannot overwrite', async () => {
    const p = `delivery_docs/${ids.rider}/licence.jpg`;
    await assertSucceeds(getBytes(ref(as.rider().storage(), p)));
    await assertSucceeds(getBytes(ref(as.admin().storage(), p)));
    await assertFails(getBytes(ref(as.rider2().storage(), p)));
    await assertFails(getBytes(ref(as.cust().storage(), p)));
    await assertFails(uploadBytes(ref(as.store().storage(), p), img(), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as.rider().storage(), `delivery_docs/${ids.rider}/x.exe`), img(), { contentType: 'application/octet-stream' }));
    await assertFails(uploadBytes(ref(as.rider().storage(), `delivery_docs/${ids.rider}/big.pdf`), img(10 * 1024 * 1024 + 1), { contentType: 'application/pdf' }));
  });
  it('catalog: public read; customers cannot write; store users add new images but cannot overwrite / delete', async () => {
    await assertSucceeds(getBytes(ref(as.anon().storage(), 'catalog/products/platform.jpg')));
    await assertFails(uploadBytes(ref(as.cust().storage(), 'catalog/products/x.jpg'), img(), { contentType: 'image/jpeg' }));
    const st = as.store().storage();
    await assertFails(uploadBytes(ref(st, 'catalog/products/platform.jpg'), img(), { contentType: 'image/jpeg' }));
    await assertFails(deleteObject(ref(st, 'catalog/products/platform.jpg')));
    await assertFails(uploadBytes(ref(st, `catalog/products/${T}.txt`), img(), { contentType: 'text/plain' }));
    await assertSucceeds(uploadBytes(ref(st, `catalog/products/${T}.jpg`), img(), { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadBytes(ref(as.admin().storage(), 'catalog/products/platform.jpg'), img(), { contentType: 'image/jpeg' }));
  });
  it('invoices / exports are function-only', async () => {
    await assertFails(getBytes(ref(as.cust().storage(), `invoices/${ids.order}/inv.pdf`)));
    await assertFails(getBytes(ref(as.admin().storage(), `exports/${ids.admin}/r.csv`)));
    await assertFails(uploadBytes(ref(as.admin().storage(), `invoices/${ids.order}/inv.pdf`), img(), { contentType: 'application/pdf' }));
  });
});

describe('B1/B3/B4 store staff, email templates, cash collections', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      await setDoc(doc(d, `roles/rok_${T}`), { name: 'Ops', scope: 'admin', permissions: ['customer.list', 'product.*', 'order.*'] });
      await setDoc(doc(d, `roles/remail_${T}`), { name: 'Mail', scope: 'admin', permissions: ['email.list'] });
      await setDoc(doc(d, `email_templates/order_placed`), { subject: 's', body: 'b' });
      await setDoc(doc(d, `cash_collections/ccA_${T}`), { delivery_boy_id: ids.rider, store_id: ids.storeA, amount: 5, type: 'collected_from_customer' });
      await setDoc(doc(d, `cash_collections/ccB_${T}`), { delivery_boy_id: ids.farRider, store_id: ids.storeB, amount: 5, type: 'collected_from_customer' });
    });
  });
  it('store staff: own-store reads by permission, no writes without permission, nothing of other stores', async () => {
    const s = fs(as.storeStaff()); // role: order.list only
    await assertSucceeds(getDoc(doc(s, `orders/${ids.order}`)));
    await assertFails(getDoc(doc(s, `orders/${ids.orderB}`)));
    await assertFails(updateDoc(doc(s, `products/${ids.prodA}`), { name: { en: 'x' }, store_id: ids.storeA }));
    await assertFails(setDoc(doc(s, `store_stocks/${ids.storeA}_v9`), { store_id: ids.storeA, variant_id: 'v9', product_id: ids.prodA, stock: 1 }));
    await assertFails(updateDoc(doc(s, `stores/${ids.storeA}`), { is_open: true }));
    await assertFails(setDoc(doc(s, `roles/${uniq('r')}`), { name: 'x', scope: 'store', store_id: ids.storeA, permissions: ['*'] }));
  });
  it('a staff token carrying a store_id never gets platform-wide permissions', async () => {
    const legacy = fs(ctx(`lg_${T}`, { role: 'staff', role_id: `rok_${T}`, store_id: ids.storeA }));
    await assertFails(getDoc(doc(legacy, `users/${ids.cust}`)));
    await assertFails(getDoc(doc(legacy, `orders/${ids.orderB}`)));
    await assertFails(setDoc(doc(legacy, `products/${uniq('p')}`), { status: 'active', name: { en: 'x' } }));
    const platform = fs(ctx(`pl_${T}`, { role: 'staff', role_id: `rok_${T}` }));
    await assertSucceeds(getDoc(doc(platform, `users/${ids.cust}`)));
  });
  it('email_templates: staff with email.list can list; store users read; only email.create writes', async () => {
    const mail = fs(ctx(`em_${T}`, { role: 'staff', role_id: `remail_${T}` }));
    await assertSucceeds(getDocs(collection(mail, 'email_templates')));
    await assertSucceeds(getDoc(doc(mail, 'email_templates/order_placed')));
    await assertFails(setDoc(doc(mail, 'email_templates/order_placed'), { subject: 'x' }));
    await assertSucceeds(getDocs(collection(fs(as.store()), 'email_templates')));
    await assertFails(setDoc(doc(fs(as.store()), 'email_templates/order_placed'), { subject: 'x' }));
    await assertFails(getDocs(collection(fs(as.cust()), 'email_templates')));
  });
  it('cash_collections: store reads rows of its store only', async () => {
    const s = fs(as.store());
    await assertSucceeds(getDocs(query(collection(s, 'cash_collections'), where('store_id', '==', ids.storeA))));
    await assertSucceeds(getDoc(doc(s, `cash_collections/ccA_${T}`)));
    await assertFails(getDoc(doc(s, `cash_collections/ccB_${T}`)));
    await assertFails(getDocs(collection(s, 'cash_collections')));
  });
});

