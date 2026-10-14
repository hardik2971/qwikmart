/**
 * Customer account: profile (users/{uid}, client may write only name/avatar/language/fcm_tokens), addresses,
 * wallet ledger, withdrawals, referrals, notifications — plus the syncProfile / deleteAccount / wallet callables.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type { Address, AppNotification, Id, ReferralData, User, WalletData, Withdrawal } from '../types';
import { call, customerUid, guard, iso, num, type Raw } from './core';
import { publicSettings } from './catalog';

const db = () => fb().db;

export function toUser(id: string, u: Raw): User {
  return {
    id,
    name: u?.name ?? '',
    email: u?.email ?? null,
    phone: u?.phone ?? null,
    avatar: u?.avatar ?? null,
    referral_code: u?.referral_code,
    wallet_balance: num(u?.wallet_balance),
    type: u?.type,
    status: u?.status,
    language: u?.language,
  };
}

/* ------------------------------------------------------------------ profile */

export interface SyncResult {
  user: User;
  is_new: boolean;
  blocked?: boolean;
}

/** Creates/links users/{uid} and sets claims — call after every sign-in (replaces POST /auth/session). */
export async function syncProfile(body: { name?: string; email?: string; referral_code?: string; fcm_token?: string; language?: string }): Promise<SyncResult> {
  const r = await call<Raw>('syncProfile', { ...body, app: 'customer' });
  return { user: toUser(r.user.id, r.user), is_new: !!r.is_new, blocked: !!r.blocked };
}

/** users/{uid} of the signed-in customer, or null when the doc does not exist yet. */
export async function profileDoc(): Promise<User | null> {
  const id = await customerUid();
  const s = await guard(() => getDoc(doc(db(), 'users', id)));
  return s.exists() ? toUser(id, s.data()) : null;
}

export async function profile(): Promise<User> {
  const u = await profileDoc();
  if (u) return u;
  return (await syncProfile({})).user;
}

export async function updateProfile(body: { name?: string; email?: string }): Promise<User> {
  const id = await customerUid();
  const current = await profile();
  if (body.email !== undefined && (body.email || '') !== (current.email || '')) {
    throw new ApiError('Your email is your sign-in ID and cannot be changed here. Please contact support.', 422, {
      email: ['Email cannot be changed here.'],
    });
  }
  const name = (body.name ?? '').trim();
  if (!name) throw new ApiError('Please enter your name.', 422, { name: ['The name field is required.'] });
  await guard(() => updateDoc(doc(db(), 'users', id), { name: name.slice(0, 100), updated_at: serverTimestamp() }));
  const { auth } = fb();
  if (auth.currentUser) {
    const { updateProfile: setAuthProfile } = await import('firebase/auth');
    await setAuthProfile(auth.currentUser, { displayName: name }).catch(() => undefined);
  }
  return { ...current, name };
}

/** Stores the UI language on the profile (client-writable) — the backend uses it for notifications / emails. */
export async function saveLanguage(language: string): Promise<void> {
  const id = await customerUid();
  await guard(() => updateDoc(doc(db(), 'users', id), { language, updated_at: serverTimestamp() }));
}

/** Uploads to Storage users/{uid}/avatar/… (public read, ≤ 5 MB image) and stores the download URL. */
export async function uploadAvatar(file: File): Promise<User> {
  const id = await customerUid();
  if (!file.type.startsWith('image/')) throw new ApiError('Please choose an image file.', 422);
  if (file.size > 5 * 1024 * 1024) throw new ApiError('Images must be 5 MB or smaller.', 422);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const url = await guard(async () => {
    const r = storageRef(fb().storage, `users/${id}/avatar/avatar_${Date.now()}.${ext}`);
    await uploadBytes(r, file, { contentType: file.type });
    return getDownloadURL(r);
  });
  await guard(() => updateDoc(doc(db(), 'users', id), { avatar: url, updated_at: serverTimestamp() }));
  const { auth } = fb();
  if (auth.currentUser) {
    const { updateProfile: setAuthProfile } = await import('firebase/auth');
    await setAuthProfile(auth.currentUser, { photoURL: url }).catch(() => undefined);
  }
  return profile();
}

export async function deleteProfile(): Promise<void> {
  await customerUid();
  await call('deleteAccount', {});
}

/** Adds / removes an FCM web token on users/{uid}.fcm_tokens (whitelisted field). */
export async function setFcmToken(token: string, add: boolean) {
  const id = await customerUid();
  const { arrayRemove, arrayUnion } = await import('firebase/firestore');
  await guard(() => updateDoc(doc(db(), 'users', id), { fcm_tokens: add ? arrayUnion(token) : arrayRemove(token), updated_at: serverTimestamp() }));
}

/* ------------------------------------------------------------------ addresses */

function toAddress(id: string, a: Raw): Address {
  return {
    id,
    label: a.label || 'Home',
    name: a.name ?? '',
    phone: a.phone ?? '',
    address_line: a.address_line ?? '',
    landmark: a.landmark ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    pincode: a.pincode ?? '',
    country_id: a.country_id ?? undefined,
    lat: num(a.lat),
    lng: num(a.lng),
    is_default: !!a.is_default,
  };
}

/** Only the fields firestore.rules allow on an address doc. */
function addressFields(a: Partial<Address>) {
  const out: Record<string, unknown> = {};
  const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  if (a.label !== undefined) out.label = str(a.label, 30);
  if (a.name !== undefined) out.name = str(a.name, 100);
  if (a.phone !== undefined) out.phone = str(a.phone, 20);
  if (a.address_line !== undefined) out.address_line = str(a.address_line, 500);
  if (a.landmark !== undefined) out.landmark = str(a.landmark, 200);
  if (a.city !== undefined) out.city = str(a.city, 100);
  if (a.state !== undefined) out.state = str(a.state, 100);
  if (a.pincode !== undefined) out.pincode = str(a.pincode, 20);
  if (a.country_id !== undefined && a.country_id !== null) out.country_id = String(a.country_id);
  if (a.lat !== undefined) out.lat = Number(a.lat);
  if (a.lng !== undefined) out.lng = Number(a.lng);
  if (a.is_default !== undefined) out.is_default = !!a.is_default;
  return out;
}

const addressCol = (id: string) => collection(db(), 'users', id, 'addresses');

export async function addresses(): Promise<Address[]> {
  const id = await customerUid();
  const s = await guard(() => getDocs(addressCol(id)));
  return s.docs.map((d) => toAddress(d.id, d.data())).sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

/** Clears is_default on the other addresses when one becomes the default. */
async function setDefault(owner: string, keep: string) {
  const s = await getDocs(query(addressCol(owner), where('is_default', '==', true)));
  const b = writeBatch(db());
  let n = 0;
  s.docs.forEach((d) => {
    if (d.id !== keep) {
      b.update(d.ref, { is_default: false, updated_at: serverTimestamp() });
      n++;
    }
  });
  if (n) await b.commit();
}

export async function addAddress(body: Omit<Address, 'id'>): Promise<Address> {
  const id = await customerUid();
  return guard(async () => {
    const existing = await getDocs(query(addressCol(id), limit(1)));
    const fields = addressFields({ ...body, is_default: body.is_default || existing.empty });
    const ref = await addDoc(addressCol(id), { ...fields, created_at: serverTimestamp(), updated_at: serverTimestamp() });
    if (fields.is_default) await setDefault(id, ref.id);
    return toAddress(ref.id, fields);
  });
}

export async function updateAddress(addressId: Id, body: Partial<Address>): Promise<Address> {
  const id = await customerUid();
  return guard(async () => {
    const ref = doc(db(), 'users', id, 'addresses', String(addressId));
    const fields = addressFields(body);
    await updateDoc(ref, { ...fields, updated_at: serverTimestamp() });
    if (fields.is_default) await setDefault(id, ref.id);
    return toAddress(ref.id, (await getDoc(ref)).data());
  });
}

export async function deleteAddress(addressId: Id): Promise<void> {
  const id = await customerUid();
  const { deleteDoc } = await import('firebase/firestore');
  await guard(() => deleteDoc(doc(db(), 'users', id, 'addresses', String(addressId))));
}

/* ------------------------------------------------------------------ wallet */

export async function wallet(): Promise<WalletData> {
  const id = await customerUid();
  const [u, tx] = await guard(() =>
    Promise.all([getDoc(doc(db(), 'users', id)), getDocs(query(collection(db(), 'users', id, 'wallet_transactions'), orderBy('created_at', 'desc'), limit(100)))]),
  );
  return {
    balance: num(u.get('wallet_balance')),
    transactions: tx.docs.map((d) => {
      const t = d.data();
      return {
        id: d.id,
        type: t.type,
        amount: num(t.amount),
        balance_after: num(t.balance_after),
        payment_type: t.payment_type ?? 'wallet',
        txn_id: t.txn_id ?? null,
        order_id: t.order_id ?? null,
        message: t.message ?? '',
        status: t.status ?? 'success',
        created_at: iso(t.created_at),
      };
    }),
  };
}

export async function rechargeWallet(amount: number, gateway: string) {
  const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/wallet?recharge_return=1` : undefined;
  const r = await call<Raw>('walletRecharge', { amount, gateway, return_url: returnUrl });
  return { payment: r, recharge_id: r.recharge_id as string };
}

export async function verifyWalletRecharge(rechargeId: string, payload: Record<string, unknown>) {
  return call<{ balance?: number; message?: string }>('verifyWalletRecharge', { recharge_id: rechargeId, payload });
}

export async function withdraw(amount: number, message: string): Promise<Withdrawal> {
  const r = await call<Raw>('walletWithdraw', { amount, message });
  return { id: r.id, amount: num(r.amount), message, status: 'pending', created_at: new Date().toISOString() };
}

export async function withdrawals(): Promise<Withdrawal[]> {
  const id = await customerUid();
  const s = await guard(() => getDocs(query(collection(db(), 'withdrawal_requests'), where('user_id', '==', id), orderBy('created_at', 'desc'), limit(50))));
  return s.docs.map((d) => {
    const w = d.data();
    return { id: d.id, amount: num(w.amount), message: w.message ?? '', status: w.status, created_at: iso(w.created_at) };
  });
}

/* ------------------------------------------------------------------ referral */

export async function referral(): Promise<ReferralData> {
  const id = await customerUid();
  const [u, s, refs] = await Promise.all([
    guard(() => getDoc(doc(db(), 'users', id))),
    publicSettings(),
    guard(() => getDocs(query(collection(db(), 'referrals'), where('referrer_id', '==', id), orderBy('created_at', 'desc'), limit(100)))),
  ]);
  const list = refs.docs.map((d) => d.data());
  return {
    code: u.get('referral_code') ?? '',
    referrer_reward: num(s.referral?.referrer_reward, 50),
    referred_reward: num(s.referral?.referred_reward, 25),
    min_order: num(s.referral?.min_order, 199),
    total_earned: list.filter((r) => r.status === 'credited').reduce((sum, r) => sum + num(r.referrer_reward), 0),
    referrals: list.map((r) => ({ name: r.referred_name ?? 'Friend', status: r.status === 'credited' ? 'credited' : 'pending', reward: num(r.referrer_reward), created_at: iso(r.created_at) })),
  };
}

/* ------------------------------------------------------------------ notifications */

function link(n: Raw): string | null {
  const d = n.data && typeof n.data === 'object' ? n.data : {};
  if (d.order_id) return `/orders/${d.order_id}`;
  if (d.link || d.url) return String(d.link ?? d.url);
  if (d.return_id) return '/orders';
  return null;
}

export async function notifications(): Promise<AppNotification[]> {
  const id = await customerUid();
  const s = await guard(() => getDocs(query(collection(db(), 'users', id, 'notifications'), orderBy('created_at', 'desc'), limit(50))));
  return s.docs.map((d) => {
    const n = d.data();
    return {
      id: d.id,
      title: n.title ?? '',
      message: n.message ?? '',
      type: n.type ?? n.data?.type,
      image: n.image ?? null,
      link: link(n),
      read_at: n.read_at ? iso(n.read_at) : null,
      created_at: iso(n.created_at),
    };
  });
}

export async function readAllNotifications(): Promise<void> {
  const id = await customerUid();
  await guard(async () => {
    const s = await getDocs(query(collection(db(), 'users', id, 'notifications'), where('read_at', '==', null)));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db());
      s.docs.slice(i, i + 400).forEach((d) => b.update(d.ref, { read_at: serverTimestamp() }));
      await b.commit();
    }
  });
}

export async function readNotification(nid: Id): Promise<void> {
  const id = await customerUid();
  await guard(() => updateDoc(doc(db(), 'users', id, 'notifications', String(nid)), { read_at: serverTimestamp() }));
}
