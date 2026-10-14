/** Panel callables / triggers added to close the backend gaps (payment status, deletes, startChat, withdrawals, auto-assign, drafts …). */
import { beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  addAddress, addToCart, auth, db, expectCode, makeAdmin, makeRider, makeUser, PORTS, PROJECT_ID, seedSettings, seedWorld, STORE_LAT, STORE_LNG, Timestamp, uniq, waitFor, World,
} from './helpers';
import { normalizeSmtp } from '../src/services/notify';
import { zonedParts } from '../src/shared/util';

const ADDR_LAT = STORE_LAT + 0.04;
let w: World;
beforeAll(async () => {
  w = await seedWorld({ tag: 'gaps' });
});

async function placeCod(c: Awaited<ReturnType<typeof makeUser>>, world = w) {
  const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
  await addToCart(c.uid, world, 'v1', 1);
  return (await c.call('placeOrder', { zone_id: world.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' })) as { order_id: string; order_number: string };
}

async function deliver(admin: Awaited<ReturnType<typeof makeAdmin>>, orderId: string, world = w) {
  const rider = await makeRider(world);
  await admin.call('assignDeliveryBoy', { order_id: orderId, delivery_boy_id: rider.uid });
  await rider.call('updateDeliveryStatus', { order_id: orderId, status: 'picked_up' });
  const otp = (await db.doc(`orders/${orderId}/secret/otp`).get()).get('delivery_otp');
  await rider.call('deliverOrder', { order_id: orderId, otp });
  return rider;
}

describe('SMTP settings keys', () => {
  it('reads the admin keys, falls back to Laravel mail_* names', () => {
    const admin = normalizeSmtp({ host: 'smtp.a.com', port: 587, username: 'u', password: 'p', encryption: 'tls', from_email: 'a@x.com', from_name: 'A', secure: false });
    expect(admin).toMatchObject({ host: 'smtp.a.com', port: 587, secure: false, username: 'u', password: 'p', from_email: 'a@x.com', from_name: 'A' });
    const laravel = normalizeSmtp({ mail_host: 'smtp.l.com', mail_port: '465', mail_username: 'lu', mail_password: 'lp', mail_encryption: 'ssl', mail_from_address: 'l@x.com', mail_from_name: 'L' });
    expect(laravel).toMatchObject({ host: 'smtp.l.com', port: 465, secure: true, username: 'lu', password: 'lp', from_email: 'l@x.com', from_name: 'L' });
    expect(normalizeSmtp({ host: 'h', from_address: 'f@x.com' }).from_email).toBe('f@x.com');
    expect(normalizeSmtp({ host: 'h', username: 'only@x.com' }).from_email).toBe('only@x.com');
    expect(normalizeSmtp({ host: 'h', port: 25, encryption: 'none' })).toMatchObject({ secure: false, ignoreTLS: true });
    expect(normalizeSmtp({}).host).toBeNull();
  });
});

describe('order panel callables', () => {
  it('updatePaymentStatus sets status + txn id with a timeline note; store scoped', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id } = await placeCod(c);
    await expectCode(admin.call('updatePaymentStatus', { order_id, payment_status: 'bogus' }), 'invalid-argument');
    const r = await admin.call('updatePaymentStatus', { order_id, payment_status: 'paid', transaction_id: 'TXN-1' });
    expect(r.order.payment_status).toBe('paid');
    const o = (await db.doc(`orders/${order_id}`).get()).data()!;
    expect(o.payment_status).toBe('paid');
    expect(o.transaction_id).toBe('TXN-1');
    expect(o.status).toBe('received');
    expect(o.timeline.some((t: { note?: string }) => t.note === 'Payment status set to Paid')).toBe(true);
    const otherStore = await makeUser({ claims: { role: 'store', store_id: 'not_this_store' }, profile: { type: 'store', store_id: 'not_this_store' } });
    await expectCode(otherStore.call('updatePaymentStatus', { order_id, payment_status: 'pending' }), 'permission-denied');
  });

  it('deleteOrder: admin only, cancelled/payment_pending only; stats contribution removed', async () => {
    const world = await seedWorld({ tag: 'del' });
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id } = await placeCod(c, world);
    await expectCode(admin.call('deleteOrder', { order_id }), 'failed-precondition', /cancelled or payment pending/);
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'cancelled', note: 'test' });
    const date = zonedParts(new Date()).date;
    const statsRef = db.doc(`stats_daily/zone_${world.zoneId}_${date}`);
    await waitFor(async () => (await statsRef.get()).get('cancelled') === 1);
    const store = await makeUser({ claims: { role: 'store', store_id: world.storeId }, profile: { type: 'store', store_id: world.storeId } });
    await expectCode(store.call('deleteOrder', { order_id }), 'permission-denied');
    await admin.call('deleteOrder', { order_id });
    expect((await db.doc(`orders/${order_id}`).get()).exists).toBe(false);
    expect((await db.doc(`orders/${order_id}/secret/otp`).get()).exists).toBe(false);
    expect((await db.doc(`deleted_orders/${order_id}`).get()).get('deleted_by')).toBe(admin.uid);
    await waitFor(async () => {
      const s = (await statsRef.get()).data()!;
      return s.orders === 0 && s.cancelled === 0 && (s.by_status?.cancelled ?? 0) === 0;
    });

    // payment_pending → cancelled (stock released) then deleted
    const pendingId = uniq('pp');
    const stock = (await db.doc(`store_stocks/${world.storeId}_${world.v1}`).get()).get('stock');
    await db.doc(`orders/${pendingId}`).set({
      order_number: 'SB-PP', user_id: c.uid, store_id: world.storeId, zone_id: world.zoneId, mode: 'quick', delivery_type: 'delivery', status: 'payment_pending',
      payment_method: 'stripe', payment_status: 'pending', items: [{ variant_id: world.v1, product_id: world.p1, qty: 2, total: 160, status: 'payment_pending', stock_source: 'store' }],
      totals: { total: 160, grand_total: 160, wallet_used: 0 }, timeline: [], all_cancelable: true, created_at: Timestamp.now(),
    });
    await admin.call('deleteOrder', { order_id: pendingId });
    expect((await db.doc(`orders/${pendingId}`).get()).exists).toBe(false);
    expect((await db.doc(`store_stocks/${world.storeId}_${world.v1}`).get()).get('stock')).toBe(stock + 2);
  });

  it('startChat creates (or reuses) an order chat with store_id and a first message; store users only for their orders', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id, order_number } = await placeCod(c);
    const r = await admin.call('startChat', { user_id: c.uid, order_id, subject: 'About your order', message: 'Hello from support' });
    expect(r.created).toBe(true);
    const chat = (await db.doc(`chats/${r.chat_id}`).get()).data()!;
    expect(chat).toMatchObject({ user_uid: c.uid, order_id, order_number, store_id: w.storeId, status: 'open', subject: 'About your order' });
    await waitFor(async () => (await db.doc(`chats/${r.chat_id}`).get()).get('unread_user') === 1);
    const again = await admin.call('startChat', { user_id: c.uid, order_id });
    expect(again).toEqual({ chat_id: r.chat_id, created: false });
    const otherStore = await makeUser({ claims: { role: 'store', store_id: 'x_store' }, profile: { type: 'store', store_id: 'x_store' } });
    await expectCode(otherStore.call('startChat', { user_id: c.uid, order_id }), 'permission-denied');
    await expectCode(otherStore.call('startChat', { user_id: c.uid }), 'permission-denied');
    const own = await makeUser({ claims: { role: 'store', store_id: w.storeId }, profile: { type: 'store', store_id: w.storeId } });
    expect((await own.call('startChat', { user_id: c.uid, order_id })).chat_id).toBe(r.chat_id);
    const stranger = await makeUser();
    await expectCode(admin.call('startChat', { user_id: stranger.uid, order_id }), 'invalid-argument');
  });

  it('getInvoiceUrl is allowed for the assigned rider only', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id } = await placeCod(c);
    const rider = await deliver(admin, order_id);
    const inv = await rider.call('getInvoiceUrl', { order_id });
    expect(inv.url).toMatch(/invoices/);
    const other = await makeRider(w);
    await expectCode(other.call('getInvoiceUrl', { order_id }), 'permission-denied');
  });

  it('deliverOrder honours cash_collected (≤ payable) and records the shortfall', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id } = await placeCod(c);
    const rider = await makeRider(w);
    await admin.call('assignDeliveryBoy', { order_id, delivery_boy_id: rider.uid });
    await rider.call('updateDeliveryStatus', { order_id, status: 'picked_up' });
    const otp = (await db.doc(`orders/${order_id}/secret/otp`).get()).get('delivery_otp');
    const payable = (await db.doc(`orders/${order_id}`).get()).get('totals.total');
    await expectCode(rider.call('deliverOrder', { order_id, otp, cash_collected: payable + 50 }), 'invalid-argument', /cannot exceed/);
    const res = await rider.call('deliverOrder', { order_id, otp, cash_collected: payable - 10 });
    expect(res.cash_collected).toBe(payable - 10);
    expect(res.cash_in_hand).toBe(payable - 10);
    const cc = (await db.doc(`cash_collections/cod_${order_id}`).get()).data()!;
    expect(cc).toMatchObject({ amount: payable - 10, expected_amount: payable, short_amount: 10, order_number: expect.any(String) });
  });
});

describe('returns & withdrawals', () => {
  it('pickup copies customer/address; refund_method original skips the wallet; deleteReturn for pending/rejected', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const { order_id } = await placeCod(c);
    const rider = await deliver(admin, order_id);
    const rr = await c.call('requestReturn', { order_id, variant_id: w.v1, qty: 1, reason: 'Damaged' });
    await expectCode(admin.call('processReturn', { return_id: rr.id, action: 'approved', refund_method: 'cash' }), 'invalid-argument');
    await admin.call('processReturn', { return_id: rr.id, action: 'approved', refund_method: 'original' });
    await admin.call('processReturn', { return_id: rr.id, action: 'pickup_assigned', delivery_boy_id: rider.uid });
    const doc1 = (await db.doc(`return_requests/${rr.id}`).get()).data()!;
    expect(doc1.customer).toEqual({ name: 'Test User', phone: '+919999900000' });
    expect(doc1.address).toMatchObject({ lat: ADDR_LAT, lng: STORE_LNG, address_line: 'Line 1' });
    expect(doc1.order_number).toMatch(/^SB-ORD-/);
    expect(doc1.refund_method).toBe('original');
    const before = (await db.doc(`users/${c.uid}`).get()).get('wallet_balance') ?? 0;
    const done = await admin.call('processReturn', { return_id: rr.id, action: 'refund_completed' });
    expect(done.refund_method).toBe('original');
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance') ?? 0).toBe(before);
    await expectCode(admin.call('deleteReturn', { return_id: rr.id }), 'failed-precondition');

    // pending return → deleted, order item restored
    const c2 = await makeUser();
    const o2 = await placeCod(c2);
    await deliver(admin, o2.order_id);
    const rr2 = await c2.call('requestReturn', { order_id: o2.order_id, variant_id: w.v1, qty: 1, reason: 'Wrong item' });
    const store = await makeUser({ claims: { role: 'store', store_id: w.storeId }, profile: { type: 'store', store_id: w.storeId } });
    await expectCode(store.call('deleteReturn', { return_id: rr2.id }), 'permission-denied');
    await admin.call('deleteReturn', { return_id: rr2.id });
    expect((await db.doc(`return_requests/${rr2.id}`).get()).exists).toBe(false);
    const item = (await db.doc(`orders/${o2.order_id}`).get()).get('items')[0];
    expect(item.status).toBe('delivered');
    expect(item.return_status).toBeNull();
  });

  it('updateWithdrawal edits remark / receipt only after processing', async () => {
    await seedSettings();
    const c = await makeUser({ profile: { wallet_balance: 500 } });
    const admin = await makeAdmin();
    const wd = await c.call('walletWithdraw', { amount: 200 });
    await expectCode(admin.call('updateWithdrawal', { id: wd.id, remark: 'x' }), 'failed-precondition');
    await admin.call('processWithdrawal', { id: wd.id, approve: true, remark: 'sent' });
    const r = await admin.call('updateWithdrawal', { id: wd.id, remark: 'UTR 123', receipt_image: 'https://example.com/r.png' });
    expect(r).toMatchObject({ status: 'approved', remark: 'UTR 123', receipt_image: 'https://example.com/r.png' });
    expect((await db.doc(`withdrawal_requests/${wd.id}`).get()).get('remark')).toBe('UTR 123');
  });
});

describe('rider auto-assign (settings.delivery.auto_assign)', () => {
  it('assigns the nearest online approved rider of the zone on placement; off → pool', async () => {
    const world = await seedWorld({ tag: 'auto' });
    const near = await makeRider(world);
    const far = await makeRider(world);
    const offline = await makeRider(world);
    const loc = (lat: number) => ({ lat, lng: STORE_LNG, updated_at: Timestamp.now() });
    await db.doc(`delivery_boys/${near.uid}`).update({ is_online: true, location: loc(STORE_LAT + 0.01) });
    await db.doc(`delivery_boys/${far.uid}`).update({ is_online: true, location: loc(STORE_LAT + 0.2) });
    await db.doc(`delivery_boys/${offline.uid}`).update({ is_online: false, location: loc(STORE_LAT) });
    try {
      await db.doc('settings/public').set({ delivery: { auto_assign: true } }, { merge: true });
      const c = await makeUser();
      const { order_id } = await placeCod(c, world);
      const o = await waitFor(async () => {
        const s = (await db.doc(`orders/${order_id}`).get()).data();
        return s?.delivery_boy_id ? s : null;
      });
      expect(o.delivery_boy_id).toBe(near.uid);
      expect(o.auto_assigned).toBe(true);
      expect(o.timeline.some((t: { note?: string }) => /Auto-assigned/.test(t.note ?? ''))).toBe(true);

      await db.doc('settings/public').set({ delivery: { auto_assign: false } }, { merge: true });
      const c2 = await makeUser();
      const o2 = await placeCod(c2, world);
      await new Promise((r) => setTimeout(r, 3000));
      expect((await db.doc(`orders/${o2.order_id}`).get()).get('delivery_boy_id')).toBeNull();
    } finally {
      await db.doc('settings/public').set({ delivery: { auto_assign: false } }, { merge: true });
    }
  });
});

describe('home layout drafts', () => {
  it('publishHomeLayout copies home_layout_drafts → home_layouts (published data only); preview by layout_id', async () => {
    const admin = await makeAdmin();
    const id = `${w.zoneId}_quick_${uniq('cat')}`;
    const sections = [{ id: 's1', type: 'heading_text', title: { en: 'Hi' }, is_active: true, settings: { text: 'Hello' } }];
    await db.doc(`home_layouts/${id}`).set({ zone_id: w.zoneId, mode: 'quick', category_id: null, draft_sections: [{ id: 'old' }], published_sections: [], is_published: false });
    await db.doc(`home_layout_drafts/${id}`).set({ zone_id: w.zoneId, mode: 'quick', category_id: null, header: { bg_type: 'color', bg_value: '#000', text_color: '#fff' }, draft_sections: sections });
    const prev = await admin.call('previewHomeSections', { layout_id: id });
    expect(prev.sections).toHaveLength(1);
    await admin.call('publishHomeLayout', { layout_id: id });
    const pub = (await db.doc(`home_layouts/${id}`).get()).data()!;
    expect(pub.published_sections).toEqual(sections);
    expect(pub.is_published).toBe(true);
    expect(pub.header).toEqual({ bg_type: 'color', bg_value: '#000', text_color: '#fff' });
    expect('draft_sections' in pub).toBe(false);
    const otherZoneStore = await makeUser({ claims: { role: 'store', store_id: 'nostore' }, profile: { type: 'store', store_id: 'nostore' } });
    await expectCode(otherZoneStore.call('publishHomeLayout', { layout_id: id }), 'permission-denied');
  });
});

describe('store scoping data', () => {
  it('sendNotification from a store logs store_id and only targets its customers', async () => {
    const c = await makeUser();
    await placeCod(c);
    const stranger = await makeUser();
    const store = await makeUser({ claims: { role: 'store', store_id: w.storeId }, profile: { type: 'store', store_id: w.storeId } });
    await expectCode(store.call('sendNotification', { title: 'T', message: 'M', target: 'all' }), 'permission-denied');
    await expectCode(store.call('sendNotification', { title: 'T', message: 'M', target: 'user', user_id: stranger.uid }), 'permission-denied');
    const r = await store.call('sendNotification', { title: 'Store promo', message: 'Hi', target: 'user', user_id: c.uid });
    expect((await db.doc(`notifications/${r.id}`).get()).data()).toMatchObject({ store_id: w.storeId, user_id: c.uid, user_name: 'Test User' });
    const admin = await makeAdmin();
    const r2 = await admin.call('sendNotification', { title: 'All', message: 'M', target: 'user', user_id: stranger.uid });
    expect((await db.doc(`notifications/${r2.id}`).get()).get('store_id')).toBeNull();
  });

  it('onChatCreated derives store_id from the linked order (client value ignored)', async () => {
    const c = await makeUser();
    const { order_id, order_number } = await placeCod(c);
    const ref = doc(collection(c.fs, 'chats'));
    await setDoc(ref, {
      user_id: c.uid, user_uid: c.uid, user_type: 'customer', user_name: 'Test User', order_id, order_number: null, subject: 'Order help',
      status: 'open', last_message: null, last_message_at: null, unread_admin: 0, unread_user: 0, created_at: serverTimestamp(),
    });
    const chat = await waitFor(async () => {
      const s = (await db.doc(`chats/${ref.id}`).get()).data();
      return s?.store_id ? s : null;
    });
    expect(chat.store_id).toBe(w.storeId);
    expect(chat.order_number).toBe(order_number);
    // message create still works for the owner
    await addDoc(collection(c.fs, `chats/${ref.id}/messages`), { user_uid: c.uid, sender_id: c.uid, sender_type: 'customer', sender_name: 'Test User', message: 'hi', attachment: null, read_at: null, created_at: serverTimestamp() });
  });
});

describe('syncProfile guest upgrade', () => {
  it('anonymous users get a minimal doc; upgrading runs the new-user path once', async () => {
    await seedSettings();
    const referrer = await makeUser({ profile: { referral_code: uniq('R').toUpperCase().replace(/_/g, '').slice(0, 10) } });
    const code = (await db.doc(`users/${referrer.uid}`).get()).get('referral_code');
    const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, uniq('guest'));
    const a = getAuth(app);
    connectAuthEmulator(a, `http://127.0.0.1:${PORTS.auth}`, { disableWarnings: true });
    const cred = await signInAnonymously(a);
    const fns = getFunctions(app, 'asia-south1');
    connectFunctionsEmulator(fns, '127.0.0.1', PORTS.functions);
    const call = async (data: unknown) => (await httpsCallable(fns, 'syncProfile')(data)).data as any;
    const g = await call({ app: 'customer' });
    expect(g.is_new).toBe(true);
    const guestDoc = (await db.doc(`users/${cred.user.uid}`).get()).data()!;
    expect(guestDoc.is_anonymous).toBe(true);
    expect(guestDoc.referral_code).toBeUndefined();
    expect((await db.collection(`users/${cred.user.uid}/notifications`).get()).size).toBe(0);
    await db.doc(`users/${cred.user.uid}/cart/quick_central_x`).set({ product_id: 'p', variant_id: 'x', store_id: null, mode: 'quick', qty: 1 });

    await auth.updateUser(cred.user.uid, { email: `${uniq('up')}@test.qwikmart`.toLowerCase(), password: 'secret123', displayName: 'Upgraded' });
    const up = await call({ app: 'customer', name: 'Upgraded', referral_code: code });
    expect(up.is_new).toBe(true);
    expect(up.user.is_anonymous).toBe(false);
    expect(up.user.referral_code).toMatch(/^[A-Z0-9]{8,10}$/);
    expect(up.user.referred_by).toBe(referrer.uid);
    expect((await db.collection(`users/${cred.user.uid}/notifications`).get()).size).toBe(1);
    expect((await db.collection(`users/${cred.user.uid}/cart`).get()).size).toBe(1);
    const again = await call({ app: 'customer' });
    expect(again.is_new).toBe(false);
  });
});
