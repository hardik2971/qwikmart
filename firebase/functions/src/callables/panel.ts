/** Admin / staff / store panel callables (permission-checked; store users scoped to claim.store_id). */
import { actorLabel, assertScope, PanelActor, requirePanel } from '../shared/access';
import { auth, authed, Ctx, db, denied, FieldValue, invalid, logger, notFound, now, numIn, oneOf, precondition, str, Timestamp } from '../shared/firebase';
import type { DeliveryBoyDoc, HomeLayoutDoc, HomeLayoutDraftDoc, Mode, OrderDoc, OrderStatus, ReturnRequestDoc, ReturnStatus, UserDoc, UserType } from '../shared/types';
import { chunk, money, num, searchKeywords, zonedParts } from '../shared/util';
import { assignDeliveryBoy as assignSvc, cancelOrder, publicOrder, timelineEntry, transitionOrder, updateReturn, withOtpAttempts } from '../services/orders';
import { WalletLedger } from '../services/wallet';
import { notifyUser, pushToTokens, sendEmail, smtpTransport } from '../services/notify';
import { hydrateSections, makeCtx } from '../services/home';
import { uploadAndLink } from '../services/invoice';
import { syncClaims, uniqueReferralCode } from './account';
import { isOrderStatus, RETURN_STATUSES } from '../shared/status';
import { clearCache, bucket } from '../shared/firebase';

/** Platform-level money / people actions are not available to store users (their owner role grants every permission). */
function noStore(actor: PanelActor, message = 'Only the admin panel can perform this action.') {
  if (actor.kind === 'store') denied(message);
}

async function storeZoneId(storeId: string | null): Promise<string | null> {
  if (!storeId) return null;
  return ((await db.doc(`stores/${storeId}`).get()).get('zone_id') as string | undefined) ?? null;
}

/* ================================================================== orders */
export const adminUpdateOrderStatus = authed<{ order_id?: string; status?: string; note?: string; force?: boolean }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'order.update');
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const status = str(d.status, 'status', { required: true, max: 30 });
  if (!isOrderStatus(status)) invalid(`Invalid status [${status}].`);
  const note = str(d.note, 'note', { max: 500 }) || null;
  const scope = (o: OrderDoc) => assertScope(actor, o.store_id, 'This order belongs to another store.');
  const o = status === 'cancelled'
    ? await (async () => {
        const snap = await db.doc(`orders/${orderId}`).get();
        if (!snap.exists) notFound('Order not found.');
        scope(snap.data() as OrderDoc);
        return cancelOrder(orderId, note, ctx.uid, actorLabel(actor));
      })()
    : await transitionOrder(orderId, status as OrderStatus, { actor: actorLabel(actor), byUid: ctx.uid, note, force: actor.kind === 'admin' && !!d.force, check: (o) => scope(o) });
  return { order: publicOrder(o) };
});

export const assignDeliveryBoy = authed<{ order_id?: string; delivery_boy_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'order.update');
  if (actor.kind === 'store') {
    const riderZone = (await db.doc(`delivery_boys/${str(d.delivery_boy_id, 'delivery_boy_id', { required: true, max: 128 })}`).get()).get('zone_id') ?? null;
    if (!riderZone || riderZone !== (await storeZoneId(actor.storeId))) denied('This delivery boy does not serve the zone of your store.');
  }
  await assignSvc(str(d.order_id, 'order_id', { required: true, max: 128 }), str(d.delivery_boy_id, 'delivery_boy_id', { required: true, max: 128 }), ctx.uid, actor.kind === 'store' ? actor.storeId : null);
  return { message: 'Delivery boy assigned' };
});

/** Self-pickup handover: store verifies the customer's OTP and completes the order. */
export const verifyPickupOtp = authed<{ order_id?: string; otp?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'order.update');
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const otp = str(d.otp, 'otp', { required: true, max: 10 });
  const o = await withOtpAttempts(orderId, () => transitionOrder(orderId, 'delivered', {
    actor: actorLabel(actor), byUid: ctx.uid, note: 'Picked up by customer (OTP verified)', force: true,
    check: async (order, tx) => {
      assertScope(actor, order.store_id, 'This order belongs to another store.');
      if (['delivered', 'cancelled', 'returned', 'payment_pending'].includes(order.status)) precondition('This order cannot be handed over.');
      const s = await tx.get(db.doc(`orders/${orderId}/secret/otp`));
      if (String(s.get('delivery_otp') ?? '') !== otp) invalid('Invalid pickup OTP.', { field: 'otp' });
    },
  }));
  return { order: publicOrder(o), message: 'Order handed over' };
});

/** `refund_method` ('wallet' | 'original', optional): stored on the return; 'original' completes the refund without a wallet credit (gateway refund done outside). */
export const processReturn = authed<{ return_id?: string; action?: string; remark?: string; delivery_boy_id?: string; refund_amount?: number; refund_method?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'return.update');
  const action = oneOf(d.action, 'action', Object.keys(RETURN_STATUSES) as ReturnStatus[]);
  const refund = d.refund_amount === undefined || d.refund_amount === null ? null : numIn(d.refund_amount, 'refund_amount', { min: 0 });
  const refundMethod = d.refund_method === undefined || d.refund_method === null || d.refund_method === '' ? null : oneOf(d.refund_method, 'refund_method', ['wallet', 'original'] as const);
  const rr = await updateReturn(str(d.return_id, 'return_id', { required: true, max: 128 }), action, {
    remark: str(d.remark, 'remark', { max: 500 }) || null, deliveryBoyId: str(d.delivery_boy_id, 'delivery_boy_id', { max: 128 }) || null,
    refundAmount: refund, refundMethod, storeScope: actor.kind === 'store' ? actor.storeId : null, byUid: ctx.uid,
  });
  return { id: rr.id, status: rr.status, refund_amount: rr.refund_amount, refund_method: rr.refund_method ?? 'wallet' };
});

/** Laravel OrderController@updatePayment: set payment_status (+ transaction id) with a timeline note. No status side-effects. */
export const updatePaymentStatus = authed<{ order_id?: string; payment_status?: string; transaction_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'order.update');
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const paymentStatus = oneOf(d.payment_status, 'payment_status', ['pending', 'paid', 'failed', 'refunded'] as const);
  const txnId = str(d.transaction_id, 'transaction_id', { max: 191 }) || null;
  const o = await db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${orderId}`);
    const s = await tx.get(ref);
    if (!s.exists) notFound('Order not found.');
    const order = { id: s.id, ...(s.data() as OrderDoc) };
    assertScope(actor, order.store_id, 'This order belongs to another store.');
    // Marking an online order paid/refunded drives wallet refunds on cancellation — store users may only settle COD orders.
    if (actor.kind === 'store' && order.payment_method !== 'cod' && order.payment_status !== paymentStatus) {
      denied('Only the admin can change the payment status of online / wallet payments.');
    }
    const label = { pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' }[paymentStatus];
    const upd: Record<string, unknown> = {
      payment_status: paymentStatus, updated_at: now(),
      timeline: FieldValue.arrayUnion(timelineEntry(order.status, ctx.uid, `Payment status set to ${label}`)),
    };
    if (txnId) upd.transaction_id = txnId;
    tx.update(ref, upd);
    return { ...order, payment_status: paymentStatus, transaction_id: txnId ?? order.transaction_id } as OrderDoc & { id: string };
  });
  return { order: publicOrder(o), message: 'Payment status updated.' };
});

/**
 * Admin-only hard delete (Laravel OrderController@destroy; store users are refused) of a `cancelled` or `payment_pending`
 * order. A payment_pending order is cancelled first (restock, wallet refund, promo release). The order (+ secret/otp) is
 * deleted and an audit copy written to `deleted_orders/{id}` (functions-only); onOrderWritten subtracts its stats_daily /
 * counter contribution, so dashboards match Laravel (soft-deleted orders were excluded there).
 */
export const deleteOrder = authed<{ order_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'order.delete');
  if (actor.kind === 'store') denied('Only the admin can delete orders.');
  const orderId = str(d.order_id, 'order_id', { required: true, max: 128 });
  const ref = db.doc(`orders/${orderId}`);
  let snap = await ref.get();
  if (!snap.exists) notFound('Order not found.');
  const status = snap.get('status') as OrderStatus;
  if (!['cancelled', 'payment_pending'].includes(status)) precondition('Only cancelled or payment pending orders can be deleted.');
  if (status === 'payment_pending') {
    await transitionOrder(orderId, 'cancelled', { actor: 'admin', byUid: ctx.uid, note: 'Deleted by admin', force: true });
    snap = await ref.get();
  }
  const otp = await db.doc(`orders/${orderId}/secret/otp`).get();
  const batch = db.batch();
  batch.set(db.doc(`deleted_orders/${orderId}`), { ...snap.data(), deleted_at: now(), deleted_by: ctx.uid });
  if (otp.exists) batch.delete(otp.ref);
  batch.delete(ref);
  await batch.commit();
  return { order_id: orderId, deleted: true };
});

/** Admin-only (Laravel ReturnRequestController@destroy) delete of a `pending` or `rejected` return; the order item is restored. */
export const deleteReturn = authed<{ return_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'return.update'); // Role::MODULES has no return.delete
  if (actor.kind === 'store') denied('Only the admin can delete return requests.');
  const id = str(d.return_id, 'return_id', { required: true, max: 128 });
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`return_requests/${id}`);
    const s = await tx.get(ref);
    if (!s.exists) notFound('Return request not found.');
    const rr = s.data() as ReturnRequestDoc;
    if (!['pending', 'rejected'].includes(rr.status)) precondition('Only pending or rejected return requests can be deleted.');
    const orderRef = db.doc(`orders/${rr.order_id}`);
    const os = await tx.get(orderRef);
    if (os.exists) {
      const items = ((os.get('items') as OrderDoc['items']) ?? []).map((i) => (String(i.variant_id) === String(rr.item_variant_id)
        ? { ...i, status: (i.status === 'return_requested' ? 'delivered' : i.status) as typeof i.status, return_status: null }
        : i));
      tx.update(orderRef, { items, updated_at: now() });
    }
    tx.delete(ref);
  });
  return { id, deleted: true };
});

/** Chat started by panel staff (Laravel ChatController@start): reuses the user's chat for the same order (or the general one). */
export const startChat = authed<{ user_id?: string; order_id?: string; subject?: string; message?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'chat.reply');
  const userId = str(d.user_id, 'user_id', { required: true, max: 128 });
  const orderId = str(d.order_id, 'order_id', { max: 128 }) || null;
  const subject = str(d.subject, 'subject', { max: 200 }) || null;
  const message = str(d.message, 'message', { max: 4000 }) || null;
  const u = await db.doc(`users/${userId}`).get();
  if (!u.exists) notFound('User not found.');
  const userType = u.get('type') === 'delivery_boy' ? 'delivery_boy' : 'customer';
  if (!['customer', 'delivery_boy'].includes(String(u.get('type') ?? 'customer'))) invalid('Chats can only be started with customers or delivery partners.', { field: 'user_id' });
  let order: (OrderDoc & { id: string }) | null = null;
  if (orderId) {
    const o = await db.doc(`orders/${orderId}`).get();
    if (!o.exists) notFound('Order not found.');
    order = { id: o.id, ...(o.data() as OrderDoc) };
    if (order.user_id !== userId && order.delivery_boy_id !== userId) invalid('This order does not belong to the selected user.', { field: 'order_id' });
  }
  if (actor.kind === 'store' && (!order || order.store_id !== actor.storeId)) denied('Store chats must be linked to one of your orders.');
  const existing = await db.collection('chats').where('user_uid', '==', userId).where('order_id', '==', orderId).get();
  const latest = existing.docs.sort((a, b) => (b.get('created_at')?.toMillis?.() ?? 0) - (a.get('created_at')?.toMillis?.() ?? 0))[0];
  let chatId: string;
  let created = false;
  if (latest) {
    chatId = latest.id;
    if (latest.get('status') !== 'open') await latest.ref.update({ status: 'open', updated_at: now() });
  } else {
    const ref = db.collection('chats').doc();
    chatId = ref.id;
    created = true;
    await ref.set({
      user_id: userId, user_uid: userId, user_type: userType, user_name: u.get('name') ?? null,
      order_id: orderId, order_number: order?.order_number ?? null, store_id: order?.store_id ?? null,
      subject: subject || (order ? `Order ${order.order_number}` : 'Support'), status: 'open',
      last_message: null, last_message_at: now(), unread_admin: 0, unread_user: 0, started_by: ctx.uid, created_at: now(), updated_at: now(),
    });
  }
  if (message) {
    let senderName = 'QwikMart Support';
    if (actor.kind === 'store') senderName = String((await db.doc(`stores/${actor.storeId}`).get()).get('name') ?? 'Store');
    else senderName = String((await db.doc(`users/${ctx.uid}`).get()).get('name') ?? senderName);
    await db.collection(`chats/${chatId}/messages`).add({
      user_uid: userId, sender_id: ctx.uid, sender_type: actor.kind === 'store' ? 'store' : 'admin', sender_name: senderName,
      message, attachment: null, read_at: null, created_at: now(),
    });
  }
  return { chat_id: chatId, created };
});

/* ================================================================== people */
const PANEL_TYPES = ['admin', 'staff', 'store'] as const;

function permFor(type: UserType, action: 'create' | 'update' | 'delete' | 'list'): string {
  if (type === 'customer') return `customer.${action === 'create' ? 'update' : action}`;
  if (type === 'delivery_boy') return `delivery_boy.${action}`;
  return `staff.${action}`;
}

async function targetUser(uid: string): Promise<UserDoc & { id: string }> {
  const s = await db.doc(`users/${uid}`).get();
  if (!s.exists) notFound('User not found.');
  return { id: s.id, ...(s.data() as UserDoc) };
}

async function guardTarget(ctx: Ctx, target: UserDoc & { id: string }, action: 'update' | 'delete'): Promise<PanelActor> {
  const actor = await requirePanel(ctx, permFor(target.type, action));
  if (target.type === 'admin' && actor.kind !== 'admin') denied();
  if (actor.kind === 'store' && !(target.type === 'store' && target.store_id === actor.storeId)) denied('You can only manage users of your store.');
  // store staff (with a store role) cannot manage the store owner (no role_id) — e.g. reset the owner's password
  if (actor.kind === 'store' && actor.permissions !== '*' && !target.role_id) denied('Only the store owner can manage this account.');
  if (target.id === ctx.uid && action === 'delete') precondition('You cannot delete your own account here.');
  return actor;
}

export const createPanelUser = authed<{ type?: string; name?: string; email?: string; password?: string; phone?: string; store_id?: string; role_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'staff.create');
  let type = oneOf(d.type, 'type', PANEL_TYPES);
  if (type === 'admin' && actor.kind !== 'admin') denied('Only admins can create admin users.');
  const name = str(d.name, 'name', { required: true, max: 100 });
  const email = str(d.email, 'email', { required: true, max: 150 }).toLowerCase();
  const password = str(d.password, 'password', { required: true, max: 100 });
  if (password.length < 6) invalid('The password must be at least 6 characters.', { field: 'password' });
  const phone = str(d.phone, 'phone', { max: 20 }) || null;
  let storeId = str(d.store_id, 'store_id', { max: 128 }) || null;
  const roleId = str(d.role_id, 'role_id', { max: 128 }) || null;
  if (actor.kind === 'store') {
    if (type !== 'store') denied('Store users can only create store staff.');
    storeId = actor.storeId;
    if (actor.permissions !== '*' && !roleId) denied('Store staff must be given a role.');
  }
  // 'staff' bound to a store is store staff: role 'store' (store-scoped permissions), never platform staff
  if (type === 'staff' && storeId) type = 'store';
  if (type === 'store') {
    if (!storeId) invalid('The store field is required for store users.', { field: 'store_id' });
    if (!(await db.doc(`stores/${storeId}`).get()).exists) notFound('Store not found.');
  }
  if (roleId) {
    const r = await db.doc(`roles/${roleId}`).get();
    if (!r.exists) notFound('Role not found.');
    if (type === 'store' && r.get('store_id') && r.get('store_id') !== storeId) invalid('This role belongs to another store.');
    if (actor.kind === 'store' && r.get('store_id') !== storeId) invalid('Pick one of your store roles.');
    if (type === 'staff' && (r.get('scope') === 'store' || r.get('store_id'))) invalid('Store roles can only be given to store users.');
  }
  let rec;
  try {
    rec = await auth.createUser({ email, password, displayName: name, ...(phone && phone.startsWith('+') ? { phoneNumber: phone } : {}) });
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-exists')) invalid('The email has already been taken.', { field: 'email' });
    if (code.includes('phone-number-already-exists')) invalid('The phone has already been taken.', { field: 'phone' });
    throw e;
  }
  await db.doc(`users/${rec.uid}`).set({
    type, name, email, phone, avatar: null, store_id: type === 'store' ? storeId : null, role_id: roleId, referral_code: await uniqueReferralCode(), referred_by: null,
    wallet_balance: 0, orders_count: 0, total_spent: 0, fcm_tokens: [], status: 'active', language: 'en',
    search_keywords: searchKeywords(name, email, phone ?? ''), created_by: ctx.uid, created_at: now(), updated_at: now(),
  });
  if (type === 'store' && storeId && !roleId) {
    const st = await db.doc(`stores/${storeId}`).get();
    if (!st.get('owner_uid')) await st.ref.update({ owner_uid: rec.uid });
  }
  const claims = await syncClaims(rec.uid);
  return { uid: rec.uid, claims };
});

export const updatePanelUser = authed<{ uid?: string; name?: string; email?: string; phone?: string; password?: string; role_id?: string | null; store_id?: string | null }>(async (d, ctx) => {
  const uid = str(d.uid, 'uid', { required: true, max: 128 });
  const target = await targetUser(uid);
  const actor = await guardTarget(ctx, target, 'update');
  const upd: Record<string, unknown> = { updated_at: now() };
  const authUpd: Record<string, unknown> = {};
  if (d.name !== undefined) { upd.name = str(d.name, 'name', { required: true, max: 100 }); authUpd.displayName = upd.name; }
  if (d.email !== undefined) { upd.email = str(d.email, 'email', { required: true, max: 150 }).toLowerCase(); authUpd.email = upd.email; }
  if (d.phone !== undefined) { upd.phone = str(d.phone, 'phone', { max: 20 }) || null; if (upd.phone && String(upd.phone).startsWith('+')) authUpd.phoneNumber = upd.phone; }
  if (d.password) {
    const pw = str(d.password, 'password', { max: 100 });
    if (pw.length < 6) invalid('The password must be at least 6 characters.', { field: 'password' });
    authUpd.password = pw;
  }
  if (d.role_id !== undefined && ['staff', 'store'].includes(target.type)) {
    upd.role_id = str(d.role_id, 'role_id', { max: 128 }) || null;
    if (actor.kind === 'store') {
      if (!upd.role_id && actor.permissions !== '*') denied('Only the store owner can grant full store access.');
      if (upd.role_id && (await db.doc(`roles/${upd.role_id}`).get()).get('store_id') !== actor.storeId) invalid('Pick one of your store roles.');
    }
  }
  if (d.store_id !== undefined && target.type === 'staff' && (str(d.store_id, 'store_id', { max: 128 }) || null)) {
    if (actor.kind === 'store') denied('You cannot move users to another store.');
    upd.type = 'store';
    upd.store_id = str(d.store_id, 'store_id', { max: 128 });
  }
  if (d.store_id !== undefined && target.type === 'store') {
    if (actor.kind === 'store') denied('You cannot move users to another store.');
    upd.store_id = str(d.store_id, 'store_id', { max: 128 }) || null;
  }
  if (Object.keys(authUpd).length) {
    try { await auth.updateUser(uid, authUpd); } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code.includes('email-already-exists')) invalid('The email has already been taken.', { field: 'email' });
      throw e;
    }
  }
  const merged = { ...target, ...upd } as UserDoc;
  upd.search_keywords = searchKeywords(merged.name, merged.email ?? '', merged.phone ?? '');
  await db.doc(`users/${uid}`).update(upd);
  if (target.type === 'delivery_boy' && (upd.name || upd.phone || upd.email)) {
    await db.doc(`delivery_boys/${uid}`).set({ ...(upd.name ? { name: upd.name } : {}), ...(upd.phone !== undefined ? { phone: upd.phone } : {}), ...(upd.email ? { email: upd.email } : {}) }, { merge: true });
  }
  const claims = await syncClaims(uid);
  return { uid, claims };
});

export const setUserStatus = authed<{ uid?: string; active?: boolean }>(async (d, ctx) => {
  const uid = str(d.uid, 'uid', { required: true, max: 128 });
  const target = await targetUser(uid);
  await guardTarget(ctx, target, 'update');
  const active = !!d.active;
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).update({ status: active ? 'active' : 'inactive', updated_at: now() });
  if (target.type === 'delivery_boy') await db.doc(`delivery_boys/${uid}`).set({ status: active ? 'active' : 'inactive', ...(active ? {} : { is_online: false }) }, { merge: true });
  return { uid, status: active ? 'active' : 'inactive' };
});

export const deleteUser = authed<{ uid?: string }>(async (d, ctx) => {
  const uid = str(d.uid, 'uid', { required: true, max: 128 });
  const target = await targetUser(uid);
  await guardTarget(ctx, target, 'delete');
  await auth.deleteUser(uid).catch((e) => logger.warn('auth delete failed', String(e)));
  await db.doc(`users/${uid}`).set({ status: 'deleted', fcm_tokens: [], deleted_at: now(), deleted_by: ctx.uid, updated_at: now() }, { merge: true });
  if (target.type === 'delivery_boy') await db.doc(`delivery_boys/${uid}`).set({ status: 'inactive', is_online: false }, { merge: true });
  return { uid, deleted: true };
});

export const approveDeliveryBoy = authed<{ uid?: string; approve?: boolean; remark?: string }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'delivery_boy.update'));
  const uid = str(d.uid, 'uid', { required: true, max: 128 });
  const ref = db.doc(`delivery_boys/${uid}`);
  const b = await ref.get();
  if (!b.exists) notFound('Delivery boy not found.');
  const approve = !!d.approve;
  await ref.update({ approval_status: approve ? 'approved' : 'rejected', approval_remark: str(d.remark, 'remark', { max: 500 }) || null, approved_at: approve ? now() : null, ...(approve ? {} : { is_online: false }) });
  const claims = await syncClaims(uid);
  await notifyUser(uid, approve ? 'Account approved' : 'Application rejected', approve ? 'You can now go online and start accepting orders.' : `Your application was rejected.${d.remark ? ` ${d.remark}` : ''}`, { type: 'account' });
  return { uid, approval_status: approve ? 'approved' : 'rejected', claims };
});

export const createDeliveryBoy = authed<Record<string, unknown>>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'delivery_boy.create'));
  const name = str(d.name, 'name', { required: true, max: 100 });
  const email = str(d.email, 'email', { required: true, max: 150 }).toLowerCase();
  const password = str(d.password, 'password', { required: true, max: 100 });
  if (password.length < 6) invalid('The password must be at least 6 characters.', { field: 'password' });
  const phone = str(d.phone, 'phone', { max: 20 }) || null;
  const zoneId = str(d.zone_id, 'zone_id', { required: true, max: 128 });
  const zone = await db.doc(`zones/${zoneId}`).get();
  if (!zone.exists) notFound('Zone not found.');
  let rec;
  try {
    rec = await auth.createUser({ email, password, displayName: name, ...(phone && phone.startsWith('+') ? { phoneNumber: phone } : {}) });
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-exists')) invalid('The email has already been taken.', { field: 'email' });
    if (code.includes('phone-number-already-exists')) invalid('The phone has already been taken.', { field: 'phone' });
    throw e;
  }
  const bank = (d.bank && typeof d.bank === 'object' ? d.bank : {}) as Record<string, unknown>;
  const boy: Partial<DeliveryBoyDoc> & Record<string, unknown> = {
    zone_id: zoneId, country_id: str(d.country_id, 'country_id', { max: 128 }) || zone.get('country_id') || null, dob: str(d.dob, 'dob', { max: 20 }) || null,
    address: str(d.address, 'address', { max: 500 }) || null, vehicle_type: str(d.vehicle_type, 'vehicle_type', { max: 30 }) || null,
    vehicle_number: str(d.vehicle_number, 'vehicle_number', { max: 30 }) || null, driving_license: str(d.driving_license, 'driving_license', { max: 500 }) || null,
    id_proof: str(d.id_proof, 'id_proof', { max: 500 }) || null, bank: { name: String(bank.name ?? ''), account: String(bank.account ?? ''), ifsc: String(bank.ifsc ?? '') },
    commission_type: oneOf(d.commission_type, 'commission_type', ['percent', 'fixed'] as const, 'percent'),
    commission_value: Number.isFinite(numIn(d.commission_value, 'commission_value', { min: 0 })) ? numIn(d.commission_value, 'commission_value', { min: 0 }) : 0,
    salary: Number.isFinite(numIn(d.salary, 'salary', { min: 0 })) ? numIn(d.salary, 'salary', { min: 0 }) : 0,
    cash_in_hand: 0, earnings_total: 0, rating_avg: 0, rating_count: 0, is_online: false, location: null, approval_status: 'approved', status: 'active',
    name, phone, email, created_at: now(),
  };
  await db.doc(`delivery_boys/${rec.uid}`).set(boy);
  await db.doc(`users/${rec.uid}`).set({
    type: 'delivery_boy', name, email, phone, avatar: null, referral_code: await uniqueReferralCode(), referred_by: null, wallet_balance: 0, orders_count: 0,
    total_spent: 0, fcm_tokens: [], status: 'active', language: 'en', search_keywords: searchKeywords(name, email, phone ?? ''), created_at: now(), updated_at: now(),
  });
  const claims = await syncClaims(rec.uid);
  return { uid: rec.uid, claims };
});

/* ================================================================== money */
export const walletAdjust = authed<{ uid?: string; type?: string; amount?: number; message?: string }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'wallet.update'));
  const uid = str(d.uid, 'uid', { required: true, max: 128 });
  const type = oneOf(d.type, 'type', ['credit', 'debit'] as const);
  const amount = money(numIn(d.amount, 'amount', { required: true, min: 0.01 }));
  const message = str(d.message, 'message', { max: 255 }) || (type === 'credit' ? 'Added by admin' : 'Deducted by admin');
  const balance = await db.runTransaction(async (tx) => {
    const l = new WalletLedger(tx);
    await l.load(uid);
    const b = type === 'credit' ? l.credit(uid, amount, 'admin', message) : l.debit(uid, amount, 'admin', message);
    l.commit();
    return b;
  });
  await notifyUser(uid, type === 'credit' ? 'Wallet credited' : 'Wallet debited', `${message} (${amount.toFixed(2)})`, { type: 'wallet' });
  return { uid, balance };
});

export const processWithdrawal = authed<{ id?: string; approve?: boolean; remark?: string; receipt_image?: string }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'withdrawal.update'));
  const id = str(d.id, 'id', { required: true, max: 128 });
  const approve = !!d.approve;
  const remark = str(d.remark, 'remark', { max: 500 }) || null;
  const receipt = str(d.receipt_image, 'receipt_image', { max: 500 }) || null;
  const out = await db.runTransaction(async (tx) => {
    const ref = db.doc(`withdrawal_requests/${id}`);
    const s = await tx.get(ref);
    if (!s.exists) notFound('Withdrawal request not found.');
    if (s.get('status') !== 'pending') precondition('This withdrawal request has already been processed.');
    const userId = String(s.get('user_id'));
    const amount = num(s.get('amount'));
    let l: WalletLedger | null = null;
    if (!approve) { l = new WalletLedger(tx); await l.load(userId); }
    if (l) { l.credit(userId, amount, 'refund', `Withdrawal rejected${remark ? `: ${remark}` : ''}`, null, null, `withdraw_refund_${id}`); l.commit(); }
    tx.update(ref, { status: approve ? 'approved' : 'rejected', remark, receipt_image: receipt ?? s.get('receipt_image') ?? null, processed_at: now(), processed_by: ctx.uid });
    return { userId, amount };
  });
  await notifyUser(out.userId, approve ? 'Withdrawal approved' : 'Withdrawal rejected', approve ? `Your withdrawal of ${out.amount.toFixed(2)} has been processed.` : `Your withdrawal was rejected and ${out.amount.toFixed(2)} was returned to your wallet.`, { type: 'wallet' });
  return { id, status: approve ? 'approved' : 'rejected' };
});

/** Laravel WithdrawalController@update on an already processed request: only remark / receipt change. */
export const updateWithdrawal = authed<{ id?: string; remark?: string | null; receipt_image?: string | null }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'withdrawal.update'));
  const id = str(d.id, 'id', { required: true, max: 128 });
  const ref = db.doc(`withdrawal_requests/${id}`);
  const s = await ref.get();
  if (!s.exists) notFound('Withdrawal request not found.');
  if (s.get('status') === 'pending') precondition('Approve or reject the request first (processWithdrawal).');
  const upd: Record<string, unknown> = { updated_at: now(), updated_by: ctx.uid };
  if (d.remark !== undefined) upd.remark = str(d.remark, 'remark', { max: 500 }) || null;
  if (d.receipt_image !== undefined) upd.receipt_image = str(d.receipt_image, 'receipt_image', { max: 500 }) || null;
  await ref.update(upd);
  return { id, status: s.get('status'), remark: upd.remark ?? s.get('remark') ?? null, receipt_image: upd.receipt_image ?? s.get('receipt_image') ?? null };
});

export const collectCash = authed<{ delivery_boy_id?: string; amount?: number; message?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'delivery_boy.update');
  const uid = str(d.delivery_boy_id, 'delivery_boy_id', { required: true, max: 128 });
  const amount = money(numIn(d.amount, 'amount', { required: true, min: 0.01 }));
  const message = str(d.message, 'message', { max: 255 }) || 'Cash submitted to admin';
  const zoneScope = actor.kind === 'store' ? (await storeZoneId(actor.storeId)) ?? '__none__' : null;
  // cash_collections.store_id: the collecting store, else the store of the rider's zone (zone default store)
  let cashStore: string | null = actor.kind === 'store' ? actor.storeId : null;
  if (!cashStore) {
    const riderZone = (await db.doc(`delivery_boys/${uid}`).get()).get('zone_id') as string | undefined;
    cashStore = riderZone ? (((await db.doc(`zones/${riderZone}`).get()).get('default_store_id') as string | undefined) ?? null) : null;
  }
  const cash = await db.runTransaction(async (tx) => {
    const ref = db.doc(`delivery_boys/${uid}`);
    const b = await tx.get(ref);
    if (!b.exists) notFound('Delivery boy not found.');
    if (zoneScope && b.get('zone_id') !== zoneScope) denied('This delivery boy does not serve the zone of your store.');
    const inHand = num(b.get('cash_in_hand'));
    if (amount > inHand + 0.001) precondition(`Amount exceeds cash in hand (${inHand.toFixed(2)}).`);
    tx.update(ref, { cash_in_hand: money(inHand - amount) });
    tx.set(db.collection('cash_collections').doc(), { delivery_boy_id: uid, order_id: null, store_id: cashStore, amount, type: 'submitted_to_admin', message, collected_by: ctx.uid, created_at: now() });
    return money(inHand - amount);
  });
  return { delivery_boy_id: uid, cash_in_hand: cash };
});

/** type=bonus|salary adds an entry (amount required); type=pending pays every pending earning. Credits the wallet unless credit_wallet=false. */
export const payEarnings = authed<{ delivery_boy_id?: string; amount?: number; type?: string; message?: string; credit_wallet?: boolean }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'delivery_boy.update'));
  const uid = str(d.delivery_boy_id, 'delivery_boy_id', { required: true, max: 128 });
  const type = oneOf(d.type, 'type', ['bonus', 'salary', 'pending', 'commission'] as const);
  const note = str(d.message, 'message', { max: 200 }) || null;
  const credit = d.credit_wallet !== false;
  if (!(await db.doc(`delivery_boys/${uid}`).get()).exists) notFound('Delivery boy not found.');
  if (type === 'bonus' || type === 'salary' || (type === 'commission' && d.amount !== undefined && d.amount !== null)) {
    const amount = money(numIn(d.amount, 'amount', { required: true, min: 0.01 }));
    await db.runTransaction(async (tx) => {
      const l = credit ? new WalletLedger(tx) : null;
      if (l) await l.load(uid);
      tx.set(db.collection('delivery_earnings').doc(), { delivery_boy_id: uid, order_id: null, amount, type, status: credit ? 'paid' : 'pending', message: note, created_at: now() });
      tx.update(db.doc(`delivery_boys/${uid}`), { earnings_total: FieldValue.increment(amount) });
      if (l) { l.credit(uid, amount, 'admin', `${type[0].toUpperCase()}${type.slice(1)} credited${note ? `: ${note}` : ''}`); l.commit(); }
    });
    return { paid: amount, entries: 1 };
  }
  const pending = await db.collection('delivery_earnings').where('delivery_boy_id', '==', uid).where('status', '==', 'pending').get();
  const amount = money(pending.docs.reduce((s, x) => s + num(x.get('amount')), 0));
  if (amount <= 0) precondition('No pending earnings to pay.');
  await db.runTransaction(async (tx) => {
    const l = credit ? new WalletLedger(tx) : null;
    if (l) await l.load(uid);
    pending.docs.forEach((x) => tx.update(x.ref, { status: 'paid', paid_at: now() }));
    if (l) { l.credit(uid, amount, 'admin', `Earnings payout (${pending.size} entries)${note ? `: ${note}` : ''}`); l.commit(); }
  });
  return { paid: amount, entries: pending.size };
});

/* ================================================================== content */
/**
 * Drafts live in `home_layout_drafts/{id}` (panel-only); `home_layouts/{id}` (public) holds only published data.
 * Publishing copies the draft's sections + header into home_layouts/{id} (full rewrite, so legacy `draft_sections` on the
 * public doc is dropped). Falls back to a legacy `home_layouts.draft_sections` when no draft doc exists yet.
 */
export const publishHomeLayout = authed<{ layout_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'home_builder.update');
  const id = str(d.layout_id, 'layout_id', { required: true, max: 200 });
  const ref = db.doc(`home_layouts/${id}`);
  const [draftSnap, pubSnap] = await Promise.all([db.doc(`home_layout_drafts/${id}`).get(), ref.get()]);
  if (!draftSnap.exists && !pubSnap.exists) notFound('Layout not found.');
  const draft = draftSnap.exists ? (draftSnap.data() as HomeLayoutDraftDoc) : null;
  const pub = pubSnap.exists ? (pubSnap.data() as HomeLayoutDoc) : null;
  const zoneId = draft?.zone_id ?? pub!.zone_id;
  if (actor.kind === 'store') {
    const store = await db.doc(`stores/${actor.storeId}`).get();
    if (store.get('zone_id') !== zoneId || (pub && pub.zone_id !== zoneId)) denied('This layout belongs to another zone.');
  }
  const sections = draft ? draft.draft_sections ?? [] : pub?.draft_sections ?? pub?.published_sections ?? [];
  const mode = draft?.mode ?? pub!.mode;
  const categoryId = draft?.category_id ?? pub?.category_id ?? null;
  const header = draft?.header ?? pub?.header ?? null;
  const storeId = draft?.store_id ?? pub?.store_id ?? null;
  await ref.set({
    zone_id: zoneId, mode, category_id: categoryId, header, published_sections: sections, is_published: true,
    published_at: now(), published_by: ctx.uid, store_id: storeId,
    created_at: (pub as Record<string, unknown> | null)?.created_at ?? now(), updated_at: now(),
  });
  // layouts that only had the legacy field get a draft doc so the builder keeps working
  if (!draft && pub) {
    await db.doc(`home_layout_drafts/${id}`).set({ zone_id: zoneId, mode, category_id: categoryId, header, draft_sections: sections, store_id: storeId, updated_at: now(), updated_by: ctx.uid });
  }
  clearCache('home/');
  return { layout_id: id, published: true };
});

/** Hydrates `sections`, or — when omitted — the stored draft of `layout_id` (home_layout_drafts, legacy fallback home_layouts.draft_sections). */
export const previewHomeSections = authed<{ zone_id?: string; mode?: Mode; sections?: unknown[]; lang?: string; layout_id?: string }>(async (d, ctx) => {
  await requirePanel(ctx, 'home_builder.list', 'home_builder.update');
  let sections = d.sections as unknown[] | undefined;
  let zoneId = str(d.zone_id, 'zone_id', { max: 128 }) || null;
  let mode = oneOf(d.mode, 'mode', ['quick', 'ecommerce'] as const, 'quick');
  if (!Array.isArray(sections) && d.layout_id) {
    const id = str(d.layout_id, 'layout_id', { max: 200 });
    const dr = await db.doc(`home_layout_drafts/${id}`).get();
    const src = dr.exists ? dr.data() : (await db.doc(`home_layouts/${id}`).get()).data();
    if (!src) notFound('Layout not found.');
    sections = (src!.draft_sections ?? src!.published_sections ?? []) as unknown[];
    zoneId = zoneId ?? (src!.zone_id as string) ?? null;
    if (!d.mode && src!.mode) mode = src!.mode as Mode;
  }
  const hctx = await makeCtx(zoneId, mode, str(d.lang, 'lang', { max: 10 }) || 'en');
  if (!Array.isArray(sections)) invalid('The sections field must be an array.');
  return { sections: await hydrateSections(sections as never, hctx) };
});

/* ---------------- bulk import */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const toCsv = (rows: unknown[][]) => rows.map((r) => r.map((v) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n');

export const bulkImportProducts = authed<{ csv_path?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'product.create');
  const path = str(d.csv_path, 'csv_path', { required: true, max: 500 });
  if (!path.startsWith('imports/') || path.includes('..')) invalid('Upload the CSV to the imports/ folder first.');
  if (actor.kind === 'store' && !path.startsWith(`imports/${ctx.uid}/`)) denied('You can only import files you uploaded.');
  const [exists] = await bucket().file(path).exists();
  if (!exists) notFound('CSV file not found.');
  const [buf] = await bucket().file(path).download();
  const rows = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  if (rows.length < 2) invalid('The CSV file is empty.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], k: string) => { const i = header.indexOf(k); return i >= 0 ? (r[i] ?? '').trim() : ''; };
  if (!header.includes('name') || !header.includes('price') || !header.includes('category_id')) invalid('The CSV must contain name, price and category_id columns.');
  const errors: { row: number; message: string }[] = [];
  let created = 0;
  for (const [i, batchRows] of chunk(rows.slice(1), 200).entries()) {
    const batch = db.batch();
    batchRows.forEach((r, j) => {
      const rowNo = i * 200 + j + 2;
      const name = col(r, 'name');
      const price = Number(col(r, 'price'));
      if (!name || !Number.isFinite(price) || price <= 0) { errors.push({ row: rowNo, message: 'name and a positive price are required' }); return; }
      const sale = col(r, 'sale_price') ? Number(col(r, 'sale_price')) : null;
      const ref = db.collection('products').doc();
      const slug = (col(r, 'slug') || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + ref.id.slice(0, 5).toLowerCase();
      const nameI18n: Record<string, string> = { en: name };
      for (const l of ['ar', 'hi']) if (col(r, `name_${l}`)) nameI18n[l] = col(r, `name_${l}`);
      const images = col(r, 'images') ? col(r, 'images').split('|').map((x) => x.trim()).filter(Boolean) : [];
      batch.set(ref, {
        store_id: actor.kind === 'store' ? actor.storeId : col(r, 'store_id') || null, category_id: col(r, 'category_id'), sub_category_id: col(r, 'sub_category_id') || null,
        category_ids: [], brand_id: col(r, 'brand_id') || null, brand_name: null, name: nameI18n, slug,
        short_description: { en: col(r, 'short_description') }, description: { en: col(r, 'description') }, images, thumbnail: col(r, 'thumbnail') || images[0] || null,
        product_type: 'simple', tax_id: col(r, 'tax_id') || null, tax_percent: Number(col(r, 'tax_percent') || 0), is_veg: col(r, 'is_veg') ? ['1', 'true', 'yes'].includes(col(r, 'is_veg').toLowerCase()) : null,
        return_allowed: ['1', 'true', 'yes'].includes(col(r, 'return_allowed').toLowerCase()), return_days: Number(col(r, 'return_days') || 0), cancelable: col(r, 'cancelable') ? ['1', 'true', 'yes'].includes(col(r, 'cancelable').toLowerCase()) : true,
        cod_allowed: col(r, 'cod_allowed') ? ['1', 'true', 'yes'].includes(col(r, 'cod_allowed').toLowerCase()) : true, max_qty_per_order: Number(col(r, 'max_qty_per_order') || 0),
        fulfillment_type: ['quick', 'ecommerce', 'both'].includes(col(r, 'fulfillment_type')) ? col(r, 'fulfillment_type') : 'both', tags: col(r, 'tags') ? col(r, 'tags').split('|') : [],
        attributes: [], variants: [{ id: `${ref.id}-1`, name: col(r, 'variant_name') || 'Default', sku: col(r, 'sku') || null, attribute_value_ids: [], attrs: {}, price, sale_price: sale && sale > 0 ? sale : null, stock: Number(col(r, 'stock') || 0), low_stock_alert: 5, weight: null, image: null, status: true }],
        cross_sell_ids: [], up_sell_ids: [], rating_avg: 0, rating_count: 0, sold_count: 0, is_featured: false,
        status: actor.kind === 'store' ? 'pending_approval' : ['active', 'inactive', 'draft'].includes(col(r, 'status')) ? col(r, 'status') : 'active',
        created_at: now(), updated_at: now(), imported_from: path,
      });
      created++;
    });
    await batch.commit();
  }
  return { created, errors };
}, { memory: '1GiB', timeoutSeconds: 540 });

/* ---------------- reports */
export const exportReport = authed<{ type?: string; from?: string; to?: string; filters?: Record<string, unknown> }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'report.view');
  const type = oneOf(d.type, 'type', ['orders', 'sales', 'products', 'customers', 'returns'] as const);
  const from = str(d.from, 'from', { max: 10 }) || zonedParts(new Date(Date.now() - 30 * 86400_000)).date;
  const to = str(d.to, 'to', { max: 10 }) || zonedParts().date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) invalid('Dates must be in YYYY-MM-DD format.');
  const fromTs = Timestamp.fromDate(new Date(`${from}T00:00:00+05:30`));
  const toTs = Timestamp.fromDate(new Date(`${to}T23:59:59+05:30`));
  const f = d.filters ?? {};
  const storeId = actor.kind === 'store' ? actor.storeId : (f.store_id ? String(f.store_id) : null);
  let rows: unknown[][] = [];
  if (type === 'orders') {
    let q = db.collection('orders').where('created_at', '>=', fromTs).where('created_at', '<=', toTs);
    if (storeId) q = db.collection('orders').where('store_id', '==', storeId).where('created_at', '>=', fromTs).where('created_at', '<=', toTs);
    const s = await q.orderBy('created_at', 'desc').limit(10000).get();
    rows = [['order_number', 'date', 'customer', 'phone', 'mode', 'status', 'payment_method', 'payment_status', 'subtotal', 'delivery_charge', 'tax', 'promo_discount', 'wallet_used', 'total', 'grand_total']];
    for (const x of s.docs) {
      const o = x.data() as OrderDoc;
      if (f.status && o.status !== f.status) continue;
      if (f.zone_id && o.zone_id !== f.zone_id) continue;
      rows.push([o.order_number, o.created_at?.toDate().toISOString(), o.customer?.name, o.customer?.phone, o.mode, o.status, o.payment_method, o.payment_status,
        o.totals?.subtotal, o.totals?.delivery_charge, o.totals?.tax_amount, o.totals?.promo_discount, o.totals?.wallet_used, o.totals?.total, o.totals?.grand_total]);
    }
  } else if (type === 'sales') {
    const scope = storeId ? `store_${storeId}` : f.zone_id ? `zone_${f.zone_id}` : 'all';
    const s = await db.collection('stats_daily').where('scope', '==', scope).where('date', '>=', from).where('date', '<=', to).orderBy('date').get();
    rows = [['date', 'orders', 'revenue', 'delivery_charges', 'tax', 'units', 'cancelled', 'returned']];
    for (const x of s.docs) rows.push([x.get('date'), x.get('orders'), x.get('revenue'), x.get('delivery_charges'), x.get('tax'), x.get('units'), x.get('cancelled'), x.get('returned')]);
  } else if (type === 'products') {
    const q = storeId ? db.collection('products').where('store_id', '==', storeId) : db.collection('products');
    const s = await q.limit(10000).get();
    rows = [['id', 'name', 'status', 'category_id', 'brand', 'min_price', 'stock', 'sold_count', 'rating_avg']];
    for (const x of s.docs) {
      const p = x.data();
      rows.push([x.id, p.name?.en ?? '', p.status, p.category_id, p.brand_name ?? '', p.min_price ?? '', (p.variants ?? []).reduce((a: number, v: { stock?: number }) => a + num(v.stock), 0), p.sold_count ?? 0, p.rating_avg ?? 0]);
    }
  } else if (type === 'customers') {
    if (actor.kind === 'store') denied();
    const s = await db.collection('users').where('type', '==', 'customer').limit(10000).get();
    rows = [['id', 'name', 'email', 'phone', 'orders_count', 'total_spent', 'wallet_balance', 'status', 'created_at']];
    for (const x of s.docs) {
      const u = x.data();
      rows.push([x.id, u.name, u.email, u.phone, u.orders_count ?? 0, u.total_spent ?? 0, u.wallet_balance ?? 0, u.status, u.created_at?.toDate?.().toISOString() ?? '']);
    }
  } else {
    const q = storeId ? db.collection('return_requests').where('store_id', '==', storeId) : db.collection('return_requests');
    const s = await q.where('created_at', '>=', fromTs).where('created_at', '<=', toTs).get();
    rows = [['return_number', 'order_number', 'item', 'qty', 'reason', 'status', 'refund_amount', 'created_at']];
    for (const x of s.docs) {
      const r = x.data();
      rows.push([r.return_number, r.order_number, r.item_name, r.qty, r.reason, r.status, r.refund_amount, r.created_at?.toDate?.().toISOString() ?? '']);
    }
  }
  const path = `exports/${ctx.uid}/${type}-${from}-to-${to}-${Date.now()}.csv`;
  const url = await uploadAndLink(path, '﻿' + toCsv(rows), 'text/csv');
  return { url, path, rows: rows.length - 1 };
}, { memory: '1GiB', timeoutSeconds: 300 });

/* ---------------- notifications & email */
async function audience(target: string, userId?: string | null): Promise<{ id: string; tokens: string[]; email: string | null }[]> {
  if (target === 'user') {
    if (!userId) invalid('The user field is required for a single-user notification.', { field: 'user_id' });
    const s = await db.doc(`users/${userId}`).get();
    if (!s.exists) notFound('User not found.');
    return [{ id: s.id, tokens: (s.get('fcm_tokens') as string[]) ?? [], email: s.get('email') ?? null }];
  }
  let q: FirebaseFirestore.Query = db.collection('users').where('status', '==', 'active');
  if (target === 'customers') q = q.where('type', '==', 'customer');
  if (target === 'delivery_boys') q = q.where('type', '==', 'delivery_boy');
  if (target === 'staff') q = q.where('type', 'in', ['admin', 'staff', 'store']);
  const s = await q.get();
  return s.docs.map((x) => ({ id: x.id, tokens: (x.get('fcm_tokens') as string[]) ?? [], email: x.get('email') ?? null }));
}

/** Store users may only notify a single customer who ordered from their store; the log doc carries `store_id` (null for admin broadcasts). */
export const sendNotification = authed<{ title?: string; message?: string; type?: string; target?: string; user_id?: string; image?: string; link?: string; store_id?: string }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'notification.create');
  const title = str(d.title, 'title', { required: true, max: 150 });
  const message = str(d.message, 'message', { required: true, max: 1000 });
  const type = oneOf(d.type, 'type', ['default', 'order', 'promotion', 'product', 'category'] as const, 'default');
  const target = oneOf(d.target, 'target', ['all', 'customers', 'delivery_boys', 'user'] as const, 'all');
  const storeId = actor.kind === 'store' ? actor.storeId : null;
  if (storeId) {
    if (target !== 'user') denied('Store notifications can only be sent to a single customer.');
    const uid = str(d.user_id, 'user_id', { required: true, max: 128 });
    const ordered = await db.collection('orders').where('user_id', '==', uid).where('store_id', '==', storeId).limit(1).get();
    if (ordered.empty) denied('You can only notify customers who ordered from your store.');
  }
  const image = str(d.image, 'image', { max: 500 }) || null;
  const link = str(d.link, 'link', { max: 500 }) || null;
  const users = await audience(target, str(d.user_id, 'user_id', { max: 128 }) || null);
  for (const part of chunk(users, 400)) {
    const b = db.batch();
    part.forEach((u) => b.set(db.collection(`users/${u.id}/notifications`).doc(), { title, message, type, data: { link }, image, read_at: null, created_at: now() }));
    await b.commit();
  }
  const owners = new Map<string, string>();
  users.forEach((u) => u.tokens.forEach((t) => owners.set(t, u.id)));
  const sent = await pushToTokens(owners, title, message, { type, link }, image);
  const log = await db.collection('notifications').add({ title, message, type, link, image, target, user_id: d.user_id ?? null, user_name: target === 'user' ? (await db.doc(`users/${d.user_id}`).get()).get('name') ?? null : null, store_id: storeId, sent_at: now(), sent_count: users.length, push_count: sent, created_by: ctx.uid });
  return { id: log.id, recipients: users.length, pushed: sent };
});

/**
 * segment: all | customers | delivery_boys | staff | stores (store users) | specific (`user_ids`, max 500).
 * Store users: `customers` = customers who ordered from their store; `specific` = only such customers; nothing else.
 */
export const sendBulkEmail = authed<{ subject?: string; body?: string; segment?: string; user_ids?: string[] }>(async (d, ctx) => {
  const actor = await requirePanel(ctx, 'email.create');
  const subject = str(d.subject, 'subject', { required: true, max: 200 });
  const body = str(d.body, 'body', { required: true, max: 100_000 });
  const segment = oneOf(d.segment, 'segment', ['all', 'customers', 'delivery_boys', 'staff', 'stores', 'specific'] as const, 'customers');
  const picked = Array.isArray(d.user_ids) ? [...new Set(d.user_ids.map((x) => String(x)).filter(Boolean))].slice(0, 500) : [];
  if (segment === 'specific' && !picked.length) invalid('Pick at least one recipient.', { field: 'user_ids' });
  let storeCustomers: Set<string> | null = null;
  if (actor.kind === 'store') {
    if (segment !== 'customers' && segment !== 'specific') denied('Store emails can only be sent to your own customers.');
    const s = await db.collection('orders').where('store_id', '==', actor.storeId).select('user_id').get();
    storeCustomers = new Set(s.docs.map((x) => String(x.get('user_id') ?? '')).filter(Boolean));
  }
  let list: { id: string; tokens: string[]; email: string | null }[];
  if (segment === 'specific' || storeCustomers) {
    const ids = segment === 'specific' ? picked.filter((id) => !storeCustomers || storeCustomers.has(id)) : [...storeCustomers!];
    list = [];
    for (const part of chunk(ids, 300)) {
      const snaps = part.length ? await db.getAll(...part.map((id) => db.doc(`users/${id}`))) : [];
      for (const x of snaps) if (x.exists && x.get('status') !== 'deleted' && x.get('status') !== 'inactive') list.push({ id: x.id, tokens: [], email: x.get('email') ?? null });
    }
  } else if (segment === 'stores') {
    const s = await db.collection('users').where('status', '==', 'active').where('type', '==', 'store').get();
    list = s.docs.map((x) => ({ id: x.id, tokens: [], email: x.get('email') ?? null }));
  } else {
    list = await audience(segment);
  }
  const emails = [...new Set(list.map((u) => u.email).filter((e): e is string => !!e))].slice(0, MAX_BULK_EMAILS);
  if (!emails.length) return { queued: 0, sent: 0, failed: 0, total: 0, message: 'No recipients with an email address.' };
  if (!(await smtpTransport())) precondition('Emails could not be sent. Check the SMTP settings.');
  // Queue the work (onMailQueued sends each job with limited concurrency) and return immediately.
  const jobs = chunk(emails, MAIL_JOB_SIZE);
  for (const part of chunk(jobs, 400)) {
    const b = db.batch();
    part.forEach((to) => b.set(db.collection('mail_queue').doc(), {
      to, subject, body, template: 'bulk', segment, store_id: actor.storeId ?? null, status: 'pending', sent: 0, failed: 0, created_by: ctx.uid, created_at: now(),
    }));
    await b.commit();
  }
  return { queued: emails.length, jobs: jobs.length, sent: 0, failed: 0, total: emails.length, message: `Email queued for ${emails.length} recipient${emails.length === 1 ? '' : 's'}.` };
});

const MAX_BULK_EMAILS = 20_000;
const MAIL_JOB_SIZE = 50;

export const testSmtp = authed<{ to?: string }>(async (d, ctx) => {
  noStore(await requirePanel(ctx, 'setting.update'));
  const to = str(d.to, 'to', { required: true, max: 150 });
  try {
    await sendEmail(to, 'SMTP test', '<p>Your SMTP settings are working.</p>', { throwOnError: true, template: 'test' });
  } catch (e) {
    precondition(`SMTP test failed: ${(e as Error).message}`);
  }
  return { sent: true };
});
