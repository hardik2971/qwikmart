import { beforeAll, describe, expect, it } from 'vitest';
import { haversineKm, localHm, money, zonedParts } from '../src/shared/util';
import {
  addAddress, addPromo, addToCart, anonClient, db, expectCode, makeAdmin, makeRider, makeUser, seedWorld, STORE_LAT, STORE_LNG, uniq, waitFor, World,
} from './helpers';

const ADDR_LAT = STORE_LAT + 0.04;
const dist = Math.round(haversineKm(ADDR_LAT, STORE_LNG, STORE_LAT, STORE_LNG) * 100) / 100;
const DELIVERY = 20 + Math.ceil(dist - 2) * 5; // zone base 20 for 2 km + 5/km beyond

let w: World;
beforeAll(async () => {
  w = await seedWorld();
});

describe('detectZone', () => {
  it('Mumbai (19.076, 72.8777) is deliverable', async () => {
    const r = await anonClient().call('detectZone', { lat: 19.076, lng: 72.8777 });
    expect(r.deliverable).toBe(true);
    expect(r.zone).toBeTruthy();
    expect(r.store).toBeTruthy();
    expect(r.delivery_minutes).toBeGreaterThan(0);
  });
  it('Delhi is not deliverable', async () => {
    const r = await anonClient().call('detectZone', { lat: 28.61, lng: 77.2 });
    expect(r.deliverable).toBe(false);
  });
});

describe('cartSummary pricing', () => {
  it('per-km delivery charge, inclusive tax, savings', async () => {
    const c = await makeUser();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    const s = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: addr });
    expect(s.items).toHaveLength(1);
    expect(s.subtotal).toBe(160);
    expect(s.mrp_total).toBe(200);
    expect(s.distance_km).toBe(dist);
    expect(s.delivery_charge).toBe(DELIVERY);
    expect(s.tax_inclusive).toBe(true);
    expect(s.tax).toBe(money(160 - 160 / 1.05));
    expect(s.grand_total).toBe(160 + DELIVERY);
    expect(s.total).toBe(160 + DELIVERY);
    expect(s.savings).toBe(40);
    expect(s.free_delivery_remaining).toBe(340);
    expect(s.can_checkout).toBe(true);
  });

  it('free delivery above threshold', async () => {
    const c = await makeUser();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    await addToCart(c.uid, w, 'v2', 2);
    const s = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: addr });
    expect(s.subtotal).toBe(760);
    expect(s.delivery_charge).toBe(0);
    expect(s.delivery_charge_original).toBe(DELIVERY);
    expect(s.grand_total).toBe(760);
    expect(s.savings).toBe(40 + DELIVERY);
  });

  it('surge slot covering the current Asia/Kolkata time', async () => {
    const now = new Date();
    const from = localHm(new Date(now.getTime() - 3600_000));
    const to = localHm(new Date(now.getTime() + 3600_000));
    const ws = await seedWorld({ surge: [{ from, to, amount: 15 }, { from: '03:00', to: '03:01', amount: 99 }] });
    const c = await makeUser();
    const addr = await addAddress(c.uid, STORE_LAT, STORE_LNG); // 0 km → base charge
    await addToCart(c.uid, ws, 'v1', 1);
    const s = await c.call('cartSummary', { zone_id: ws.zoneId, mode: 'quick', address_id: addr });
    expect(s.delivery_charge).toBe(20);
    expect(s.surge_charge).toBe(15);
    expect(s.grand_total).toBe(80 + 20 + 15);
    expect(s.issues).toEqual([]);
  });

  it('min order issue + stock issue', async () => {
    const c = await makeUser();
    await addToCart(c.uid, w, 'v2', 11); // store stock 10, max 10
    const s = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick' });
    expect(s.can_checkout).toBe(false);
    expect(s.issues[0]).toMatch(/Only 10 units/);
  });

  describe('promo codes', () => {
    const run = async (code: string, extra: Record<string, unknown> = {}) => {
      const c = await makeUser();
      const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
      await addToCart(c.uid, w, 'v1', 2);
      return c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: addr, promo_code: code.toLowerCase(), ...extra });
    };
    it('percent with max discount', async () => {
      const code = uniq('PCT').toUpperCase();
      await addPromo(code, { discount_type: 'percent', discount_value: 25, max_discount: 30 });
      const s = await run(code);
      expect(s.promo.discount).toBe(30); // 25% of 160 = 40 capped at 30
      expect(s.grand_total).toBe(160 - 30 + DELIVERY);
    });
    it('fixed', async () => {
      const code = uniq('FIX').toUpperCase();
      await addPromo(code, { discount_type: 'fixed', discount_value: 50 });
      const s = await run(code);
      expect(s.promo.discount).toBe(50);
      expect(s.grand_total).toBe(110 + DELIVERY);
    });
    it('free_delivery', async () => {
      const code = uniq('FD').toUpperCase();
      await addPromo(code, { discount_type: 'free_delivery', discount_value: 0 });
      const s = await run(code);
      expect(s.promo.free_delivery).toBe(true);
      expect(s.promo.discount).toBe(DELIVERY);
      expect(s.grand_total).toBe(160);
    });
    it('cashback does not reduce the payable amount', async () => {
      const code = uniq('CB').toUpperCase();
      await addPromo(code, { discount_type: 'fixed', discount_value: 20, is_cashback: true });
      const s = await run(code);
      expect(s.promo.is_cashback).toBe(true);
      expect(s.promo.discount).toBe(20);
      expect(s.grand_total).toBe(160 + DELIVERY);
    });
    it('invalid / min order / expired', async () => {
      expect((await run('NOPE_XYZ')).promo_error).toBe('Invalid coupon code.');
      const code = uniq('MIN').toUpperCase();
      await addPromo(code, { min_order: 1000 });
      expect((await run(code)).promo_error).toMatch(/Add items worth ₹840 more/);
      const code2 = uniq('EXP').toUpperCase();
      await addPromo(code2, { is_permanent: false, ends_at: new Date(Date.now() - 86400_000) });
      expect((await run(code2)).promo_error).toBe('This coupon has expired.');
    });
    it('listCoupons shows applicability', async () => {
      const code = uniq('LST').toUpperCase();
      await addPromo(code, { discount_type: 'fixed', discount_value: 10, zone_ids: [w.zoneId] });
      const c = await makeUser();
      await addToCart(c.uid, w, 'v1', 1);
      const list = await c.call('listCoupons', { zone_id: w.zoneId, mode: 'quick' });
      const mine = list.find((x: { code: string }) => x.code === code);
      expect(mine.applicable).toBe(true);
      expect(mine.discount).toBe(10);
    });
  });

  it('wallet usage', async () => {
    const c = await makeUser({ profile: { wallet_balance: 50 } });
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    const s = await c.call('cartSummary', { zone_id: w.zoneId, mode: 'quick', address_id: addr, use_wallet: true });
    expect(s.wallet_balance).toBe(50);
    expect(s.wallet_used).toBe(50);
    expect(s.total).toBe(160 + DELIVERY - 50);
  });
});

describe('placeOrder → cancel', () => {
  it('decrements stock, debits wallet, consumes promo, creates OTP and sequential numbers; cancel refunds + restocks', async () => {
    const code = uniq('ORD').toUpperCase();
    await addPromo(code, { discount_type: 'fixed', discount_value: 10 });
    const c = await makeUser({ profile: { wallet_balance: 50 } });
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    const stockBefore = (await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock');

    const r = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod', promo_code: code, use_wallet: true, platform: 'app' });
    expect(r.order_number).toMatch(/^SB-ORD-\d{5,}$/);
    expect(r.payment).toBeNull();

    const order = (await db.doc(`orders/${r.order_id}`).get()).data()!;
    expect(order.status).toBe('received');
    expect(order.user_id).toBe(c.uid);
    expect(order.totals.subtotal).toBe(160);
    expect(order.totals.promo_discount).toBe(10);
    expect(order.totals.wallet_used).toBe(50);
    expect(order.totals.grand_total).toBe(150 + DELIVERY);
    expect(order.totals.total).toBe(100 + DELIVERY);
    expect(order.items[0].stock_source).toBe('store');
    expect(order.can_cancel).toBe(true);
    expect((await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock')).toBe(stockBefore - 2);
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(0);
    const tx = await db.collection(`users/${c.uid}/wallet_transactions`).get();
    expect(tx.docs.map((d) => d.data()).find((t) => t.type === 'debit')?.amount).toBe(50);
    expect((await db.doc(`promo_codes/${code}`).get()).get('used_count')).toBe(1);
    expect((await db.doc(`promo_usages/${code}_${c.uid}`).get()).get('count')).toBe(1);
    const otp = (await db.doc(`orders/${r.order_id}/secret/otp`).get()).get('delivery_otp');
    expect(otp).toMatch(/^\d{6}$/);
    expect((await db.collection(`users/${c.uid}/cart`).get()).size).toBe(0);

    // number sequence
    await addToCart(c.uid, w, 'v1', 1);
    const r2 = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    expect(Number(r2.order_number.slice(7))).toBe(Number(r.order_number.slice(7)) + 1);

    // cancel → refund + restock + promo released
    await c.call('cancelOrder', { order_id: r.order_id, reason: 'Changed my mind' });
    const cancelled = (await db.doc(`orders/${r.order_id}`).get()).data()!;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.payment_status).toBe('refunded');
    expect(cancelled.cancelled_by).toBe('customer');
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(50);
    expect((await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock')).toBe(stockBefore - 1); // order 2 still holds 1
    expect((await db.doc(`promo_codes/${code}`).get()).get('used_count')).toBe(0);
    await expectCode(c.call('cancelOrder', { order_id: r.order_id }), 'failed-precondition');
  });

  it('central stock (ecommerce) is decremented on the product variant', async () => {
    const c = await makeUser();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v2', 1, 'ecommerce');
    const before = (await db.doc(`products/${w.p2}`).get()).get('variants')[0].stock;
    const r = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'ecommerce', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    expect((await db.doc(`products/${w.p2}`).get()).get('variants')[0].stock).toBe(before - 1);
    expect((await db.doc(`orders/${r.order_id}`).get()).get('items')[0].stock_source).toBe('central');
  });

  it('rejects wallet payment without enough balance and empty carts', async () => {
    const c = await makeUser({ profile: { wallet_balance: 10 } });
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await expectCode(c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' }), 'failed-precondition', /cart is empty/);
    await addToCart(c.uid, w, 'v1', 1);
    await expectCode(c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'wallet' }), 'failed-precondition', /Insufficient wallet/);
    await expectCode(c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'stripe' }), 'invalid-argument', /not available/);
  });
});

describe('stats_daily', () => {
  it('increments zone/store/all scopes and moves revenue out on cancel', async () => {
    const ws = await seedWorld({ tag: 'stats' });
    const c = await makeUser();
    const addr = await addAddress(c.uid, STORE_LAT, STORE_LNG);
    await addToCart(c.uid, ws, 'v1', 3); // 240 + 20 delivery
    const date = zonedParts(new Date()).date;
    const hour = String(zonedParts(new Date()).hour);
    const allBefore = (await db.doc(`stats_daily/all_${date}`).get()).get('orders') ?? 0;
    const r = await c.call('placeOrder', { zone_id: ws.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    const zs = await waitFor(async () => {
      const s = await db.doc(`stats_daily/zone_${ws.zoneId}_${date}`).get();
      return s.exists && s.get('orders') === 1 ? s.data() : null;
    });
    expect(zs.revenue).toBe(260);
    expect(zs.units).toBe(3);
    expect(zs.delivery_charges).toBe(20);
    expect(zs.by_status.received).toBe(1);
    expect(zs.by_mode.quick).toEqual({ orders: 1, revenue: 260 });
    expect(zs.by_category[ws.categoryId]).toEqual({ revenue: 240, units: 3 });
    expect(zs.by_hour[hour].orders).toBe(1);
    const ss = (await db.doc(`stats_daily/store_${ws.storeId}_${date}`).get()).data()!;
    expect(ss.revenue).toBe(260);
    expect((await db.doc(`stats_daily/all_${date}`).get()).get('orders')).toBeGreaterThan(allBefore);
    await waitFor(async () => (await db.doc(`products/${ws.p1}`).get()).get('sold_count') === 3);
    await waitFor(async () => (await db.doc(`users/${c.uid}`).get()).get('orders_count') === 1);

    await c.call('cancelOrder', { order_id: r.order_id, reason: 'test' });
    const after = await waitFor(async () => {
      const s = await db.doc(`stats_daily/zone_${ws.zoneId}_${date}`).get();
      return s.get('cancelled') === 1 ? s.data() : null;
    });
    expect(after.orders).toBe(1);
    expect(after.revenue).toBe(0);
    expect(after.units).toBe(0);
    expect(after.by_status.received).toBe(0);
    expect(after.by_status.cancelled).toBe(1);
    await waitFor(async () => (await db.doc(`products/${ws.p1}`).get()).get('sold_count') === 0);
  });
});

describe('rider delivery flow', () => {
  it('accept → picked_up → out_for_delivery → deliver (wrong/right OTP), COD cash + commission', async () => {
    const c = await makeUser();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    const { order_id } = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    const total = 160 + DELIVERY;
    const rider = await makeRider(w, { commission_type: 'percent', commission_value: 10 });
    await expectCode(rider.call('acceptOrder', { order_id }), 'failed-precondition', /Go online/);
    await rider.call('setOnline', { is_online: true });
    await rider.call('acceptOrder', { order_id });
    const other = await makeRider(w);
    await other.call('setOnline', { is_online: true });
    await expectCode(other.call('acceptOrder', { order_id }), 'failed-precondition', /already been accepted/);
    expect((await db.doc(`orders/${order_id}`).get()).get('delivery_boy_id')).toBe(rider.uid);

    await expectCode(rider.call('updateDeliveryStatus', { order_id, status: 'out_for_delivery' }), 'failed-precondition');
    await rider.call('updateDeliveryStatus', { order_id, status: 'picked_up' });
    await rider.call('updateDeliveryStatus', { order_id, status: 'out_for_delivery' });
    await expectCode(rider.call('deliverOrder', { order_id, otp: '000000' }), 'invalid-argument', /Invalid delivery OTP/);
    const otp = (await db.doc(`orders/${order_id}/secret/otp`).get()).get('delivery_otp');
    const res = await rider.call('deliverOrder', { order_id, otp });
    expect(res.cash_collected).toBe(total);
    expect(res.cash_in_hand).toBe(total);
    const o = (await db.doc(`orders/${order_id}`).get()).data()!;
    expect(o.status).toBe('delivered');
    expect(o.payment_status).toBe('paid');
    expect(o.timeline.map((t: { status: string }) => t.status)).toEqual(expect.arrayContaining(['received', 'picked_up', 'out_for_delivery', 'delivered']));
    expect((await db.doc(`cash_collections/cod_${order_id}`).get()).get('amount')).toBe(total);
    const earn = await waitFor(async () => (await db.doc(`delivery_earnings/commission_${order_id}`).get()).data());
    expect(earn.amount).toBe(money(total * 0.1));
    expect(earn.status).toBe('credited');
    await waitFor(async () => (await db.doc(`users/${rider.uid}`).get()).get('wallet_balance') === money(total * 0.1));
    const notes = await waitFor(async () => {
      const n = await db.collection(`users/${c.uid}/notifications`).where('type', '==', 'order').get();
      return n.size >= 3 ? n : null;
    });
    expect(notes.docs.some((d) => /out for delivery/.test(d.get('message')))).toBe(true);
  });
});

describe('returns', () => {
  it('request → approve → pickup assigned → rider picked up (restock) → refund to wallet', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v1', 2);
    const { order_id } = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    const rider = await makeRider(w);
    await admin.call('assignDeliveryBoy', { order_id, delivery_boy_id: rider.uid });
    await rider.call('updateDeliveryStatus', { order_id, status: 'picked_up' });
    const otp = (await db.doc(`orders/${order_id}/secret/otp`).get()).get('delivery_otp');
    await rider.call('deliverOrder', { order_id, otp });

    await expectCode(c.call('requestReturn', { order_id, variant_id: w.v1, qty: 3, reason: 'bad' }), 'invalid-argument');
    const rr = await c.call('requestReturn', { order_id, variant_id: w.v1, qty: 1, reason: 'Damaged' });
    expect(rr.return_number).toMatch(/^RET-\d{5,}$/);
    expect(rr.refund_amount).toBe(80);
    await expectCode(c.call('requestReturn', { order_id, variant_id: w.v1, qty: 1, reason: 'again' }), 'failed-precondition');

    await admin.call('processReturn', { return_id: rr.id, action: 'approved' });
    await admin.call('processReturn', { return_id: rr.id, action: 'pickup_assigned', delivery_boy_id: rider.uid });
    const stock = (await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock');
    await rider.call('returnPickedUp', { return_id: rr.id });
    expect((await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock')).toBe(stock + 1);
    const walletBefore = (await db.doc(`users/${c.uid}`).get()).get('wallet_balance') ?? 0;
    await admin.call('processReturn', { return_id: rr.id, action: 'refund_completed' });
    expect((await db.doc(`users/${c.uid}`).get()).get('wallet_balance')).toBe(walletBefore + 80);
    expect((await db.doc(`store_stocks/${w.storeId}_${w.v1}`).get()).get('stock')).toBe(stock + 1); // no double restock
    const o = (await db.doc(`orders/${order_id}`).get()).data()!;
    expect(o.items[0].status).toBe('returned');
    expect(o.status).toBe('returned'); // only line fully returned → order returned + refunded (Laravel behaviour)
    expect(o.payment_status).toBe('refunded');
    expect((await db.doc(`return_requests/${rr.id}`).get()).get('status')).toBe('refund_completed');
    await expectCode(admin.call('processReturn', { return_id: rr.id, action: 'approved' }), 'failed-precondition', /closed/);
  });
});

describe('reviews, reorder, invoice', () => {
  it('submitReview updates product rating, reorder refills cart, invoice URL is generated', async () => {
    const c = await makeUser();
    const admin = await makeAdmin();
    const addr = await addAddress(c.uid, ADDR_LAT, STORE_LNG);
    await addToCart(c.uid, w, 'v2', 1);
    const { order_id } = await c.call('placeOrder', { zone_id: w.zoneId, mode: 'quick', address_id: addr, delivery_type: 'delivery', payment_method: 'cod' });
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v2, rating: 5 }), 'failed-precondition');
    for (const s of ['processed', 'shipped', 'delivered']) await admin.call('adminUpdateOrderStatus', { order_id, status: s });
    const before = (await db.doc(`products/${w.p2}`).get()).get('rating_count') ?? 0;
    await c.call('submitReview', { order_id, variant_id: w.v2, rating: 4, comment: 'Nice' });
    await waitFor(async () => (await db.doc(`products/${w.p2}`).get()).get('rating_count') === before + 1, 75_000); // trigger worker cold start can be slow on a busy machine
    await expectCode(c.call('submitReview', { order_id, variant_id: w.v2, rating: 4 }), 'failed-precondition', /already reviewed/);

    const r = await c.call('reorder', { order_id });
    expect(r.added).toBe(1);
    expect((await db.collection(`users/${c.uid}/cart`).get()).size).toBe(1);

    const inv = await c.call('getInvoiceUrl', { order_id });
    expect(inv.url).toMatch(/invoices/);
    expect((await db.doc(`orders/${order_id}`).get()).get('invoice_path')).toBe(inv.path);
    const res = await fetch(inv.url);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });
});
