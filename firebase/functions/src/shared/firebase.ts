/** Admin SDK singletons + runtime helpers shared by every module. */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Firestore, getFirestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError, onCall, CallableRequest, CallableOptions } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineInt } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import type { CustomClaims, PublicSettings, UserType } from './types';

export const REGION = 'asia-south1';
export const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'qwikmart-37299';
setGlobalOptions({ region: REGION, maxInstances: 20 });

/**
 * Warm instances for the latency-sensitive public callables (detectZone, getHome, cartSummary). Default 0 (no cost);
 * set HOT_MIN_INSTANCES=1 in functions/.env.<project> (or answer the deploy prompt) to avoid cold starts.
 */
export const HOT_MIN_INSTANCES = defineInt('HOT_MIN_INSTANCES', { default: 0, description: 'minInstances for detectZone / getHome / cartSummary' });
export const hotOpts = { minInstances: HOT_MIN_INSTANCES };

if (!getApps().length) initializeApp();

export const db: Firestore = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  /* already initialised */
}
export const auth = getAuth();
export const messaging = () => getMessaging();
export { FieldValue, Timestamp, logger };
export type { Transaction };

export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST;

export function bucket() {
  // Default bucket of the project is <project>.firebasestorage.app. The emulator's FIREBASE_CONFIG reports the legacy
  // <project>.appspot.com name, which is ignored there so emulator objects/URLs match the migrated data and production.
  const cfg = String(JSON.parse(process.env.FIREBASE_CONFIG || '{}').storageBucket || '');
  const name = process.env.STORAGE_BUCKET || (cfg && !(IS_EMULATOR && cfg.endsWith('.appspot.com')) ? cfg : `${PROJECT_ID}.firebasestorage.app`);
  return getStorage().bucket(name);
}

export const now = () => Timestamp.now();
export const serverNow = () => FieldValue.serverTimestamp();

/* ------------------------------------------------------------------ errors */
export type ErrCode = 'invalid-argument' | 'failed-precondition' | 'permission-denied' | 'not-found' | 'unauthenticated' | 'already-exists' | 'resource-exhausted' | 'internal' | 'unavailable' | 'aborted';

export function fail(code: ErrCode, message: string, details?: unknown): never {
  throw new HttpsError(code, message, details);
}
export const invalid = (m: string, details?: unknown): never => fail('invalid-argument', m, details);
export const precondition = (m: string, details?: unknown): never => fail('failed-precondition', m, details);
export const denied = (m = 'You do not have permission to perform this action.'): never => fail('permission-denied', m);
export const notFound = (m = 'Not found.'): never => fail('not-found', m);

/* ------------------------------------------------------------------ callable wrapper */
export interface Ctx {
  uid: string;
  token: Record<string, unknown> & Partial<CustomClaims>;
  role: UserType;
  raw: CallableRequest<unknown>;
}

/**
 * App Check enforcement for every callable. Default false (clients do not send App Check tokens yet). After the apps ship
 * App Check (Play Integrity / DeviceCheck / reCAPTCHA Enterprise) set ENFORCE_APP_CHECK=true in functions/.env.<project>
 * (or answer the deploy prompt) and redeploy — no code change.
 */
// Read from process.env at load time (the .env.<project> file is loaded both at deploy discovery and at runtime):
// firebase-functions v7 evaluates a param Expression for this option during deployment and warns, so a plain boolean is used.
export const ENFORCE_APP_CHECK = String(process.env.ENFORCE_APP_CHECK ?? '').trim().toLowerCase() === 'true';
const callableOpts: CallableOptions = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, cors: true };

/** Authenticated callable. Errors that are not HttpsError are logged and mapped to `internal`. */
export function authed<I = Record<string, unknown>, O = unknown>(handler: (data: I, ctx: Ctx) => Promise<O>, opts: Partial<CallableOptions> = {}) {
  return onCall({ ...callableOpts, ...opts }, async (req: CallableRequest<unknown>) => {
    if (!req.auth) fail('unauthenticated', 'Please sign in to continue.');
    const token = req.auth.token as unknown as Ctx['token'];
    const ctx: Ctx = { uid: req.auth.uid, token, role: (token.role as UserType) || 'customer', raw: req };
    return wrap(() => handler(((req.data ?? {}) as I), ctx));
  });
}

/** Callable that also works without auth (ctx null). */
export function open<I = Record<string, unknown>, O = unknown>(handler: (data: I, ctx: Ctx | null) => Promise<O>, opts: Partial<CallableOptions> = {}) {
  return onCall({ ...callableOpts, ...opts }, async (req: CallableRequest<unknown>) => {
    const token = (req.auth?.token ?? {}) as unknown as Ctx['token'];
    const ctx: Ctx | null = req.auth ? { uid: req.auth.uid, token, role: (token.role as UserType) || 'customer', raw: req } : null;
    return wrap(() => handler(((req.data ?? {}) as I), ctx));
  });
}

async function wrap<O>(fn: () => Promise<O>): Promise<O> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error('Unhandled callable error', e);
    throw new HttpsError('internal', 'Something went wrong. Please try again.');
  }
}

/* ------------------------------------------------------------------ input helpers */
export function str(v: unknown, field: string, opts: { required?: boolean; max?: number } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.required) invalid(`The ${field.replace(/_/g, ' ')} field is required.`, { field });
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') invalid(`The ${field.replace(/_/g, ' ')} must be a string.`, { field });
  const s = String(v).trim();
  if (opts.max && s.length > opts.max) invalid(`The ${field.replace(/_/g, ' ')} may not be greater than ${opts.max} characters.`, { field });
  if (opts.required && !s) invalid(`The ${field.replace(/_/g, ' ')} field is required.`, { field });
  return s;
}

export function numIn(v: unknown, field: string, opts: { min?: number; max?: number; required?: boolean } = {}): number {
  if ((v === undefined || v === null || v === '') && !opts.required) return NaN;
  const n = Number(v);
  if (!Number.isFinite(n)) invalid(`The ${field.replace(/_/g, ' ')} must be a number.`, { field });
  if (opts.min !== undefined && n < opts.min) invalid(`The ${field.replace(/_/g, ' ')} must be at least ${opts.min}.`, { field });
  if (opts.max !== undefined && n > opts.max) invalid(`The ${field.replace(/_/g, ' ')} may not be greater than ${opts.max}.`, { field });
  return n;
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[], fallback?: T): T {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || !allowed.includes(v as T)) invalid(`The selected ${field.replace(/_/g, ' ')} is invalid.`, { field, allowed });
  return v as T;
}

/* ------------------------------------------------------------------ settings */
const cache = new Map<string, { at: number; value: unknown }>();
const SETTINGS_TTL = IS_EMULATOR ? 0 : 15_000;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && ttlMs > 0 && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearCache(prefix = '') {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

export async function publicSettings(): Promise<PublicSettings> {
  return cached('settings/public', SETTINGS_TTL, async () => ((await db.doc('settings/public').get()).data() ?? {}) as PublicSettings);
}

export async function privateSettings<T = Record<string, unknown>>(group: 'payment' | 'sms' | 'smtp' | 'ai'): Promise<T> {
  return cached(`settings/private_${group}`, SETTINGS_TTL, async () => ((await db.doc(`settings/private_${group}`).get()).data() ?? {}) as T);
}

export function tzOf(s: PublicSettings): string {
  return s.timezone || 'Asia/Kolkata';
}

/* ------------------------------------------------------------------ sequences */
/** Next value of counters/{name} inside a transaction (read happens immediately — call before any write). */
export async function nextSequence(tx: Transaction, name: string): Promise<{ value: number; commit: () => void }> {
  const ref = db.doc(`counters/${name}`);
  const snap = await tx.get(ref);
  const value = Number(snap.get('value') ?? 0) + 1;
  return { value, commit: () => tx.set(ref, { value, updated_at: now() }, { merge: true }) };
}

export function formatSequence(prefix: string, n: number): string {
  return prefix + String(n).padStart(5, '0');
}
