/** Shared helpers for the Firebase data layer: session, callables, conversion. */
import type { User as FirebaseUser } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type { Id, Mode } from '../types';
import { useLocationStore, useUiStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = any;

/* ------------------------------------------------------------------ context */

export function ctx() {
  const loc = useLocationStore.getState();
  const ui = useUiStore.getState();
  const zone = loc.zone;
  const storeId = loc.store?.id ?? zone?.default_store_id ?? null;
  return {
    lang: ui.language || 'en',
    mode: (ui.mode || 'quick') as Mode,
    zoneId: zone?.id != null ? String(zone.id) : null,
    storeId: storeId != null ? String(storeId) : null,
    lat: loc.lat,
    lng: loc.lng,
    deliveryMinutes: loc.deliveryMinutes ?? zone?.delivery_time_minutes ?? null,
  };
}

/* ------------------------------------------------------------------ session */

let anonPromise: Promise<FirebaseUser> | null = null;

/** The current Firebase user; signs in anonymously (guest) when nobody is signed in. */
export async function ensureUser(): Promise<FirebaseUser> {
  const { auth } = fb();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!anonPromise) {
    anonPromise = import('firebase/auth')
      .then(({ signInAnonymously }) => signInAnonymously(auth))
      .then((c) => c.user)
      .finally(() => {
        anonPromise = null;
      });
  }
  return anonPromise;
}

export async function uid(): Promise<string> {
  return (await ensureUser()).uid;
}

/** A signed-in (non-anonymous) customer's uid. */
export async function customerUid(): Promise<string> {
  const { auth } = fb();
  await auth.authStateReady();
  const u = auth.currentUser;
  if (!u || u.isAnonymous) throw new ApiError('Please log in to continue.', 401);
  return u.uid;
}

/* ------------------------------------------------------------------ errors */

const STATUS: Record<string, number> = {
  'invalid-argument': 422,
  'failed-precondition': 422,
  'already-exists': 409,
  'not-found': 404,
  'permission-denied': 403,
  unauthenticated: 401,
  'resource-exhausted': 429,
  unavailable: 503,
};

/** Firebase (functions / firestore / storage) error → ApiError with a user-readable message. */
export function toApiError(e: unknown): unknown {
  if (e instanceof ApiError) return e;
  const err = e as { code?: string; message?: string; details?: Raw };
  if (!err?.code) return e;
  const code = err.code.replace(/^(functions|firestore|storage)\//, '');
  const status = STATUS[code] ?? 500;
  // the Functions SDK appends the HTTP status to HttpsError messages ("… [400]") — not for customers' eyes
  let message = (err.message || '').replace(/\s*\[\d{3}\]\s*$/, '') || 'Something went wrong. Please try again.';
  if (err.code.startsWith('firestore/') || code === 'permission-denied') {
    if (code === 'permission-denied') message = 'You do not have permission to do that.';
    if (code === 'unavailable') message = 'You appear to be offline. Please check your connection.';
  }
  if (err.code.startsWith('storage/')) {
    if (code === 'unauthorized') message = 'Upload not allowed (images up to 5 MB only).';
  }
  if (code === 'internal' && /^internal$/i.test(message)) message = 'Something went wrong. Please try again.';
  const field = err.details?.field;
  return new ApiError(message, status, field ? { [field]: [message] } : undefined);
}

export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toApiError(e);
  }
}

/** Calls an `asia-south1` callable function. */
export async function call<T = Raw>(name: string, data: Record<string, unknown> = {}, opts: { anonymousOk?: boolean } = { anonymousOk: true }): Promise<T> {
  if (opts.anonymousOk) await ensureUser();
  return guard(async () => {
    const fn = httpsCallable<Record<string, unknown>, T>(fb().functions, name);
    const res = await fn(data);
    return res.data;
  });
}

/* ------------------------------------------------------------------ conversion */

/** Firestore Timestamp / callable-serialised timestamp / Date / millis → ISO string. */
export function iso(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof t.toDate === 'function') return t.toDate().toISOString();
  const s = t.seconds ?? t._seconds;
  return typeof s === 'number' ? new Date(s * 1000).toISOString() : '';
}

export function pick(field: unknown, lang = 'en'): string {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  const f = field as Record<string, string>;
  return f[lang] ?? f.en ?? Object.values(f)[0] ?? '';
}

export function isOn(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  return v === true || v === 1 || v === 'active' || v === '1' || v === 'true';
}

export const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? d : n;
};

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const sid = (v: Id | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Strip Firestore-only values (timestamps, keywords) from a plain object (for persisted stores). */
export function plain<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'search_keywords' || k === 'created_at' || k === 'updated_at') continue;
    out[k] = v;
  }
  return out as T;
}

/** In-memory cache for rarely changing public collections. */
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = load().catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), p });
  return p;
}
export function invalidate(prefix: string) {
  for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k);
}
