/**
 * Shared helpers for the QwikMart MySQL -> Firebase migration tools.
 *
 * Target selection (see README.md):
 *   default      -> Firebase Emulator Suite (Auth / Firestore / Storage), never the real project
 *   --prod       -> real project; requires GOOGLE_APPLICATION_CREDENTIALS AND --yes-i-mean-production
 */
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault, getApps, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import mysql from 'mysql2/promise';

export const PROJECT_ID = 'qwikmart-37299';
export const DEFAULT_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
/** Laravel app timezone (config/app.php) — MySQL DATETIME/TIMESTAMP values are stored as this wall clock. */
export const MYSQL_TZ = '+05:30';
/** Time zone used to bucket stats_daily docs (date + hour). Matches settings.timezone (Asia/Kolkata). */
export const STATS_TZ = 'Asia/Kolkata';

// ---------------------------------------------------------------- CLI args
export interface Args {
  prod: boolean;
  yes: boolean;
  dryRun: boolean;
  only: Set<string> | null;
  skipStorage: boolean;
  emulatorPasswords: string[];
  verbose: boolean;
  /** Accounts whose BCRYPT hash matches a known demo password: keep | disable | reset-passwords (prod default: disable). */
  demoAccounts: 'keep' | 'disable' | 'reset-passwords';
}

export function parseArgs(argv = process.argv.slice(2)): Args {
  const get = (name: string) => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return undefined;
    const eq = hit.indexOf('=');
    return eq === -1 ? '' : hit.slice(eq + 1);
  };
  const only = get('only');
  const pw = get('emulator-passwords');
  const demo = get('demo-accounts');
  const isProd = get('prod') !== undefined;
  if (demo !== undefined && !['keep', 'disable', 'reset-passwords'].includes(demo)) {
    throw new Error(`--demo-accounts must be keep | disable | reset-passwords (got "${demo}").`);
  }
  return {
    prod: get('prod') !== undefined,
    yes: get('yes-i-mean-production') !== undefined,
    dryRun: get('dry-run') !== undefined,
    only: only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null,
    skipStorage: get('skip-storage') !== undefined,
    emulatorPasswords: pw ? pw.split(',').filter(Boolean) : [],
    verbose: get('verbose') !== undefined,
    // emulator: unchanged (keep); production: demo logins are disabled unless the operator chooses otherwise
    demoAccounts: (demo as Args['demoAccounts'] | undefined) ?? (isProd ? 'disable' : 'keep'),
  };
}

// ---------------------------------------------------------------- Firebase init
export interface Fb {
  app: App;
  db: Firestore;
  auth: Auth;
  bucketName: string;
  emulator: boolean;
  /** host:port used in emulator download URLs */
  storageHost: string | null;
}

export function initFirebase(args: Args): Fb {
  if (args.prod) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error('--prod requires GOOGLE_APPLICATION_CREDENTIALS (service-account JSON path).');
    }
    if (!args.yes) {
      throw new Error('--prod also requires the explicit flag --yes-i-mean-production. Refusing to touch the real project.');
    }
    for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST']) {
      delete process.env[k];
    }
    console.warn(`!!! PRODUCTION MODE — writing to project ${PROJECT_ID} !!!`);
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
    process.env.STORAGE_EMULATOR_HOST ||= `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
    process.env.GCLOUD_PROJECT ||= PROJECT_ID;
    process.env.METADATA_SERVER_DETECTION ||= 'none'; // no GCE metadata probing (avoids a ~10 s timeout warning)
    console.log(
      `Emulator mode: firestore=${process.env.FIRESTORE_EMULATOR_HOST} auth=${process.env.FIREBASE_AUTH_EMULATOR_HOST} storage=${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`,
    );
  }
  const bucketName = process.env.STORAGE_BUCKET || DEFAULT_BUCKET;
  const app =
    getApps()[0] ??
    initializeApp({
      projectId: PROJECT_ID,
      storageBucket: bucketName,
      ...(args.prod ? { credential: applicationDefault() } : {}),
    });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return {
    app,
    db,
    auth: getAuth(app),
    bucketName,
    emulator: !args.prod,
    storageHost: args.prod ? null : process.env.STORAGE_PUBLIC_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST!,
  };
}

export function bucket(fb: Fb) {
  return getStorage(fb.app).bucket(fb.bucketName);
}

// ---------------------------------------------------------------- MySQL (read only)
export async function openMysql() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'snapbuy',
    timezone: MYSQL_TZ,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false, // DECIMAL arrives as string -> num() rounds to 2 decimals
  });
  // Guard: this tool never writes to MySQL.
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  return conn;
}
export type Mysql = Awaited<ReturnType<typeof openMysql>>;

export async function rows<T = any>(conn: Mysql, sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await conn.query(sql, params);
  return (r as Record<string, unknown>[]).map(rebrandRow) as T[];
}

// ---------------------------------------------------------------- brand rename (MySQL data still says "SnapBuy")
// Display text, slugs, URLs and app ids are rewritten to QwikMart as rows are read. E-mail addresses are left alone
// (they are login ids / mailboxes the owner controls) — set the real support/no-reply addresses in Admin → Settings.
const KEEP_COLUMNS = new Set(['email', 'password', 'remember_token', 'firebase_uid']);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export function rebrandText(v: string): string {
  if (!/snap\s?buy/i.test(v)) return v;
  const keep: string[] = [];
  return v
    .replace(EMAIL_RE, (m) => `\u0000${keep.push(m) - 1}\u0000`)
    .replace(/app\.snapbuy\.customer/g, 'com.qwikmart.app')
    .replace(/app\.snapbuy\.deliveryboy/g, 'com.qwikmart.delivery')
    .replace(/SNAPBUY/g, 'QWIKMART')
    .replace(/Snap ?Buy|Snapbuy/g, 'QwikMart')
    .replace(/snapbuy/g, 'qwikmart')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}
function rebrandRow(row: Record<string, unknown>): Record<string, unknown> {
  if (!row || typeof row !== 'object') return row;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && !KEEP_COLUMNS.has(k)) row[k] = rebrandText(v);
  }
  return row;
}

// ---------------------------------------------------------------- value helpers
export type Tr = Record<string, string>;

export const sid = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export function num(v: unknown, digits = 2): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
export const numOrNull = (v: unknown, digits = 2) => (v === null || v === undefined || v === '' ? null : num(v, digits));
export const bool = (v: unknown) => v === 1 || v === true || v === '1' || v === 'true';
export const activeStatus = (v: unknown) => (bool(v) ? 'active' : 'inactive');

export function ts(v: unknown): Timestamp | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export function json<T = any>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/** Translatable column (spatie JSON or plain string) -> {en, ar, hi, ...}. */
export function tr(v: unknown): Tr {
  if (v === null || v === undefined || v === '') return {};
  if (typeof v === 'object') return clean(v as Tr);
  const s = String(v);
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      if (o && typeof o === 'object' && !Array.isArray(o)) return clean(o);
    } catch {
      /* plain string */
    }
  }
  return { en: s };
  function clean(o: Record<string, unknown>): Tr {
    const out: Tr = {};
    for (const [k, val] of Object.entries(o)) if (val !== null && val !== undefined) out[k] = String(val);
    return out;
  }
}
export const trEn = (t: Tr) => t.en ?? Object.values(t)[0] ?? '';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * search_keywords per spec §1: lowercase word prefixes (min 2, max 15 chars) of the given texts.
 * Words are split on whitespace and punctuation (so "SB-ORD-00002" also yields "sb-ord-00002" prefixes).
 */
export function searchKeywords(...values: Array<string | Tr | null | undefined | Array<string | null | undefined>>): string[] {
  // Same algorithm as firebase/functions/src/shared/util.ts searchKeywords() (kept in sync on purpose,
  // so migrated docs match what the triggers would derive).
  const out = new Set<string>();
  const texts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) texts.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(push);
  };
  values.forEach(push);
  const addPrefixes = (w: string) => {
    const chars = [...w];
    for (let i = 2; i <= Math.min(15, chars.length); i++) out.add(chars.slice(0, i).join(''));
  };
  const APOSTROPHES = /['’‘`´]/gu;
  for (const text of texts) {
    const clean = text.toLowerCase().normalize('NFKC').replace(APOSTROPHES, ''); // "lay's" → "lays"
    const words = clean.split(/[\s,./()\-_+&|:;"!?#@*[\]{}<>=~^%$\\]+/u).filter(Boolean);
    for (const w of words) addPrefixes(w);
    if (words.length > 1) addPrefixes(words.join(' '));
    for (const tok of clean.split(/[\s,/()+&|:;"!?#@]+/u)) {
      const parts = tok.split(/[.\-_]+/u).filter(Boolean);
      if (parts.length > 1) addPrefixes(parts.join('')); // "coca-cola" → "cocacola"
    }
  }
  return [...out].slice(0, 400);
}

/** E.164 from (country_code, phone). Returns null when it cannot produce a valid number. */
export function e164(phone: unknown, countryCode?: unknown): string | null {
  if (!phone) return null;
  let p = String(phone).trim();
  const plus = p.startsWith('+');
  p = p.replace(/[^\d]/g, '');
  if (!p) return null;
  let out: string;
  if (plus) out = '+' + p;
  else {
    const cc = String(countryCode ?? '').replace(/[^\d]/g, '');
    if (!cc) return null;
    p = p.replace(/^0+/, '');
    out = p.startsWith(cc) && p.length > 10 ? '+' + p : `+${cc}${p}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}

export function stableToken(input: string): string {
  const h = createHash('sha256').update(input).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** yyyy-mm-dd and hour (0..23) of a Date in STATS_TZ. */
export function dayHour(d: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STATS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

export function log(...a: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}
