/** Delivery-boy callables. */
import { auth, authed, db, denied, notFound, now, oneOf, precondition, str } from '../shared/firebase';
import type { DeliveryBoyDoc } from '../shared/types';
import { searchKeywords } from '../shared/util';
import { acceptByRider, deliverWithOtp, publicOrder, rejectByRider, riderStatus, updateReturn } from '../services/orders';
import { syncClaims, uniqueReferralCode } from './account';

function requireRider(role: string) {
  if (role !== 'delivery_boy') denied('Only delivery partners can perform this action.');
}

const docPath = (uid: string, p: unknown, field: string) => {
  const s = str(p, field, { max: 500 });
  if (s && !s.startsWith(`delivery_docs/${uid}/`) && !/^https?:\/\//.test(s)) precondition(`The ${field.replace(/_/g, ' ')} must be uploaded to delivery_docs/${uid}/.`);
  return s || null;
};

export const registerDeliveryBoy = authed<Record<string, unknown>>(async (d, ctx) => {
  const existing = await db.doc(`delivery_boys/${ctx.uid}`).get();
  if (existing.exists) {
    if (existing.get('approval_status') !== 'rejected') return { approval_status: existing.get('approval_status') };
  }
  const userSnap = await db.doc(`users/${ctx.uid}`).get();
  // Only brand-new accounts or existing riders (pending / rejected re-application) may register — never turn a
  // customer / panel account into a rider.
  if (userSnap.exists && String(userSnap.get('type') ?? 'customer') !== 'delivery_boy') {
    denied('This account is already registered as a ' + String(userSnap.get('type') ?? 'customer') + '. Use a separate account to become a delivery partner.');
  }
  const rec = await auth.getUser(ctx.uid);
  const name = str(d.name, 'name', { required: true, max: 100 });
  const phone = str(d.phone, 'phone', { required: true, max: 20 });
  const zoneId = str(d.zone_id, 'zone_id', { required: true, max: 128 });
  const zone = await db.doc(`zones/${zoneId}`).get();
  if (!zone.exists) notFound('Zone not found.');
  const bank = (d.bank && typeof d.bank === 'object' ? d.bank : {}) as Record<string, unknown>;
  const boy: Partial<DeliveryBoyDoc> & Record<string, unknown> = {
    zone_id: zoneId, country_id: str(d.country_id, 'country_id', { max: 128 }) || zone.get('country_id') || null,
    dob: str(d.dob, 'dob', { max: 20 }) || null, address: str(d.address, 'address', { max: 500 }) || null,
    vehicle_type: str(d.vehicle_type, 'vehicle_type', { max: 30 }) || null, vehicle_number: str(d.vehicle_number, 'vehicle_number', { max: 30 }) || null,
    driving_license: docPath(ctx.uid, d.driving_license, 'driving_license'), id_proof: docPath(ctx.uid, d.id_proof, 'id_proof'),
    bank: { name: str(bank.name, 'bank name', { max: 100 }) || null, account: str(bank.account, 'bank account', { max: 40 }) || null, ifsc: str(bank.ifsc, 'ifsc', { max: 20 }) || null } as never,
    commission_type: 'percent', commission_value: 0, salary: 0, cash_in_hand: 0, earnings_total: 0, rating_avg: 0, rating_count: 0,
    is_online: false, location: null, approval_status: 'pending', status: 'active', name, phone, email: rec.email ?? null, created_at: now(),
  };
  if (existing.exists) {
    // re-application after rejection keeps financial counters
    for (const k of ['cash_in_hand', 'earnings_total', 'rating_avg', 'rating_count', 'commission_type', 'commission_value', 'salary']) delete boy[k];
    await existing.ref.set({ ...boy, approval_remark: null }, { merge: true });
  } else {
    await existing.ref.set(boy);
  }
  if (userSnap.exists) {
    await userSnap.ref.update({ type: 'delivery_boy', name, phone, updated_at: now() });
  } else {
    await userSnap.ref.set({
      type: 'delivery_boy', name, email: rec.email ?? null, phone, avatar: rec.photoURL ?? null, referral_code: await uniqueReferralCode(), referred_by: null,
      wallet_balance: 0, orders_count: 0, total_spent: 0, fcm_tokens: [], status: 'active', language: 'en',
      search_keywords: searchKeywords(name, rec.email ?? '', phone), created_at: now(), updated_at: now(), last_login_at: now(),
    });
  }
  await syncClaims(ctx.uid);
  return { approval_status: 'pending' };
});

export const setOnline = authed<{ is_online?: boolean }>(async (d, ctx) => {
  requireRider(ctx.role);
  const ref = db.doc(`delivery_boys/${ctx.uid}`);
  const b = await ref.get();
  if (!b.exists) notFound('Delivery profile not found.');
  if (b.get('approval_status') !== 'approved') denied('Your account is pending approval.');
  if (b.get('status') !== 'active') denied('Your account is inactive.');
  const isOnline = !!d.is_online;
  await ref.update({ is_online: isOnline, online_at: isOnline ? now() : b.get('online_at') ?? null });
  return { is_online: isOnline };
});

export const acceptOrder = authed<{ order_id?: string }>(async (d, ctx) => {
  requireRider(ctx.role);
  const o = await acceptByRider(str(d.order_id, 'order_id', { required: true, max: 128 }), ctx.uid);
  return { order: publicOrder(o), message: 'Order accepted' };
});

export const rejectOrder = authed<{ order_id?: string; reason?: string }>(async (d, ctx) => {
  requireRider(ctx.role);
  await rejectByRider(str(d.order_id, 'order_id', { required: true, max: 128 }), ctx.uid, str(d.reason, 'reason', { max: 255 }) || null);
  return { message: 'Order rejected' };
});

export const updateDeliveryStatus = authed<{ order_id?: string; status?: string }>(async (d, ctx) => {
  requireRider(ctx.role);
  const status = oneOf(d.status, 'status', ['picked_up', 'out_for_delivery'] as const);
  const o = await riderStatus(str(d.order_id, 'order_id', { required: true, max: 128 }), ctx.uid, status);
  return { order: publicOrder(o) };
});

export const deliverOrder = authed<{ order_id?: string; otp?: string; cash_collected?: number }>(async (d, ctx) => {
  requireRider(ctx.role);
  const otp = str(d.otp, 'otp', { required: true, max: 10 });
  const cash = d.cash_collected === undefined || d.cash_collected === null || (d.cash_collected as unknown) === '' ? null : Number(d.cash_collected);
  const r = await deliverWithOtp(str(d.order_id, 'order_id', { required: true, max: 128 }), ctx.uid, otp, cash);
  return { order: publicOrder(r.order), cash_collected: r.cash_collected, cash_in_hand: r.cash_in_hand, message: 'Order delivered successfully' };
});

export const returnPickedUp = authed<{ return_id?: string }>(async (d, ctx) => {
  requireRider(ctx.role);
  const id = str(d.return_id, 'return_id', { required: true, max: 128 });
  const rr = await db.doc(`return_requests/${id}`).get();
  if (!rr.exists || rr.get('delivery_boy_id') !== ctx.uid) notFound('Return request not found.');
  if (rr.get('status') !== 'pickup_assigned') precondition('This return is not awaiting pickup.');
  const user = await db.doc(`users/${ctx.uid}`).get();
  const out = await updateReturn(id, 'picked_up', { remark: `Picked up by ${user.get('name') ?? 'delivery partner'}`, riderUid: ctx.uid, byUid: ctx.uid });
  return { id, status: out.status };
});
