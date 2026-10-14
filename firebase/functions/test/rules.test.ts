import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { PORTS, PROJECT_ID, uniq } from './helpers';

let env: RulesTestEnvironment;
const T = uniq('r');
const ids = {
  customer: `cust_${T}`, other: `other_${T}`, rider: `rider_${T}`, store: `storeu_${T}`, staffOk: `staffok_${T}`, staffNo: `staffno_${T}`, admin: `admin_${T}`,
  storeA: `storeA_${T}`, storeB: `storeB_${T}`, zone: `zone_${T}`, order: `order_${T}`, orderB: `orderB_${T}`, pActive: `pa_${T}`, pDraft: `pd_${T}`,
  roleOk: `roleok_${T}`, roleNo: `roleno_${T}`, chat: `chat_${T}`,
};

const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  customer: () => env.authenticatedContext(ids.customer, { role: 'customer' }).firestore(),
  other: () => env.authenticatedContext(ids.other, { role: 'customer' }).firestore(),
  rider: () => env.authenticatedContext(ids.rider, { role: 'delivery_boy', zone_id: ids.zone }).firestore(),
  store: () => env.authenticatedContext(ids.store, { role: 'store', store_id: ids.storeA }).firestore(),
  staffOk: () => env.authenticatedContext(ids.staffOk, { role: 'staff', role_id: ids.roleOk }).firestore(),
  staffNo: () => env.authenticatedContext(ids.staffNo, { role: 'staff', role_id: ids.roleNo }).firestore(),
  admin: () => env.authenticatedContext(ids.admin, { role: 'admin' }).firestore(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: PORTS.firestore },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'settings/public'), { app_name: 'QwikMart' }, { merge: true });
    await setDoc(doc(d, 'settings/private_payment'), { stripe_secret: 'sk' });
    await setDoc(doc(d, `roles/${ids.roleOk}`), { name: 'Ops', scope: 'admin', permissions: ['order.list', 'order.view', 'product.*'] });
    await setDoc(doc(d, `roles/${ids.roleNo}`), { name: 'Blog', scope: 'admin', permissions: ['blog.*'] });
    await setDoc(doc(d, `users/${ids.customer}`), { type: 'customer', name: 'C', wallet_balance: 10, fcm_tokens: [] });
    await setDoc(doc(d, `products/${ids.pActive}`), { status: 'active', name: { en: 'A' }, store_id: ids.storeA, rating_avg: 0, rating_count: 0, sold_count: 0 });
    await setDoc(doc(d, `products/${ids.pDraft}`), { status: 'draft', name: { en: 'D' }, store_id: ids.storeB });
    await setDoc(doc(d, `orders/${ids.order}`), { user_id: ids.customer, store_id: ids.storeA, zone_id: ids.zone, delivery_boy_id: ids.rider, status: 'out_for_delivery' });
    await setDoc(doc(d, `orders/${ids.order}/secret/otp`), { delivery_otp: '123456' });
    await setDoc(doc(d, `orders/${ids.orderB}`), { user_id: ids.other, store_id: ids.storeB, zone_id: ids.zone, delivery_boy_id: null, status: 'received' });
    await setDoc(doc(d, `delivery_boys/${ids.rider}`), { zone_id: ids.zone, cash_in_hand: 0, approval_status: 'approved', location: null });
    await setDoc(doc(d, `store_stocks/${ids.storeA}_v1`), { store_id: ids.storeA, variant_id: 'v1', product_id: ids.pActive, stock: 5 });
    await setDoc(doc(d, `store_stocks/${ids.storeB}_v1`), { store_id: ids.storeB, variant_id: 'v1', product_id: ids.pDraft, stock: 5 });
    await setDoc(doc(d, `chats/${ids.chat}`), { user_id: ids.customer, user_uid: ids.customer, user_type: 'customer', status: 'open' });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('public catalog', () => {
  it('anyone reads settings/public and active products; drafts and private settings are hidden', async () => {
    await assertSucceeds(getDoc(doc(as.anon(), 'settings/public')));
    await assertSucceeds(getDoc(doc(as.anon(), `products/${ids.pActive}`)));
    await assertFails(getDoc(doc(as.anon(), `products/${ids.pDraft}`)));
    await assertSucceeds(getDocs(query(collection(as.anon(), 'products'), where('status', '==', 'active'))));
    await assertFails(getDocs(collection(as.anon(), 'products')));
    await assertFails(getDoc(doc(as.staffOk(), 'settings/private_payment')));
    await assertFails(getDoc(doc(as.anon(), 'settings/private_payment')));
    await assertSucceeds(getDoc(doc(as.admin(), 'settings/private_payment'))); // admin Settings page edits secrets
    await assertSucceeds(getDoc(doc(as.anon(), `store_stocks/${ids.storeA}_v1`)));
  });
  it('clients cannot write catalog; admin can; staff by permission', async () => {
    await assertFails(setDoc(doc(as.customer(), 'categories/x'), { name: { en: 'x' } }));
    await assertFails(updateDoc(doc(as.customer(), `products/${ids.pActive}`), { status: 'inactive' }));
    await assertSucceeds(setDoc(doc(as.admin(), `categories/c_${T}`), { name: { en: 'x' }, status: 'active' }));
    await assertSucceeds(updateDoc(doc(as.staffOk(), `products/${ids.pActive}`), { status: 'active', name: { en: 'A2' } }));
    await assertFails(updateDoc(doc(as.staffNo(), `products/${ids.pActive}`), { name: { en: 'A3' } }));
    await assertFails(updateDoc(doc(as.admin(), `products/${ids.pActive}`), { sold_count: 999 }));
    await assertFails(setDoc(doc(as.admin(), 'counters/orders'), { value: 1 }));
  });
});

describe('owner data', () => {
  it('users: owner read + whitelisted self-update only', async () => {
    await assertSucceeds(getDoc(doc(as.customer(), `users/${ids.customer}`)));
    await assertFails(getDoc(doc(as.other(), `users/${ids.customer}`)));
    await assertSucceeds(updateDoc(doc(as.customer(), `users/${ids.customer}`), { name: 'New', fcm_tokens: ['t'] }));
    await assertFails(updateDoc(doc(as.customer(), `users/${ids.customer}`), { wallet_balance: 1000 }));
    await assertFails(updateDoc(doc(as.customer(), `users/${ids.customer}`), { type: 'admin' }));
  });
  it('cart lines: id format and qty bounds', async () => {
    const line = (q: number) => ({ product_id: 'p', variant_id: 'v1', store_id: ids.storeA, mode: 'quick', qty: q });
    const id = `quick_${ids.storeA}_v1`;
    await assertSucceeds(setDoc(doc(as.customer(), `users/${ids.customer}/cart/${id}`), line(2)));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/cart/${id}`), line(0)));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/cart/${id}`), line(101)));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/cart/wrong_id`), line(1)));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/cart/${id}`), { ...line(1), price: 1 }));
    await assertFails(setDoc(doc(as.other(), `users/${ids.customer}/cart/${id}`), line(1)));
    await assertSucceeds(setDoc(doc(as.customer(), `users/${ids.customer}/cart/ecommerce_central_v1`), { ...line(1), mode: 'ecommerce', store_id: null }));
  });
  it('addresses, favorites, notifications read_at', async () => {
    await assertSucceeds(setDoc(doc(as.customer(), `users/${ids.customer}/addresses/a1`), { name: 'Me', phone: '+91', address_line: 'x', lat: 19, lng: 72 }));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/addresses/a2`), { name: 'Me', phone: '+91', address_line: 'x', lat: 'bad', lng: 72 }));
    await assertSucceeds(setDoc(doc(as.customer(), `users/${ids.customer}/favorites/${ids.pActive}`), { created_at: new Date() }));
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), `users/${ids.customer}/notifications/n1`), { title: 't', read_at: null }));
    await assertSucceeds(updateDoc(doc(as.customer(), `users/${ids.customer}/notifications/n1`), { read_at: new Date() }));
    await assertFails(updateDoc(doc(as.customer(), `users/${ids.customer}/notifications/n1`), { title: 'x' }));
    await assertFails(setDoc(doc(as.customer(), `users/${ids.customer}/wallet_transactions/t1`), { amount: 100 }));
  });
  it('orders: owner/rider/store/staff read; OTP hidden from the rider', async () => {
    await assertSucceeds(getDoc(doc(as.customer(), `orders/${ids.order}`)));
    await assertFails(getDoc(doc(as.other(), `orders/${ids.order}`)));
    await assertSucceeds(getDoc(doc(as.rider(), `orders/${ids.order}`)));
    await assertSucceeds(getDoc(doc(as.customer(), `orders/${ids.order}/secret/otp`)));
    await assertFails(getDoc(doc(as.rider(), `orders/${ids.order}/secret/otp`)));
    await assertFails(getDoc(doc(as.other(), `orders/${ids.order}/secret/otp`)));
    await assertSucceeds(getDoc(doc(as.admin(), `orders/${ids.order}/secret/otp`)));
    await assertFails(updateDoc(doc(as.customer(), `orders/${ids.order}`), { status: 'delivered' }));
    // rider zone pool query
    await assertSucceeds(getDocs(query(collection(as.rider(), 'orders'), where('zone_id', '==', ids.zone), where('delivery_boy_id', '==', null), where('status', 'in', ['received', 'processed', 'ready_for_pickup']))));
    await assertFails(getDocs(query(collection(as.rider(), 'orders'), where('zone_id', '==', ids.zone))));
    await assertSucceeds(getDocs(query(collection(as.customer(), 'orders'), where('user_id', '==', ids.customer))));
  });
  it('rider may update only its location', async () => {
    await assertSucceeds(updateDoc(doc(as.rider(), `delivery_boys/${ids.rider}`), { location: { lat: 19.1, lng: 72.9, updated_at: new Date() } }));
    await assertFails(updateDoc(doc(as.rider(), `delivery_boys/${ids.rider}`), { cash_in_hand: 999, location: { lat: 1, lng: 1 } }));
    await assertFails(updateDoc(doc(as.rider(), `delivery_boys/${ids.rider}`), { approval_status: 'rejected' }));
    await assertFails(updateDoc(doc(as.customer(), `delivery_boys/${ids.rider}`), { location: { lat: 1, lng: 1 } }));
  });
});

describe('panels', () => {
  it('store users are scoped to their store', async () => {
    await assertSucceeds(getDoc(doc(as.store(), `orders/${ids.order}`)));
    await assertFails(getDoc(doc(as.store(), `orders/${ids.orderB}`)));
    await assertSucceeds(updateDoc(doc(as.store(), `store_stocks/${ids.storeA}_v1`), { stock: 7, store_id: ids.storeA, variant_id: 'v1' }));
    await assertFails(updateDoc(doc(as.store(), `store_stocks/${ids.storeB}_v1`), { stock: 7 }));
    await assertSucceeds(setDoc(doc(as.store(), `products/new_${T}`), { store_id: ids.storeA, status: 'pending_approval', name: { en: 'N' } }));
    await assertFails(setDoc(doc(as.store(), `products/new2_${T}`), { store_id: ids.storeB, status: 'pending_approval', name: { en: 'N' } }));
    await assertFails(setDoc(doc(as.store(), `products/new3_${T}`), { store_id: ids.storeA, status: 'active', name: { en: 'N' } }));
    await assertSucceeds(getDocs(query(collection(as.store(), 'orders'), where('store_id', '==', ids.storeA))));
  });
  it('staff permissions come from roles/{role_id}', async () => {
    await assertSucceeds(getDoc(doc(as.staffOk(), `orders/${ids.orderB}`)));
    await assertFails(getDoc(doc(as.staffNo(), `orders/${ids.orderB}`)));
    await assertSucceeds(setDoc(doc(as.staffNo(), `blogs/b_${T}`), { title: { en: 'x' } }));
    await assertFails(setDoc(doc(as.staffOk(), `blogs/b2_${T}`), { title: { en: 'x' } }));
  });
});

describe('chats', () => {
  it('owner creates chat (whitelisted) and messages as itself; staff replies', async () => {
    const id = `chat2_${T}`;
    await assertSucceeds(setDoc(doc(as.customer(), `chats/${id}`), {
      user_id: ids.customer, user_uid: ids.customer, user_type: 'customer', user_name: 'C', order_id: null, order_number: null, subject: 'Help',
      status: 'open', last_message: null, last_message_at: null, unread_admin: 0, unread_user: 0, created_at: new Date(),
    }));
    await assertFails(setDoc(doc(as.customer(), `chats/x_${T}`), { user_id: ids.other, user_uid: ids.other, user_type: 'customer', user_name: 'C', subject: 'x', status: 'open' }));
    await assertFails(setDoc(doc(as.customer(), `chats/y_${T}`), { user_id: ids.customer, user_uid: ids.customer, user_type: 'customer', user_name: 'C', subject: 'x', status: 'open', unread_admin: 5 }));
    const msg = (sender: string, type: string) => ({ user_uid: ids.customer, sender_id: sender, sender_type: type, sender_name: 'N', message: 'hi', attachment: null, read_at: null, created_at: new Date() });
    await assertSucceeds(setDoc(doc(as.customer(), `chats/${ids.chat}/messages/m1`), msg(ids.customer, 'customer')));
    await assertFails(setDoc(doc(as.customer(), `chats/${ids.chat}/messages/m2`), msg(ids.other, 'customer')));
    await assertFails(setDoc(doc(as.customer(), `chats/${ids.chat}/messages/m3`), msg(ids.customer, 'admin')));
    await assertFails(setDoc(doc(as.other(), `chats/${ids.chat}/messages/m4`), msg(ids.other, 'customer')));
    await assertSucceeds(setDoc(doc(as.admin(), `chats/${ids.chat}/messages/m5`), msg(ids.admin, 'admin')));
    await assertSucceeds(getDoc(doc(as.customer(), `chats/${ids.chat}/messages/m5`)));
    await assertFails(getDoc(doc(as.other(), `chats/${ids.chat}`)));
    await assertFails(deleteDoc(doc(as.customer(), `chats/${ids.chat}`)));
  });
});
