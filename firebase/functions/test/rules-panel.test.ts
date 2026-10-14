/** Rules added for the admin panel: wallet CG reads, private settings, home layout drafts, store-scoped chats / notifications. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { PORTS, PROJECT_ID, uniq } from './helpers';

let env: RulesTestEnvironment;
const T = uniq('rp');
const ids = {
  customer: `cust_${T}`, other: `other_${T}`, storeUser: `su_${T}`, storeA: `sA_${T}`, storeB: `sB_${T}`, zoneA: `zA_${T}`, zoneB: `zB_${T}`,
  order: `o_${T}`, orderB: `oB_${T}`, chatA: `cA_${T}`, chatB: `cB_${T}`, notifA: `nA_${T}`, notifAll: `nAll_${T}`,
  roleWallet: `rw_${T}`, roleNone: `rn_${T}`, roleSettings: `rs_${T}`,
};
const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  customer: () => env.authenticatedContext(ids.customer, { role: 'customer' }).firestore(),
  store: () => env.authenticatedContext(ids.storeUser, { role: 'store', store_id: ids.storeA }).firestore(),
  staffWallet: () => env.authenticatedContext(`sw_${T}`, { role: 'staff', role_id: ids.roleWallet }).firestore(),
  staffNone: () => env.authenticatedContext(`sn_${T}`, { role: 'staff', role_id: ids.roleNone }).firestore(),
  staffSettings: () => env.authenticatedContext(`ss_${T}`, { role: 'staff', role_id: ids.roleSettings }).firestore(),
  admin: () => env.authenticatedContext(`ad_${T}`, { role: 'admin' }).firestore(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: PORTS.firestore },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, `roles/${ids.roleWallet}`), { name: 'Finance', scope: 'admin', permissions: ['wallet.list'] });
    await setDoc(doc(d, `roles/${ids.roleNone}`), { name: 'Blog', scope: 'admin', permissions: ['blog.*'] });
    await setDoc(doc(d, `roles/${ids.roleSettings}`), { name: 'Settings', scope: 'admin', permissions: ['setting.*', 'home_builder.*'] });
    await setDoc(doc(d, `stores/${ids.storeA}`), { name: 'A', zone_id: ids.zoneA });
    await setDoc(doc(d, `users/${ids.customer}/wallet_transactions/t1`), { type: 'credit', amount: 10, created_at: new Date() });
    await setDoc(doc(d, 'settings/private_smtp'), { host: 'smtp.x' });
    await setDoc(doc(d, `orders/${ids.order}`), { user_id: ids.customer, store_id: ids.storeA, zone_id: ids.zoneA, status: 'received' });
    await setDoc(doc(d, `orders/${ids.orderB}`), { user_id: ids.other, store_id: ids.storeB, zone_id: ids.zoneB, status: 'received' });
    await setDoc(doc(d, `chats/${ids.chatA}`), { user_id: ids.customer, user_uid: ids.customer, user_type: 'customer', status: 'open', order_id: ids.order, store_id: ids.storeA, unread_admin: 2 });
    await setDoc(doc(d, `chats/${ids.chatA}/messages/m1`), { user_uid: ids.customer, sender_id: ids.customer, sender_type: 'customer', message: 'hi', read_at: null });
    await setDoc(doc(d, `chats/${ids.chatB}`), { user_id: ids.other, user_uid: ids.other, user_type: 'customer', status: 'open', order_id: ids.orderB, store_id: ids.storeB, unread_admin: 1 });
    await setDoc(doc(d, `notifications/${ids.notifA}`), { title: 'x', store_id: ids.storeA, sent_at: new Date() });
    await setDoc(doc(d, `notifications/${ids.notifAll}`), { title: 'y', store_id: null, sent_at: new Date() });
    await setDoc(doc(d, `home_layout_drafts/${ids.zoneA}_quick_all`), { zone_id: ids.zoneA, mode: 'quick', draft_sections: [] });
    await setDoc(doc(d, `home_layout_drafts/${ids.zoneB}_quick_all`), { zone_id: ids.zoneB, mode: 'quick', draft_sections: [] });
    await setDoc(doc(d, `home_layouts/${ids.zoneA}_quick_all`), { zone_id: ids.zoneA, mode: 'quick', published_sections: [], is_published: true });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('wallet_transactions collection group', () => {
  it('admin / staff with wallet.list read across users; others cannot', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as.admin(), 'wallet_transactions'), orderBy('created_at', 'desc'))));
    await assertSucceeds(getDocs(collectionGroup(as.staffWallet(), 'wallet_transactions')));
    await assertFails(getDocs(collectionGroup(as.staffNone(), 'wallet_transactions')));
    await assertFails(getDocs(collectionGroup(as.store(), 'wallet_transactions')));
    await assertFails(getDocs(collectionGroup(as.customer(), 'wallet_transactions')));
    await assertSucceeds(getDoc(doc(as.customer(), `users/${ids.customer}/wallet_transactions/t1`)));
  });
});

describe('settings/private_*', () => {
  it('role admin only reads and writes; staff with setting.* and everyone else are denied', async () => {
    await assertSucceeds(getDoc(doc(as.admin(), 'settings/private_smtp')));
    await assertSucceeds(setDoc(doc(as.admin(), 'settings/private_smtp'), { host: 'smtp.y', port: 587, from_email: 'a@b.c' }, { merge: true }));
    await assertSucceeds(setDoc(doc(as.admin(), 'settings/private_payment'), { stripe_secret: 'sk' }, { merge: true }));
    await assertFails(setDoc(doc(as.admin(), 'settings/private_other'), { x: 1 }));
    await assertFails(getDoc(doc(as.staffSettings(), 'settings/private_smtp')));
    await assertFails(setDoc(doc(as.staffSettings(), 'settings/private_smtp'), { host: 'evil' }, { merge: true }));
    await assertSucceeds(setDoc(doc(as.staffSettings(), 'settings/public'), { app_name: 'X' }, { merge: true }));
    await assertFails(getDoc(doc(as.store(), 'settings/private_ai')));
    await assertFails(getDoc(doc(as.anon(), 'settings/private_ai')));
  });
});

describe('home layouts', () => {
  it('drafts are panel-only; published docs public and not client-writable', async () => {
    await assertSucceeds(getDoc(doc(as.anon(), `home_layouts/${ids.zoneA}_quick_all`)));
    await assertFails(getDoc(doc(as.anon(), `home_layout_drafts/${ids.zoneA}_quick_all`)));
    await assertFails(getDoc(doc(as.customer(), `home_layout_drafts/${ids.zoneA}_quick_all`)));
    await assertSucceeds(getDoc(doc(as.staffSettings(), `home_layout_drafts/${ids.zoneB}_quick_all`)));
    await assertSucceeds(setDoc(doc(as.staffSettings(), `home_layout_drafts/${ids.zoneB}_quick_all`), { zone_id: ids.zoneB, mode: 'quick', draft_sections: [{ id: 'a' }] }));
    await assertSucceeds(getDoc(doc(as.store(), `home_layout_drafts/${ids.zoneA}_quick_all`)));
    await assertSucceeds(getDocs(query(collection(as.store(), 'home_layout_drafts'), where('zone_id', '==', ids.zoneA))));
    await assertFails(getDoc(doc(as.store(), `home_layout_drafts/${ids.zoneB}_quick_all`)));
    await assertSucceeds(getDoc(doc(as.store(), `home_layout_drafts/missing_${T}`))); // saveDoc probes existence first
    await assertSucceeds(setDoc(doc(as.store(), `home_layout_drafts/${ids.zoneA}_quick_all`), { zone_id: ids.zoneA, mode: 'quick', draft_sections: [] }));
    await assertFails(setDoc(doc(as.store(), `home_layout_drafts/${ids.zoneB}_quick_all`), { zone_id: ids.zoneB, mode: 'quick', draft_sections: [] }));
    await assertFails(setDoc(doc(as.admin(), `home_layouts/${ids.zoneA}_quick_all`), { zone_id: ids.zoneA, published_sections: [{ id: 'x' }] }));
    await assertFails(setDoc(doc(as.store(), `home_layouts/${ids.zoneA}_quick_all`), { zone_id: ids.zoneA, published_sections: [] }));
  });
});

describe('store scoping', () => {
  it('store users read / mark read their store chats and notification log only', async () => {
    await assertSucceeds(getDocs(query(collection(as.store(), 'chats'), where('store_id', '==', ids.storeA), orderBy('last_message_at', 'desc'))));
    await assertFails(getDoc(doc(as.store(), `chats/${ids.chatB}`)));
    await assertSucceeds(updateDoc(doc(as.store(), `chats/${ids.chatA}`), { unread_admin: 0 }));
    await assertFails(updateDoc(doc(as.store(), `chats/${ids.chatB}`), { unread_admin: 0 }));
    await assertFails(updateDoc(doc(as.store(), `chats/${ids.chatA}`), { user_uid: ids.storeUser }));
    await assertSucceeds(updateDoc(doc(as.store(), `chats/${ids.chatA}/messages/m1`), { read_at: new Date() }));
    await assertSucceeds(getDocs(query(collection(as.store(), 'notifications'), where('store_id', '==', ids.storeA))));
    await assertFails(getDoc(doc(as.store(), `notifications/${ids.notifAll}`)));
    await assertFails(getDocs(collection(as.store(), 'notifications')));
    await assertSucceeds(getDocs(collection(as.admin(), 'notifications')));
    await assertSucceeds(deleteDoc(doc(as.store(), `notifications/${ids.notifA}`)));
  });

  it('client chat create: store_id must match the owner\'s linked order', async () => {
    const base = { user_id: ids.customer, user_uid: ids.customer, user_type: 'customer', user_name: 'C', subject: 'Help', status: 'open', last_message: null, last_message_at: null, unread_admin: 0, unread_user: 0, created_at: new Date() };
    await assertSucceeds(setDoc(doc(as.customer(), `chats/ok1_${T}`), { ...base, order_id: ids.order, order_number: 'X', store_id: ids.storeA }));
    await assertSucceeds(setDoc(doc(as.customer(), `chats/ok2_${T}`), { ...base, order_id: null, order_number: null }));
    await assertFails(setDoc(doc(as.customer(), `chats/bad1_${T}`), { ...base, order_id: ids.order, order_number: 'X', store_id: ids.storeB }));
    await assertFails(setDoc(doc(as.customer(), `chats/bad2_${T}`), { ...base, order_id: null, order_number: null, store_id: ids.storeA }));
    await assertFails(setDoc(doc(as.customer(), `chats/bad3_${T}`), { ...base, order_id: ids.orderB, order_number: 'X', store_id: ids.storeB }));
  });
});
