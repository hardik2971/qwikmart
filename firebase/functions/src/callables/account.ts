/** Account callables: syncProfile, deleteAccount. */
import { auth, authed, db, FieldValue, logger, now, oneOf, precondition, publicSettings, str } from '../shared/firebase';
import type { CustomClaims, UserDoc, UserType } from '../shared/types';
import { randomCode, searchKeywords } from '../shared/util';
import { notifyUser } from '../services/notify';

export async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(8);
    const snap = await db.collection('users').where('referral_code', '==', code).limit(1).get();
    if (snap.empty) return code;
  }
  return randomCode(10);
}

/** Recompute custom claims from users/{uid} (+ delivery_boys/{uid}). Returns true when they changed. */
export async function syncClaims(uid: string): Promise<CustomClaims> {
  const [u, b, rec] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`delivery_boys/${uid}`).get(), auth.getUser(uid)]);
  let type = (u.get('type') as UserType | undefined) ?? (b.exists ? 'delivery_boy' : 'customer');
  // Store staff = role 'store' + store_id + role_id (permissions of a store role, scoped to that store). A legacy
  // 'staff' doc carrying a store_id is normalised so its role never applies platform-wide.
  if (type === 'staff' && u.get('store_id')) {
    type = 'store';
    await u.ref.update({ type: 'store', updated_at: FieldValue.serverTimestamp() });
  }
  const claims: CustomClaims = { role: type };
  if (type === 'store' && u.get('store_id')) claims.store_id = String(u.get('store_id'));
  if ((type === 'staff' || type === 'store') && u.get('role_id')) claims.role_id = String(u.get('role_id'));
  if (type === 'delivery_boy' && b.exists && b.get('approval_status') === 'approved' && b.get('zone_id')) claims.zone_id = String(b.get('zone_id'));
  const current = (rec.customClaims ?? {}) as Record<string, unknown>;
  const same = ['role', 'store_id', 'role_id', 'zone_id'].every((k) => (current[k] ?? null) === ((claims as unknown as Record<string, unknown>)[k] ?? null));
  if (!same) await auth.setCustomUserClaims(uid, { ...claims });
  return claims;
}

/** Move a legacy (imported) profile with the same verified phone/email onto the new uid. */
async function linkLegacy(uid: string, phone: string | null, email: string | null): Promise<boolean> {
  const candidates = [];
  if (phone) candidates.push(db.collection('users').where('phone', '==', phone).limit(2).get());
  if (email) candidates.push(db.collection('users').where('email', '==', email).limit(2).get());
  // Never link panel profiles (admin/staff/store): a phone/email match must not hand out a privileged role.
  const docs = (await Promise.all(candidates)).flatMap((s) => s.docs).filter((d) => d.id !== uid && !['merged', 'deleted'].includes(String(d.get('status')))
    && ['customer', 'delivery_boy', undefined, null].includes(d.get('type') as string | undefined));
  const legacy = docs[0];
  if (!legacy) return false;
  // Only link profiles whose Auth user no longer exists or is not the owner of this phone/email (imported, never signed in).
  try {
    await auth.getUser(legacy.id);
    return false;
  } catch {
    /* no auth user → legacy import, safe to link */
  }
  const data = legacy.data() as UserDoc;
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), { ...data, legacy_uid: legacy.id, updated_at: now(), last_login_at: now() });
  batch.update(legacy.ref, { status: 'merged', merged_into: uid, updated_at: now() });
  await batch.commit();
  for (const sub of ['addresses', 'wallet_transactions', 'notifications', 'favorites', 'cart']) {
    const s = await legacy.ref.collection(sub).get();
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = db.batch();
      s.docs.slice(i, i + 400).forEach((d) => b.set(db.doc(`users/${uid}/${sub}/${d.id}`), d.data()));
      await b.commit();
    }
  }
  for (const [col, field] of [['orders', 'user_id'], ['return_requests', 'user_id'], ['withdrawal_requests', 'user_id'], ['reviews', 'user_id'], ['referrals', 'referrer_id'], ['referrals', 'referred_id'], ['chats', 'user_uid']] as const) {
    const s = await db.collection(col).where(field, '==', legacy.id).get();
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = db.batch();
      s.docs.slice(i, i + 400).forEach((d) => b.update(d.ref, col === 'chats' ? { user_uid: uid, user_id: uid } : { [field]: uid }));
      await b.commit();
    }
  }
  logger.info('Linked legacy account', { from: legacy.id, to: uid });
  return true;
}

export const syncProfile = authed<{ name?: string; email?: string; referral_code?: string; fcm_token?: string; language?: string; app?: string }>(async (data, ctx) => {
  const app = oneOf(data.app, 'app', ['customer', 'delivery'] as const, 'customer');
  const rec = await auth.getUser(ctx.uid);
  const anonymous = rec.providerData.length === 0 && !rec.email && !rec.phoneNumber;
  const ref = db.doc(`users/${ctx.uid}`);
  let snap = await ref.get();
  let isNew = false;
  const name = str(data.name, 'name', { max: 100 });
  const email = str(data.email, 'email', { max: 150 }).toLowerCase();
  const token = str(data.fcm_token, 'fcm_token', { max: 500 });
  const language = str(data.language, 'language', { max: 10 });

  // Wrong app for this account (customer app ← panel/rider account, delivery app ← non-rider account): answer with the
  // profile but write nothing (no fcm token / language / login stamp lands on an account of another app).
  if (snap.exists) {
    const t = String(snap.get('type') ?? 'customer');
    const wrongApp = app === 'delivery' ? t !== 'delivery_boy' : t !== 'customer';
    if (wrongApp) {
      const claims = await syncClaims(ctx.uid); // server-derived claims only; no client data is written
      return { user: { id: ctx.uid, ...(await ref.get()).data() }, is_new: false, claims, wrong_app: true, expected_type: app === 'delivery' ? 'delivery_boy' : 'customer' };
    }
  }

  // A guest (anonymous) doc that has now been upgraded to a real provider (linkWithCredential keeps the uid) runs the
  // new-user path once: referral attach, referral code, welcome notification, is_new:true.
  const upgraded = snap.exists && !anonymous && (snap.get('is_anonymous') === true || (!snap.get('referral_code') && snap.get('type') === 'customer'));

  if ((!snap.exists || upgraded) && !anonymous) {
    const linked = await linkLegacy(ctx.uid, rec.phoneNumber ?? null, rec.emailVerified ? rec.email ?? null : null);
    if (linked) snap = await ref.get();
  }
  const runNewUser = !snap.exists || (upgraded && !snap.get('legacy_uid'));

  if (!snap.exists && anonymous) {
    // Guests get only what the cart / checkout pricing needs — no referral code, search keywords or notifications.
    isNew = true;
    await ref.set({
      type: 'customer', is_anonymous: true, name: '', email: null, phone: null, avatar: null, wallet_balance: 0, orders_count: 0, total_spent: 0,
      fcm_tokens: token ? [token] : [], status: 'active', language: language || 'en', created_at: now(), updated_at: now(), last_login_at: now(),
    });
  } else if (runNewUser) {
    isNew = true;
    const prev = (snap.exists ? snap.data() : {}) as Partial<UserDoc> & Record<string, unknown>;
    const type: UserType = snap.exists ? ((prev.type as UserType) ?? 'customer') : app === 'delivery' ? 'delivery_boy' : 'customer';
    const doc: Partial<UserDoc> & Record<string, unknown> = {
      type, name: name || (prev.name as string) || rec.displayName || '', email: (email || (prev.email as string) || rec.email || null), phone: rec.phoneNumber ?? (prev.phone as string) ?? null,
      avatar: (prev.avatar as string) ?? rec.photoURL ?? null,
      referral_code: (prev.referral_code as string) || await uniqueReferralCode(), referred_by: (prev.referred_by as string) ?? null,
      wallet_balance: Number(prev.wallet_balance ?? 0), orders_count: Number(prev.orders_count ?? 0), total_spent: Number(prev.total_spent ?? 0),
      fcm_tokens: [...new Set([...(((prev.fcm_tokens as string[]) ?? [])), ...(token ? [token] : [])])].slice(-20), status: (prev.status as UserDoc['status']) ?? 'active',
      language: language || (prev.language as string) || 'en', is_anonymous: false,
      created_at: prev.created_at ?? now(), updated_at: now(), last_login_at: now(), ...(snap.exists ? { upgraded_at: now() } : {}),
    };
    doc.search_keywords = searchKeywords(doc.name as string, doc.email as string, doc.phone as string);
    await ref.set(doc, { merge: true });

    // referral
    const settings = await publicSettings();
    const refCfg = settings.referral ?? {};
    const code = str(data.referral_code, 'referral_code', { max: 20 }).toUpperCase();
    if (code && refCfg.enabled !== false && type === 'customer' && !doc.referred_by) {
      const r = await db.collection('users').where('referral_code', '==', code).limit(1).get();
      const referrer = r.docs[0];
      if (referrer && referrer.id !== ctx.uid) {
        await ref.update({ referred_by: referrer.id });
        await db.collection('referrals').add({
          referrer_id: referrer.id, referred_id: ctx.uid, referred_name: doc.name, referrer_reward: Number(refCfg.referrer_reward ?? 50),
          referred_reward: Number(refCfg.referred_reward ?? 25), min_order: Number(refCfg.min_order ?? 199), status: 'pending', created_at: now(),
        });
      }
    }
    if (type === 'customer') {
      await notifyUser(ctx.uid, `Welcome to ${settings.app_name ?? 'QwikMart'}!`, 'Your account is ready. Start shopping now.', { type: 'default' });
    }
  } else {
    const cur = snap.data() as UserDoc & { is_anonymous?: boolean };
    if (cur.status === 'inactive') {
      await auth.revokeRefreshTokens(ctx.uid).catch(() => undefined);
      return { user: { id: ctx.uid, ...cur }, is_new: false, blocked: true };
    }
    const upd: Record<string, unknown> = { last_login_at: now(), updated_at: now() };
    if (name && !cur.name) upd.name = name;
    if (email && !cur.email) upd.email = email;
    if (rec.phoneNumber && cur.phone !== rec.phoneNumber) upd.phone = rec.phoneNumber;
    if (rec.email && !cur.email) upd.email = rec.email;
    if (language) upd.language = language;
    if (token) upd.fcm_tokens = FieldValue.arrayUnion(token);
    if (cur.is_anonymous && !anonymous) upd.is_anonymous = false;
    await ref.update(upd);
  }
  const claims = await syncClaims(ctx.uid);
  const user = (await ref.get()).data();
  return { user: { id: ctx.uid, ...user }, is_new: isNew, claims };
});

export const deleteAccount = authed(async (_data, ctx) => {
  const ref = db.doc(`users/${ctx.uid}`);
  // Delivery partners: refuse while orders are in progress or COD cash is unsettled, then deactivate the rider record
  // (kept for order / payout history, stripped of personal details).
  const boyRef = db.doc(`delivery_boys/${ctx.uid}`);
  const boy = await boyRef.get();
  if (boy.exists) {
    const active = await db.collection('orders').where('delivery_boy_id', '==', ctx.uid)
      .where('status', 'in', ['processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery']).limit(1).get();
    if (!active.empty) precondition('Please complete or hand over your active orders before deleting your account.');
    if (Number(boy.get('cash_in_hand') ?? 0) > 0) precondition('Please settle the cash in hand with the store before deleting your account.');
    await boyRef.set({
      status: 'inactive', is_online: false, location: null, approval_status: 'deleted',
      bank: null, driving_license: null, id_proof: null, address: null, deleted_at: now(), updated_at: now(),
    }, { merge: true });
  }
  for (const sub of ['cart', 'addresses', 'favorites', 'notifications']) {
    const s = await ref.collection(sub).get();
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = db.batch();
      s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
  await ref.set({ status: 'deleted', name: 'Deleted user', email: null, phone: null, avatar: null, fcm_tokens: [], search_keywords: [], deleted_at: now(), updated_at: now() }, { merge: true });
  await auth.deleteUser(ctx.uid).catch((e) => logger.warn('deleteUser failed', String(e)));
  return { deleted: true };
});
