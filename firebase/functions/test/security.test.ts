/**
 * Backend QA: adversarial callable tests + business-logic edge cases (concurrency, idempotency, limits).
 * Every test seeds its own isolated world (unique ids per run).
 */
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  addAddress, addPromo, addToCart, auth, CALL_TIMEOUT, Client, db, expectCode, makeAdmin, makeRider, makeUser, PORTS, PROJECT_ID, seedWorld,
  STORE_LAT, STORE_LNG, Timestamp, uniq, waitFor, World,
} from './helpers';
import { currentSurge } from '../src/services/zones';
import { evaluatePromo } from '../src/services/promo';

const ADDR_LAT = STORE_LAT + 0.01;

async function customer(w: World, opts: { wallet?: number } = {}): Promise<Client & { addr: string }> {
  const c = await makeUser({ profile: { wallet_balance: opts.wallet ?? 0 } });
  const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
  return Object.assign(c, { addr });
}

const place = (c: Client & { addr: string }, w: World, extra: Record<string, unknown> = {}) =>
  c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: c.addr, delivery_type: 'delivery', payment_method: 'cod', platform: 'app', ...extra });

async function storeUser(storeId: string): Promise<Client> {
  return makeUser({ claims: { role: 'store', store_id: storeId }, profile: { type: 'store', store_id: storeId } });
}

async function anonymousClient(): Promise<{ uid: string; call<T = any>(name: string, data?: unknown): Promise<T> }> {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, uniq('anonauth'));
  const a = getAuth(app);
  connectAuthEmulator(a, `http://127.0.0.1:${PORTS.auth}`, { disableWarnings: true });
  const cred = await signInAnonymously(a);
  const fns = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(fns, '127.0.0.1', PORTS.functions);
  return { uid: cred.user.uid, call: async (n, d) => (await httpsCallable(fns, n, { timeout: CALL_TIMEOUT })(d ?? {})).data as any };
}

let w: World;
beforeAll(async () => {
  w = await seedWorld({ tag: 'sec' });
});

/* ====================================================================== payments */
describe('payment verification is bound to the server-side gateway order', () => {
  const SECRET = 'rzp_test_secret';
  const sig = (orderId: string, paymentId: string) => createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  beforeAll(async () => {
    await db.doc('settings/private_payment').set({ razorpay_key: 'rzp_test_key', razorpay_secret: SECRET }, { merge: true });
    const pub = (await db.doc('settings/public').get()).data() ?? {};
    const methods = ((pub.payment_methods as { key: string }[]) ?? []).filter((m) => m.key !== 'razorpay');
    await db.doc('settings/public').set({ payment_methods: [...methods, { key: 'razorpay', name: 'Razorpay', enabled: true, mode: 'sandbox' }] }, { merge: true });
  });

  it('verifyPayment rejects a replayed signature of another gateway order; accepts its own', async () => {
    const c = await customer(w);
    const orderId = uniq('pay');
    await db.doc(`orders/${orderId}`).set({
      order_number: uniq('SB'), user_id: c.uid, store_id: w.storeId, zone_id: w.zoneId, mode: 'quick', status: 'payment_pending', payment_method: 'razorpay',
      payment_status: 'pending', transaction_id: 'order_REAL', gateway_order_id: 'order_REAL', items: [], totals: { total: 999, grand_total: 999 },
      timeline: [], all_cancelable: true, created_at: Timestamp.now(),
    });
    // a legitimately signed (cheap) payment for a different Razorpay order must not settle this order
    await expectCode(c.call('verifyPayment', { order_id: orderId, gateway: 'razorpay', payload: { razorpay_order_id: 'order_CHEAP', razorpay_payment_id: 'pay_1', razorpay_signature: sig('order_CHEAP', 'pay_1') } }), 'failed-precondition', /verification failed/);
    await db.doc(`orders/${orderId}`).update({ payment_status: 'pending' });
    const r = await c.call('verifyPayment', { order_id: orderId, gateway: 'razorpay', payload: { razorpay_order_id: 'order_CHEAP', razorpay_payment_id: 'pay_2', razorpay_signature: sig('order_REAL', 'pay_2') } });
    expect(r.paid).toBe(true);
    expect((await db.doc(`orders/${orderId}`).get()).get('status')).toBe('received');
    // another user cannot verify somebody else's order
    const other = await customer(w);
    await expectCode(other.call('verifyPayment', { order_id: orderId, payload: {} }), 'not-found');
  });

  it('verifyWalletRecharge cannot be replayed with another payment; credits once', async () => {
    const c = await customer(w);
    const id = uniq('wr');
    await db.doc(`wallet_recharges/${id}`).set({ user_id: c.uid, amount: 500, method: 'razorpay', gateway_order_id: 'order_W1', status: 'pending', created_at: Timestamp.now() });
    await expectCode(c.call('verifyWalletRecharge', { recharge_id: id, payload: { razorpay_order_id: 'order_OLD', razorpay_payment_id: 'pay_o', razorpay_signature: sig('order_OLD', 'pay_o') } }), 'failed-precondition');
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(0);
    await db.doc(`wallet_recharges/${id}`).update({ status: 'pending' });
    const r = await c.call('verifyWalletRecharge', { recharge_id: id, payload: { razorpay_payment_id: 'pay_w', razorpay_signature: sig('order_W1', 'pay_w') } });
    expect(r.balance).toBe(500);
    const again = await c.call('verifyWalletRecharge', { recharge_id: id, payload: { razorpay_payment_id: 'pay_w', razorpay_signature: sig('order_W1', 'pay_w') } });
    expect(again.already_processed).toBe(true);
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(500);
    // somebody else's recharge session
    const other = await customer(w);
    await expectCode(other.call('verifyWalletRecharge', { recharge_id: id, payload: {} }), 'not-found');
  });
});

/* ====================================================================== store users / staff */
describe('store users cannot use platform money / people callables', () => {
  it('walletAdjust, withdrawals, payEarnings, rider approval/creation, testSmtp are refused; collectCash is zone scoped', async () => {
    const store = await storeUser(w.storeId);
    const victim = await customer(w);
    const rider = await makeRider(w);
    await expectCode(store.call('walletAdjust', { uid: store.uid, type: 'credit', amount: 100000 }), 'permission-denied');
    await expectCode(store.call('walletAdjust', { uid: victim.uid, type: 'credit', amount: 10 }), 'permission-denied');
    await expectCode(store.call('processWithdrawal', { id: 'x', approve: true }), 'permission-denied');
    await expectCode(store.call('updateWithdrawal', { id: 'x', remark: 'r' }), 'permission-denied');
    await expectCode(store.call('payEarnings', { delivery_boy_id: rider.uid, type: 'bonus', amount: 500 }), 'permission-denied');
    await expectCode(store.call('approveDeliveryBoy', { uid: rider.uid, approve: true }), 'permission-denied');
    await expectCode(store.call('createDeliveryBoy', { name: 'X', email: `${uniq('x')}@t.io`, password: 'secret12', zone_id: w.zoneId }), 'permission-denied');
    await expectCode(store.call('testSmtp', { to: 'a@b.c' }), 'permission-denied');
    expect((await db.doc(`users/${store.uid}`).get()).get('wallet_balance')).toBe(0);

    // collectCash: own zone rider OK, other zone refused
    await db.doc(`delivery_boys/${rider.uid}`).update({ cash_in_hand: 300 });
    const r = await store.call('collectCash', { delivery_boy_id: rider.uid, amount: 100 });
    expect(r.cash_in_hand).toBe(200);
    const w2 = await seedWorld({ tag: 'sec2' });
    const farRider = await makeRider(w2);
    await db.doc(`delivery_boys/${farRider.uid}`).update({ cash_in_hand: 300 });
    await expectCode(store.call('collectCash', { delivery_boy_id: farRider.uid, amount: 100 }), 'permission-denied');
    // assignDeliveryBoy: store may not assign a rider of another zone
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w);
    await expectCode(store.call('assignDeliveryBoy', { order_id, delivery_boy_id: farRider.uid }), 'permission-denied');
    await db.doc(`delivery_boys/${rider.uid}`).update({ is_online: true });
    await store.call('assignDeliveryBoy', { order_id, delivery_boy_id: rider.uid });
  });

  it('sendBulkEmail: store users only reach their own customers (no platform-wide segments)', async () => {
    const store = await storeUser(w.storeId);
    await expectCode(store.call('sendBulkEmail', { subject: 's', body: 'b', segment: 'all' }), 'permission-denied');
    await expectCode(store.call('sendBulkEmail', { subject: 's', body: 'b', segment: 'delivery_boys' }), 'permission-denied');
    await expectCode(store.call('sendBulkEmail', { subject: 's', body: 'b', segment: 'specific', user_ids: [] }), 'invalid-argument');
  });

  it('updatePaymentStatus: store users may not mark online / wallet orders paid (would fund refunds)', async () => {
    const store = await storeUser(w.storeId);
    const c = await customer(w);
    const orderId = uniq('po');
    await db.doc(`orders/${orderId}`).set({
      order_number: uniq('SB'), user_id: c.uid, store_id: w.storeId, zone_id: w.zoneId, mode: 'quick', status: 'payment_pending', payment_method: 'stripe',
      payment_status: 'pending', items: [], totals: { total: 500, grand_total: 500, wallet_used: 0 }, timeline: [], all_cancelable: true, created_at: Timestamp.now(),
    });
    await expectCode(store.call('updatePaymentStatus', { order_id: orderId, payment_status: 'paid' }), 'permission-denied');
    await c.call('cancelOrder', { order_id: orderId });
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(0);
    // COD orders of the store are fine
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w);
    const r = await store.call('updatePaymentStatus', { order_id, payment_status: 'paid' });
    expect(r.order.payment_status).toBe('paid');
  });

  it('staff without permission cannot call panel callables; customers cannot call any', async () => {
    const roleId = uniq('role');
    await db.doc(`roles/${roleId}`).set({ name: 'Blog', scope: 'admin', permissions: ['blog.*'] });
    const staff = await makeUser({ claims: { role: 'staff', role_id: roleId }, profile: { type: 'staff', role_id: roleId } });
    const c = await customer(w);
    for (const who of [staff, c]) {
      await expectCode(who.call('walletAdjust', { uid: who.uid, type: 'credit', amount: 5 }), 'permission-denied');
      await expectCode(who.call('createPanelUser', { type: 'admin', name: 'x', email: `${uniq('e')}@t.io`, password: 'secret12' }), 'permission-denied');
      await expectCode(who.call('adminUpdateOrderStatus', { order_id: 'x', status: 'processed' }), 'permission-denied');
      await expectCode(who.call('bulkImportProducts', { csv_path: 'imports/x.csv' }), 'permission-denied');
      await expectCode(who.call('exportReport', { type: 'customers' }), 'permission-denied');
    }
    // staff with staff.create can still not mint an admin
    await db.doc(`roles/${roleId}`).update({ permissions: ['staff.*'] });
    await expectCode(staff.call('createPanelUser', { type: 'admin', name: 'x', email: `${uniq('e')}@t.io`, password: 'secret12' }), 'permission-denied');
  });
});

/* ====================================================================== promos */
describe('promo codes', () => {
  it('a store promo only discounts that store\'s items; duplicate codes prefer the platform promo', async () => {
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 2);
    const storeCode = uniq('STOREONLY').toUpperCase();
    await addPromo(storeCode, { code: storeCode, discount_type: 'percent', discount_value: 100, store_id: 'some_other_store' });
    const s = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: c.addr, promo_code: storeCode });
    expect(s.promo).toBeNull();
    expect(s.promo_error).toMatch(/not applicable/);
    await addToCart(c.uid, w, 'v1', 2);
    await expectCode(place(c, w, { promo_code: storeCode }), 'invalid-argument');
    // own-store promo works
    const own = uniq('OWNSTORE').toUpperCase();
    await addPromo(own, { code: own, discount_type: 'fixed', discount_value: 10, store_id: w.storeId });
    expect((await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: c.addr, promo_code: own })).promo.discount).toBe(10);
    // duplicate code: platform promo wins over another store's promo with the same code
    const dupe = uniq('DUPE').toUpperCase();
    await db.collection('promo_codes').doc(`a_${dupe}`).set({ code: dupe, discount_type: 'percent', discount_value: 90, store_id: 'some_other_store', status: 'active', is_permanent: true, applies_to: 'all' });
    await db.collection('promo_codes').doc(`b_${dupe}`).set({ code: dupe, discount_type: 'fixed', discount_value: 5, store_id: null, status: 'active', is_permanent: true, applies_to: 'all' });
    expect((await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: c.addr, promo_code: dupe })).promo.discount).toBe(5);
    // listCoupons hides other stores' promos
    const list = await c.call('listCoupons', { zone_id: w.zoneId, mode: 'quick' });
    expect(list.some((p: { code: string }) => p.code === storeCode)).toBe(false);
  });

  it('usage_limit_total is not exceeded by concurrent orders; per-user limit holds', async () => {
    const code = uniq('ONCE').toUpperCase();
    await addPromo(code, { code, discount_type: 'fixed', discount_value: 10, usage_limit_total: 1 });
    const a = await customer(w);
    const b = await customer(w);
    await addToCart(a.uid, w, 'v1', 1);
    await addToCart(b.uid, w, 'v1', 1);
    const res = await Promise.allSettled([place(a, w, { promo_code: code }), place(b, w, { promo_code: code })]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.doc(`promo_codes/${code}`).get()).get('used_count')).toBe(1);

    const per = uniq('PERUSER').toUpperCase();
    await addPromo(per, { code: per, discount_type: 'fixed', discount_value: 10, usage_limit_per_user: 1 });
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    await place(c, w, { promo_code: per });
    await addToCart(c.uid, w, 'v1', 1);
    await expectCode(place(c, w, { promo_code: per }), 'invalid-argument', /maximum number of times/);
  });

  it('evaluatePromo: store promo with applies_to=all is still restricted to its store (unit)', () => {
    const items = [{ product_id: 'p', category_id: null, sub_category_id: null, store_id: 'A', line_total: 100 }, { product_id: 'q', category_id: null, sub_category_id: null, store_id: 'B', line_total: 50 }];
    const r = evaluatePromo({ code: 'X', discount_type: 'percent', discount_value: 10, status: 'active', is_permanent: true, applies_to: 'all', store_id: 'B' } as never, null, { items, subtotal: 150, delivery_charge: 0, zone_id: null, country_id: null, mode: 'quick' });
    expect(r.discount).toBe(5);
  });
});

/* ====================================================================== checkout rules */
describe('placeOrder business rules', () => {
  it('concurrent orders for the last unit: exactly one wins, stock never negative', async () => {
    const lw = await seedWorld({ tag: 'last' });
    await db.doc(`store_stocks/${lw.storeId}_${lw.v2}`).update({ stock: 1 });
    const cs = await Promise.all([customer(lw), customer(lw), customer(lw)]);
    for (const c of cs) await addToCart(c.uid, lw, 'v2', 1);
    const res = await Promise.allSettled(cs.map((c) => place(c, lw)));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.doc(`store_stocks/${lw.storeId}_${lw.v2}`).get()).get('stock')).toBe(0);
  });

  it('order numbers stay unique under concurrency', async () => {
    const cs = await Promise.all([1, 2, 3, 4, 5].map(() => customer(w)));
    for (const c of cs) await addToCart(c.uid, w, 'v1', 1);
    const res = await Promise.all(cs.map((c) => place(c, w)));
    expect(new Set(res.map((r) => r.order_number)).size).toBe(5);
  });

  it('client-side price tampering in the cart line is ignored (server prices)', async () => {
    const c = await customer(w);
    await db.doc(`users/${c.uid}/cart/quick_${w.storeId}_${w.v1}`).set({ product_id: w.p1, variant_id: w.v1, store_id: w.storeId, mode: 'quick', qty: 1, price: 0.01, sale_price: 0.01, added_at: Timestamp.now() });
    const r = await place(c, w, { totals: { grand_total: 1 }, total: 1, price: 1 });
    const o = (await db.doc(`orders/${r.order_id}`).get()).data()!;
    expect(o.items[0].unit_price).toBe(80);
    expect(o.totals.subtotal).toBe(80);
    expect(o.user_id).toBe(c.uid);
  });

  it('COD max, min order, store closed, inactive product / variant, zone inactive or mode not served, address outside zone', async () => {
    const zw = await seedWorld({ tag: 'rules' });
    const c = await customer(zw);
    // min order (zone min 50; v1 costs 80 → ok, so raise it)
    await db.doc(`zones/${zw.zoneId}`).update({ min_order: 1000 });
    await addToCart(c.uid, zw, 'v1', 1);
    await expectCode(place(c, zw), 'failed-precondition', /Minimum order/);
    await db.doc(`zones/${zw.zoneId}`).update({ min_order: 0 });
    // COD max
    await db.doc('settings/public').set({ cod: { enabled: true, max_amount: 50 } }, { merge: true });
    await expectCode(place(c, zw), 'failed-precondition', /Cash on Delivery is available for orders up to/);
    await db.doc('settings/public').set({ cod: { enabled: true, max_amount: 0 } }, { merge: true });
    // store closed
    await db.doc(`stores/${zw.storeId}`).update({ is_open: false });
    await expectCode(place(c, zw), 'failed-precondition', /closed/);
    await db.doc(`stores/${zw.storeId}`).update({ is_open: true });
    // inactive product
    await db.doc(`products/${zw.p1}`).update({ status: 'inactive' });
    await expectCode(place(c, zw), 'failed-precondition', /out of stock/);
    await db.doc(`products/${zw.p1}`).update({ status: 'active', variants: [{ id: zw.v1, name: '1 kg', price: 100, sale_price: 80, stock: 20, status: false }] });
    await expectCode(place(c, zw), 'failed-precondition', /out of stock/);
    await db.doc(`products/${zw.p1}`).update({ variants: [{ id: zw.v1, name: '1 kg', price: 100, sale_price: 80, stock: 20, status: true }] });
    // zone inactive
    await db.doc(`zones/${zw.zoneId}`).update({ status: 'inactive' });
    await expectCode(place(c, zw), 'failed-precondition', /do not deliver/);
    await db.doc(`zones/${zw.zoneId}`).update({ status: 'active', fulfillment_type: 'ecommerce' });
    await expectCode(place(c, zw), 'failed-precondition', /not available in this area/);
    await db.doc(`zones/${zw.zoneId}`).update({ fulfillment_type: 'both' });
    // address outside the zone polygon (Delhi) with this zone_id
    const far = await addAddress(c.uid, 28.61, 77.2);
    await expectCode(place(c, zw, { address_id: far }), 'failed-precondition', /outside the delivery zone/);
    // finally OK
    const ok = await place(c, zw);
    expect(ok.order_number).toMatch(/^SB-ORD-/);
  });

  it('ecommerce mode uses central stock, quick uses the store stock', async () => {
    const sw = await seedWorld({ tag: 'src' });
    const c = await customer(sw);
    await addToCart(c.uid, sw, 'v2', 2, 'quick');
    await place(c, sw);
    expect((await db.doc(`store_stocks/${sw.storeId}_${sw.v2}`).get()).get('stock')).toBe(8);
    expect((await db.doc(`products/${sw.p2}`).get()).get('variants')[0].stock).toBe(5);
    await addToCart(c.uid, sw, 'v2', 2, 'ecommerce');
    await c.call('placeOrder', { zone_id: sw.zoneId, mode: 'ecommerce', address_id: c.addr, delivery_type: 'delivery', payment_method: 'cod' });
    expect((await db.doc(`products/${sw.p2}`).get()).get('variants')[0].stock).toBe(3);
    expect((await db.doc(`store_stocks/${sw.storeId}_${sw.v2}`).get()).get('stock')).toBe(8);
  });

  it('surge windows that wrap midnight (unit)', () => {
    const zone = { surge_slots: [{ from: '23:00', to: '02:00', amount: 15 }, { from: '18:00', to: '21:00', amount: 10 }] } as never;
    const ist = (hhmm: string) => new Date(`2026-01-10T${hhmm}:00+05:30`);
    expect(currentSurge(zone, ist('23:30'))).toBe(15);
    expect(currentSurge(zone, ist('00:30'))).toBe(15);
    expect(currentSurge(zone, ist('01:59'))).toBe(15);
    expect(currentSurge(zone, ist('02:00'))).toBe(0);
    expect(currentSurge(zone, ist('19:00'))).toBe(10);
    expect(currentSurge(zone, ist('12:00'))).toBe(0);
  });
});

/* ====================================================================== wallet */
describe('wallet', () => {
  it('concurrent withdrawals cannot overdraw the wallet', async () => {
    const c = await customer(w, { wallet: 300 });
    const res = await Promise.allSettled([c.call('walletWithdraw', { amount: 300 }), c.call('walletWithdraw', { amount: 300 }), c.call('walletWithdraw', { amount: 200 })]);
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    const bal = (await db.doc(`users/${c.uid}`).get()).get('wallet_balance');
    expect(bal).toBeGreaterThanOrEqual(0);
    expect([0, 100]).toContain(bal);
  });
});

/* ====================================================================== lifecycle idempotency */
describe('order lifecycle idempotency', () => {
  it('double cancel refunds once; delivered orders cannot be cancelled (even by admin/store)', async () => {
    const c = await customer(w, { wallet: 1000 });
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w, { payment_method: 'wallet' });
    const paid = (await db.doc(`users/${c.uid}`).get()).get('wallet_balance');
    await c.call('cancelOrder', { order_id });
    await expectCode(c.call('cancelOrder', { order_id }), 'failed-precondition');
    const admin = await makeAdmin();
    await expectCode(admin.call('adminUpdateOrderStatus', { order_id, status: 'cancelled' }), 'failed-precondition');
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(1000);
    expect(paid).toBeLessThan(1000);

    await addToCart(c.uid, w, 'v1', 1);
    const second = await place(c, w, { payment_method: 'wallet' });
    await admin.call('adminUpdateOrderStatus', { order_id: second.order_id, status: 'ready_for_pickup' });
    await admin.call('adminUpdateOrderStatus', { order_id: second.order_id, status: 'delivered' });
    const before = (await db.doc(`users/${c.uid}`).get()).get('wallet_balance');
    await expectCode(admin.call('adminUpdateOrderStatus', { order_id: second.order_id, status: 'cancelled', force: true }), 'failed-precondition', /cannot be cancelled/);
    const store = await storeUser(w.storeId);
    await expectCode(store.call('adminUpdateOrderStatus', { order_id: second.order_id, status: 'cancelled' }), 'failed-precondition');
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(before);
  });

  it('double deliverOrder: commission and COD cash recorded once; OTP brute force is locked out', async () => {
    const rider = await makeRider(w, { commission_type: 'fixed', commission_value: 20 });
    await db.doc(`delivery_boys/${rider.uid}`).update({ is_online: true });
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w);
    await rider.call('acceptOrder', { order_id });
    await rider.call('updateDeliveryStatus', { order_id, status: 'picked_up' });
    const otp = String((await db.doc(`orders/${order_id}/secret/otp`).get()).get('delivery_otp'));
    const wrong = otp === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) await expectCode(rider.call('deliverOrder', { order_id, otp: wrong }), 'invalid-argument', /Invalid delivery OTP/);
    await expectCode(rider.call('deliverOrder', { order_id, otp: wrong }), 'resource-exhausted');
    // locked: even the right OTP is refused for now
    await expectCode(rider.call('deliverOrder', { order_id, otp }), 'resource-exhausted');
    await db.doc(`orders/${order_id}/secret/otp`).update({ otp_locked_until: null, otp_failures: 0 });
    const r = await rider.call('deliverOrder', { order_id, otp });
    expect(r.order.status).toBe('delivered');
    await expectCode(rider.call('deliverOrder', { order_id, otp }), 'failed-precondition', /already completed/);
    const total = (await db.doc(`orders/${order_id}`).get()).get('totals').total;
    expect((await db.doc(`delivery_boys/${rider.uid}`).get()).get('cash_in_hand')).toBe(total);
    await waitFor(async () => (await db.doc(`delivery_earnings/commission_${order_id}`).get()).exists);
    const earn = await db.collection('delivery_earnings').where('order_id', '==', order_id).get();
    expect(earn.size).toBe(1);
    // another rider cannot deliver / read the OTP via callables
    const other = await makeRider(w);
    await expectCode(other.call('deliverOrder', { order_id, otp }), 'permission-denied');
  });

  it('processReturn refund cannot exceed the paid line amount; refund completes once', async () => {
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 2);
    const { order_id } = await place(c, w);
    const admin = await makeAdmin();
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'ready_for_pickup' });
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'delivered' });
    const rr = await c.call('requestReturn', { order_id, variant_id: w.v1, qty: 1, reason: 'Damaged' });
    expect(rr.refund_amount).toBe(80);
    await expectCode(admin.call('processReturn', { return_id: rr.id, action: 'approved', refund_amount: 100000 }), 'invalid-argument', /refund amount/);
    const store = await storeUser(w.storeId);
    await expectCode(store.call('processReturn', { return_id: rr.id, action: 'approved', refund_amount: 5000 }), 'invalid-argument');
    await admin.call('processReturn', { return_id: rr.id, action: 'approved', refund_amount: 160 });
    await admin.call('processReturn', { return_id: rr.id, action: 'refund_completed' });
    await expectCode(admin.call('processReturn', { return_id: rr.id, action: 'refund_completed' }), 'failed-precondition', /already closed/);
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(160);
  });
});

/* ====================================================================== anonymous / account abuse */
describe('anonymous and account abuse', () => {
  it('guests cannot place orders, withdraw, review or return', async () => {
    const g = await anonymousClient();
    await g.call('syncProfile', { app: 'customer' });
    await db.doc(`users/${g.uid}/cart/quick_${w.storeId}_${w.v1}`).set({ product_id: w.p1, variant_id: w.v1, store_id: w.storeId, mode: 'quick', qty: 1, added_at: Timestamp.now() });
    await expectCode(g.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', delivery_type: 'self_pickup', payment_method: 'cod' }), 'failed-precondition', /log in/);
    await expectCode(g.call('walletWithdraw', { amount: 500 }), 'failed-precondition');
    await expectCode(g.call('submitReview', { order_id: 'nope', variant_id: 'x', rating: 5 }), 'not-found');
    await expectCode(g.call('requestReturn', { order_id: 'nope', variant_id: 'x', qty: 1, reason: 'x' }), 'not-found');
    await expectCode(g.call('walletAdjust', { uid: g.uid, type: 'credit', amount: 5 }), 'permission-denied');
    expect((await db.doc(`users/${g.uid}`).get()).get('wallet_balance')).toBe(0);
  });

  it('submitReview: only once per item, only own delivered orders, rating 1..5', async () => {
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w);
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v1, rating: 5 }), 'failed-precondition', /after delivery/);
    const admin = await makeAdmin();
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'ready_for_pickup' });
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'delivered' });
    const other = await customer(w);
    await expectCode(other.call('submitReview', { order_id, variant_id: w.v1, rating: 5 }), 'not-found');
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v1, rating: 6 }), 'invalid-argument');
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v1, rating: 5, images: ['users/someone_else/x.jpg'] }), 'invalid-argument');
    await c.call('submitReview', { order_id, variant_id: w.v1, rating: 5, comment: 'ok' });
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v1, rating: 1 }), 'failed-precondition', /already reviewed/);
  });

  it('syncProfile never links a legacy panel (admin) profile by phone; claims stay customer', async () => {
    const phone = `+9198${String(Date.now()).slice(-8)}`;
    await db.doc(`users/${uniq('legacyadmin')}`).set({ type: 'admin', name: 'Old admin', phone, email: null, status: 'active', wallet_balance: 0 });
    const c = await makeUser({ phone, profile: false });
    const r = await c.call('syncProfile', { app: 'customer' });
    expect(r.user.type).toBe('customer');
    expect(r.claims.role).toBe('customer');
    expect((await auth.getUser(c.uid)).customClaims?.role).toBe('customer');
  });

  it('registerDeliveryBoy cannot self-approve; client document paths must be its own', async () => {
    const c = await makeUser({ profile: false });
    await expectCode(c.call('registerDeliveryBoy', { name: 'R', phone: '+911', zone_id: w.zoneId, driving_license: 'delivery_docs/someone/x.jpg' }), 'failed-precondition');
    const r = await c.call('registerDeliveryBoy', { name: 'R', phone: '+911', zone_id: w.zoneId, approval_status: 'approved', cash_in_hand: 1e6 });
    expect(r.approval_status).toBe('pending');
    const b = (await db.doc(`delivery_boys/${c.uid}`).get()).data()!;
    expect(b.approval_status).toBe('pending');
    expect(b.cash_in_hand).toBe(0);
    await expectCode(c.call('setOnline', { is_online: true }), 'permission-denied');
  });
});

/* ====================================================================== store staff model (B1) + bulk email queue (B2) */
describe('store staff are store-scoped', () => {
  it('a legacy staff doc with store_id gets role "store" claims; createPanelUser maps staff+store_id to a store user', async () => {
    const roleId = uniq('srole');
    await db.doc(`roles/${roleId}`).set({ name: 'Store packer', scope: 'store', store_id: w.storeId, permissions: ['order.list', 'order.view'] });
    const legacy = await makeUser({ claims: { role: 'staff', role_id: roleId }, profile: { type: 'staff', store_id: w.storeId, role_id: roleId } });
    const r = await legacy.call('syncProfile', {});
    expect(r.claims).toMatchObject({ role: 'store', store_id: w.storeId, role_id: roleId });
    expect((await db.doc(`users/${legacy.uid}`).get()).get('type')).toBe('store');

    const admin = await makeAdmin();
    const created = await admin.call('createPanelUser', { type: 'staff', name: 'S', email: `${uniq('st')}@t.io`, password: 'secret12', store_id: w.storeId, role_id: roleId });
    expect(created.claims).toMatchObject({ role: 'store', store_id: w.storeId, role_id: roleId });
    expect((await db.doc(`users/${created.uid}`).get()).get('type')).toBe('store');
  });

  it('store staff are limited by their store role and cannot manage the owner or grant owner access', async () => {
    const roleId = uniq('srole');
    await db.doc(`roles/${roleId}`).set({ name: 'Staff mgr', scope: 'store', store_id: w.storeId, permissions: ['staff.*', 'order.list'] });
    const staff = await makeUser({ claims: { role: 'store', store_id: w.storeId, role_id: roleId }, profile: { type: 'store', store_id: w.storeId, role_id: roleId } });
    const owner = await storeUser(w.storeId);
    // no permission → denied
    await expectCode(staff.call('exportReport', { type: 'orders' }), 'permission-denied');
    await expectCode(staff.call('adminUpdateOrderStatus', { order_id: 'x', status: 'processed' }), 'permission-denied');
    // cannot touch the owner (password reset = takeover) nor create owner-level users
    await expectCode(staff.call('updatePanelUser', { uid: owner.uid, password: 'hijack123' }), 'permission-denied');
    await expectCode(staff.call('createPanelUser', { type: 'store', name: 'x', email: `${uniq('o')}@t.io`, password: 'secret12' }), 'permission-denied');
    const otherRole = uniq('orole');
    await db.doc(`roles/${otherRole}`).set({ name: 'Other', scope: 'store', store_id: 'other_store', permissions: ['*'] });
    await expectCode(staff.call('createPanelUser', { type: 'store', name: 'x', email: `${uniq('o')}@t.io`, password: 'secret12', role_id: otherRole }), 'invalid-argument');
    const ok = await staff.call('createPanelUser', { type: 'store', name: 'x', email: `${uniq('o')}@t.io`, password: 'secret12', role_id: roleId });
    expect(ok.claims).toMatchObject({ role: 'store', store_id: w.storeId, role_id: roleId });
  });
});

describe('sendBulkEmail queues work', () => {
  it('returns immediately with `queued`; onMailQueued processes the jobs', async () => {
    await db.doc('settings/private_smtp').set({ host: '127.0.0.1', port: 2, username: 'u', password: 'p', encryption: 'none', from_email: 'noreply@t.io' });
    try {
      const admin = await makeAdmin();
      const a = await makeUser({ profile: { email: `${uniq('m')}@t.io` } });
      const b = await makeUser({ profile: { email: `${uniq('m')}@t.io` } });
      const r = await admin.call('sendBulkEmail', { subject: 'Hi', body: '<p>x</p>', segment: 'specific', user_ids: [a.uid, b.uid, 'missing_user'] });
      expect(r).toMatchObject({ queued: 2, total: 2 });
      const jobs = await db.collection('mail_queue').where('created_by', '==', admin.uid).get();
      expect(jobs.size).toBe(1);
      expect(jobs.docs[0].get('to')).toHaveLength(2);
      await waitFor(async () => ['done', 'failed'].includes(String((await jobs.docs[0].ref.get()).get('status'))), 120_000);
      expect((await jobs.docs[0].ref.get()).get('failed')).toBe(2); // no SMTP server on port 2
    } finally {
      await db.doc('settings/private_smtp').delete();
    }
  });
});

/* ====================================================================== customer / delivery QA batch */
describe('account and cart edge cases (customer / delivery QA)', () => {
  it('registerDeliveryBoy never converts an existing customer / panel account', async () => {
    const c = await makeUser();
    await expectCode(c.call('registerDeliveryBoy', { name: 'R', phone: '+911', zone_id: w.zoneId }), 'permission-denied');
    expect((await db.doc(`users/${c.uid}`).get()).get('type')).toBe('customer');
    expect((await db.doc(`delivery_boys/${c.uid}`).get()).exists).toBe(false);
    const store = await storeUser(w.storeId);
    await expectCode(store.call('registerDeliveryBoy', { name: 'R', phone: '+911', zone_id: w.zoneId }), 'permission-denied');
  });

  it('syncProfile from the wrong app writes nothing (fcm token, language) and flags wrong_app', async () => {
    const c = await makeUser({ profile: { fcm_tokens: ['keep'], language: 'en' } });
    const r = await c.call('syncProfile', { app: 'delivery', fcm_token: 'rider-device', language: 'hi' });
    expect(r.wrong_app).toBe(true);
    const u = (await db.doc(`users/${c.uid}`).get()).data()!;
    expect(u.fcm_tokens).toEqual(['keep']);
    expect(u.language).toBe('en');
    const rider = await makeRider(w);
    const r2 = await rider.call('syncProfile', { app: 'customer', fcm_token: 'shop-device' });
    expect(r2.wrong_app).toBe(true);
    expect((await db.doc(`users/${rider.uid}`).get()).get('fcm_tokens')).toEqual([]);
    const ok = await rider.call('syncProfile', { app: 'delivery', fcm_token: 'rider-device' });
    expect(ok.wrong_app).toBeUndefined();
    expect((await db.doc(`users/${rider.uid}`).get()).get('fcm_tokens')).toContain('rider-device');
  });

  it('cartSummary prices delivery like placeOrder: address when given, else the zone default (detected lat/lng ignored)', async () => {
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    const far = { lat: STORE_LAT + 0.2, lng: STORE_LNG };
    const noAddr = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', ...far });
    expect(noAddr.delivery_basis).toBe('default');
    expect(noAddr.delivery_charge).toBe(20);
    const withAddr = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: c.addr, ...far });
    expect(withAddr.delivery_basis).toBe('address');
    const placed = await place(c, w);
    const o = (await db.doc(`orders/${placed.order_id}`).get()).data()!;
    expect(o.totals.grand_total).toBe(withAddr.grand_total);
  });

  it('submitReview stores public download URLs for Storage paths; unknown paths are refused', async () => {
    const { getStorage } = await import('firebase-admin/storage');
    const c = await customer(w);
    await addToCart(c.uid, w, 'v1', 1);
    const { order_id } = await place(c, w);
    const admin = await makeAdmin();
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'ready_for_pickup' });
    await admin.call('adminUpdateOrderStatus', { order_id, status: 'delivered' });
    const path = `reviews/${c.uid}/r1.jpg`;
    await getStorage().bucket(`${PROJECT_ID}.firebasestorage.app`).file(path).save(Buffer.from('img'), { contentType: 'image/jpeg' });
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v1, rating: 4, images: [`reviews/${c.uid}/missing.jpg`] }), 'invalid-argument');
    const r = await c.call('submitReview', { order_id, variant_id: w.v1, rating: 4, images: [path, 'https://example.com/x.jpg'] });
    const imgs = (await db.doc(`reviews/${r.id}`).get()).get('images') as string[];
    expect(imgs[0]).toMatch(/^https?:\/\/.*\/o\/reviews%2F.*r1\.jpg\?alt=media&token=/);
    expect(imgs[1]).toBe('https://example.com/x.jpg');
  });

  it('mergeGuestCart: unknown guest → not-found; non-anonymous account → failed-precondition', async () => {
    const c = await makeUser();
    await expectCode(c.call('mergeGuestCart', { guest_uid: `nobody_${uniq('g')}` }), 'not-found');
    const other = await makeUser();
    await db.doc(`users/${other.uid}/cart/quick_${w.storeId}_${w.v1}`).set({ product_id: w.p1, variant_id: w.v1, store_id: w.storeId, mode: 'quick', qty: 1 });
    await expectCode(c.call('mergeGuestCart', { guest_uid: other.uid }), 'failed-precondition');
    expect((await db.doc(`users/${other.uid}/cart/quick_${w.storeId}_${w.v1}`).get()).exists).toBe(true);
    const g = await anonymousClient();
    await db.doc(`users/${g.uid}/cart/quick_${w.storeId}_${w.v1}`).set({ product_id: w.p1, variant_id: w.v1, store_id: w.storeId, mode: 'quick', qty: 2 });
    expect((await c.call('mergeGuestCart', { guest_uid: g.uid })).merged).toBe(1);
  });
});
