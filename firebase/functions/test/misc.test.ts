import { describe, expect, it } from 'vitest';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, expectCode, makeAdmin, makeUser, seedSettings, seedWorld, Timestamp, uniq, waitFor } from './helpers';

describe('account', () => {
  it('syncProfile creates the profile, referral, welcome notification and claims', async () => {
    await seedSettings();
    const referrer = await makeUser({ profile: { referral_code: uniq('REF').toUpperCase().replace(/_/g, '') } });
    const code = (await db.doc(`users/${referrer.uid}`).get()).get('referral_code');
    const c = await makeUser({ profile: false });
    const r = await c.call('syncProfile', { name: 'New Person', referral_code: code, app: 'customer', fcm_token: 'tok1' });
    expect(r.is_new).toBe(true);
    expect(r.user.referral_code).toMatch(/^[A-Z0-9]{8}$/);
    expect(r.user.wallet_balance).toBe(0);
    expect((await auth.getUser(c.uid)).customClaims?.role).toBe('customer');
    const refs = await db.collection('referrals').where('referred_id', '==', c.uid).get();
    expect(refs.size).toBe(1);
    expect(refs.docs[0].get('referrer_id')).toBe(referrer.uid);
    expect((await db.collection(`users/${c.uid}/notifications`).get()).size).toBe(1);
    const again = await c.call('syncProfile', { app: 'customer' });
    expect(again.is_new).toBe(false);
  });
});

describe('chat trigger', () => {
  it('customer message updates chat summary + unread counter; staff reply bumps unread_user', async () => {
    const c = await makeUser();
    const chatRef = doc(collection(c.fs, 'chats'));
    await setDoc(chatRef, {
      user_id: c.uid, user_uid: c.uid, user_type: 'customer', user_name: 'Test User', order_id: null, order_number: null, subject: 'Help',
      status: 'open', last_message: null, last_message_at: null, unread_admin: 0, unread_user: 0, created_at: serverTimestamp(),
    });
    await addDoc(collection(c.fs, `chats/${chatRef.id}/messages`), {
      user_uid: c.uid, sender_id: c.uid, sender_type: 'customer', sender_name: 'Test User', message: 'Where is my order?', attachment: null, read_at: null, created_at: serverTimestamp(),
    });
    const chat = await waitFor(async () => {
      const s = await db.doc(`chats/${chatRef.id}`).get();
      return s.get('unread_admin') === 1 ? s.data() : null;
    });
    expect(chat.last_message.text).toBe('Where is my order?');
    expect(chat.last_message.sender_type).toBe('customer');
    const admin = await makeAdmin();
    await addDoc(collection(admin.fs, `chats/${chatRef.id}/messages`), {
      user_uid: c.uid, sender_id: admin.uid, sender_type: 'admin', sender_name: 'Support', message: 'On the way', attachment: null, read_at: null, created_at: serverTimestamp(),
    });
    await waitFor(async () => (await db.doc(`chats/${chatRef.id}`).get()).get('unread_user') === 1);
  });
});

describe('wallet', () => {
  it('withdraw holds the amount; rejection re-credits', async () => {
    await seedSettings();
    const c = await makeUser({ profile: { wallet_balance: 500 } });
    await expectCode(c.call('walletWithdraw', { amount: 50 }), 'failed-precondition', /Minimum withdrawal/);
    const w = await c.call('walletWithdraw', { amount: 200, message: 'bank' });
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(300);
    const admin = await makeAdmin();
    await admin.call('processWithdrawal', { id: w.id, approve: false, remark: 'Invalid bank' });
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(500);
    await expectCode(admin.call('processWithdrawal', { id: w.id, approve: true }), 'failed-precondition', /already been processed/);
    await admin.call('walletAdjust', { uid: c.uid, type: 'debit', amount: 100, message: 'Correction' });
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(400);
    await expectCode(admin.call('walletAdjust', { uid: c.uid, type: 'debit', amount: 1000 }), 'failed-precondition', /Insufficient/);
  });
});

describe('panel permissions', () => {
  it('staff needs the role permission; store is scoped to its store', async () => {
    const w = await seedWorld({ tag: 'perm' });
    const roleId = uniq('role');
    await db.doc(`roles/${roleId}`).set({ name: 'Viewer', scope: 'admin', permissions: ['order.list'] });
    const staff = await makeUser({ claims: { role: 'staff', role_id: roleId }, profile: { type: 'staff', role_id: roleId } });
    const customer = await makeUser();
    await expectCode(staff.call('walletAdjust', { uid: customer.uid, type: 'credit', amount: 5 }), 'permission-denied');
    await expectCode(customer.call('walletAdjust', { uid: customer.uid, type: 'credit', amount: 5 }), 'permission-denied');
    await db.doc(`roles/${roleId}`).update({ permissions: ['wallet.*'] });
    await staff.call('walletAdjust', { uid: customer.uid, type: 'credit', amount: 5 });

    const orderId = uniq('ord');
    await db.doc(`orders/${orderId}`).set({ order_number: 'X', user_id: customer.uid, store_id: 'other_store', zone_id: w.zoneId, status: 'received', items: [], totals: {}, timeline: [], all_cancelable: true, created_at: Timestamp.now() });
    const store = await makeUser({ claims: { role: 'store', store_id: w.storeId }, profile: { type: 'store', store_id: w.storeId } });
    await expectCode(store.call('adminUpdateOrderStatus', { order_id: orderId, status: 'processed' }), 'permission-denied');
    await db.doc(`orders/${orderId}`).update({ store_id: w.storeId });
    await store.call('adminUpdateOrderStatus', { order_id: orderId, status: 'processed' });
    expect((await db.doc(`orders/${orderId}`).get()).get('status')).toBe('processed');
    await expectCode(store.call('adminUpdateOrderStatus', { order_id: orderId, status: 'delivered' }), 'failed-precondition', /Cannot change order status/);
  });

  it('createPanelUser sets claims; approveDeliveryBoy adds zone_id', async () => {
    const w = await seedWorld({ tag: 'people' });
    const admin = await makeAdmin();
    const r = await admin.call('createPanelUser', { type: 'store', name: 'Store Owner', email: `${uniq('so')}@test.qwikmart`.toLowerCase(), password: 'secret123', store_id: w.storeId });
    expect(r.claims).toEqual({ role: 'store', store_id: w.storeId });
    expect((await db.doc(`stores/${w.storeId}`).get()).get('owner_uid')).toBe(r.uid);

    const rider = await makeUser({ profile: false });
    await rider.call('registerDeliveryBoy', { name: 'New Rider', phone: '+919811111111', zone_id: w.zoneId, vehicle_type: 'bike', vehicle_number: 'MH02', bank: { name: 'SBI' } });
    expect((await auth.getUser(rider.uid)).customClaims).toEqual({ role: 'delivery_boy' });
    const ap = await admin.call('approveDeliveryBoy', { uid: rider.uid, approve: true });
    expect(ap.claims).toEqual({ role: 'delivery_boy', zone_id: w.zoneId });
  });
});

describe('ai', () => {
  it('returns a clean error when the Gemini key is missing', async () => {
    await db.doc('settings/private_ai').delete();
    const admin = await makeAdmin();
    await expectCode(admin.call('generateProductContent', { name: 'Basmati Rice' }), 'failed-precondition', /Gemini API key is not configured/);
  });
});

describe('getHome', () => {
  it('hydrates a published layout (product slider with store pricing)', async () => {
    const w = await seedWorld({ tag: 'home' });
    await db.doc(`home_layouts/${w.zoneId}_quick_all`).set({
      zone_id: w.zoneId, mode: 'quick', category_id: null, header: { bg_type: 'color', bg_value: '#fff', text_color: '#000' }, draft_sections: [],
      published_sections: [
        { id: 's1', type: 'heading_text', title: { en: 'Hello' }, is_active: true, sort: 1, settings: { text: 'Hi' } },
        { id: 's2', type: 'product_slider', title: { en: 'Picks' }, is_active: true, sort: 2, settings: { source: 'manual', product_ids: [w.p1, w.p2] } },
        { id: 's3', type: 'category_section', title: { en: 'Cats' }, is_active: true, sort: 3, settings: { category_ids: [w.categoryId] } },
      ],
      is_published: true, published_at: Timestamp.now(),
    });
    const c = await makeUser();
    const h = await c.call('getHome', { zone_id: w.zoneId, mode: 'quick', lang: 'en' });
    expect(h.header.bg_value).toBe('#fff');
    expect(h.sections.map((s: { type: string }) => s.type)).toEqual(['heading_text', 'product_slider', 'category_section']);
    const p = h.sections[1].items[0];
    expect(p.name).toBe('Basmati Rice');
    expect(p.default_variant.final_price).toBe(80);
    expect(p.default_variant.stock).toBe(50); // store stock, not central
  });
});
