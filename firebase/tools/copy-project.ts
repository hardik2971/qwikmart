/**
 * One-time copy of the live QwikMart project qwikmart-37299 → qwikmart-infidec.
 *
 *   npx tsx copy-project.ts --count                 read-only: what the old project holds
 *   npx tsx copy-project.ts --copy [parts...]       parts: auth-config auth firestore storage (default: all four)
 *   npx tsx copy-project.ts --seed-snapshot [parts] parts: auth firestore storage — load emulator-data/ (the 14 Oct 2026
 *                                                   migration snapshot) instead; firestore needs the Firestore emulator
 *                                                   running with it: firebase emulators:start --only firestore --import tools/emulator-data
 *
 * Keys: service-account.json (old project) and ../../secret/qwikmart-infidec-firebase.json (new project).
 * - firestore: every collection and subcollection, same document ids; Storage URLs and DocumentReferences are rewritten
 *   to the new project. Existing documents in the new project with the same path are overwritten.
 * - storage: every object with its metadata (incl. firebaseStorageDownloadTokens, so tokenised URLs keep working).
 * - auth: users with uid, claims and password hashes (SCRYPT with the old project's hash config; BCRYPT hashes of
 *   migrated users that never signed in are imported as BCRYPT), so logins keep working.
 * - auth-config: enabled sign-in methods, phone test numbers, SMS regions, and the new project's authorized domains.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type UserImportRecord } from 'firebase-admin/auth';
import { DocumentReference, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { GoogleAuth } from 'google-auth-library';

const OLD = 'qwikmart-37299';
const NEW = 'qwikmart-infidec';
const OLD_KEY = new URL('./service-account.json', import.meta.url);
const NEW_KEY = new URL('../../secret/qwikmart-infidec-firebase.json', import.meta.url);
const OLD_BUCKET = `${OLD}.firebasestorage.app`;
const NEW_BUCKET = `${NEW}.firebasestorage.app`;
const NEW_DOMAINS = ['localhost', `${NEW}.firebaseapp.com`, `${NEW}.web.app`, 'qwikmart-admin.web.app'];

const keyOf = (u: URL) => JSON.parse(readFileSync(u, 'utf8'));
const oldApp: App = initializeApp({ credential: cert(keyOf(OLD_KEY)), projectId: OLD, storageBucket: OLD_BUCKET }, 'old');
const newApp: App = initializeApp({ credential: cert(keyOf(NEW_KEY)), projectId: NEW, storageBucket: NEW_BUCKET }, 'new');
const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

const rest = async (key: URL) =>
  new GoogleAuth({ keyFile: key.pathname.replace(/^\/([A-Za-z]:)/, '$1'), scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
const idt = (p: string) => `https://identitytoolkit.googleapis.com/admin/v2/projects/${p}`;

/* ------------------------------------------------------------------ count */

async function count() {
  let docs = 0;
  const walk = async (cols: FirebaseFirestore.CollectionReference[], depth: number) => {
    for (const c of cols) {
      const snap = await c.get();
      docs += snap.size;
      if (depth === 0) console.log(`  ${c.id}: ${snap.size}`);
      for (const d of snap.docs) await walk(await d.ref.listCollections(), depth + 1);
    }
  };
  console.log('Firestore:');
  await walk(await oldDb.listCollections(), 0);
  console.log(`  total documents incl. subcollections: ${docs}`);
  const [files] = await getStorage(oldApp).bucket().getFiles();
  const mb = files.reduce((s, f) => s + Number(f.metadata.size || 0), 0) / 1048576;
  console.log(`Storage: ${files.length} objects, ${mb.toFixed(1)} MB`);
  let users = 0;
  let page: string | undefined;
  do {
    const r = await getAuth(oldApp).listUsers(1000, page);
    users += r.users.length;
    page = r.pageToken;
  } while (page);
  console.log(`Auth: ${users} users`);
}

/* ------------------------------------------------------------------ auth config */

async function copyAuthConfig() {
  const oc = await rest(OLD_KEY);
  const nc = await rest(NEW_KEY);
  // Firebase Auth must be initialised in the new project before its config can be written
  await nc.request({ url: `https://serviceusage.googleapis.com/v1/projects/${NEW}/services/identitytoolkit.googleapis.com:enable`, method: 'POST' });
  await nc.request({ url: `https://identitytoolkit.googleapis.com/v2/projects/${NEW}/identityPlatform:initializeAuth`, method: 'POST' }).catch(() => undefined);
  const cfg = (await oc.request<Record<string, any>>({ url: `${idt(OLD)}/config` })).data;
  const body = {
    signIn: {
      email: cfg.signIn?.email,
      phoneNumber: cfg.signIn?.phoneNumber,
      anonymous: cfg.signIn?.anonymous,
      allowDuplicateEmails: cfg.signIn?.allowDuplicateEmails ?? false,
    },
    authorizedDomains: NEW_DOMAINS,
    ...(cfg.smsRegionConfig ? { smsRegionConfig: cfg.smsRegionConfig } : {}),
  };
  const mask = ['signIn.email', 'signIn.phoneNumber', 'signIn.anonymous', 'signIn.allowDuplicateEmails', 'authorizedDomains', ...(cfg.smsRegionConfig ? ['smsRegionConfig'] : [])];
  await nc.request({ url: `${idt(NEW)}/config?updateMask=${mask.join(',')}`, method: 'PATCH', data: body });
  console.log('auth-config: sign-in methods', JSON.stringify({ email: !!cfg.signIn?.email?.enabled, phone: !!cfg.signIn?.phoneNumber?.enabled, anonymous: !!cfg.signIn?.anonymous?.enabled }), 'domains', NEW_DOMAINS.join(', '));
  return cfg.signIn?.hashConfig as { algorithm: string; signerKey: string; saltSeparator: string; rounds: number; memoryCost: number };
}

/* ------------------------------------------------------------------ auth users */

async function copyAuth(hash: { signerKey: string; saltSeparator: string; rounds: number; memoryCost: number }) {
  const scrypt: UserImportRecord[] = [];
  const bcrypt: UserImportRecord[] = [];
  let page: string | undefined;
  do {
    const r = await getAuth(oldApp).listUsers(1000, page);
    for (const u of r.users) {
      const rec: UserImportRecord = {
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        phoneNumber: u.phoneNumber,
        displayName: u.displayName,
        photoURL: u.photoURL,
        disabled: u.disabled,
        customClaims: u.customClaims,
        metadata: { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime ?? undefined },
        providerData: u.providerData
          .filter((p) => p.providerId !== 'password' && p.providerId !== 'phone')
          .map((p) => ({ uid: p.uid, providerId: p.providerId, email: p.email, displayName: p.displayName, photoURL: p.photoURL })),
      };
      const raw = u.passwordHash ? Buffer.from(u.passwordHash, 'base64') : null;
      if (raw && raw.toString('latin1').startsWith('$2')) bcrypt.push({ ...rec, passwordHash: raw });
      else if (raw) scrypt.push({ ...rec, passwordHash: raw, passwordSalt: u.passwordSalt ? Buffer.from(u.passwordSalt, 'base64') : undefined });
      else scrypt.push(rec);
    }
    page = r.pageToken;
  } while (page);
  const run = async (list: UserImportRecord[], opts: Parameters<ReturnType<typeof getAuth>['importUsers']>[1]) => {
    let ok = 0;
    for (let i = 0; i < list.length; i += 1000) {
      const res = await getAuth(newApp).importUsers(list.slice(i, i + 1000), opts);
      ok += res.successCount;
      res.errors.forEach((e) => console.warn(`  auth import error uid=${list[i + e.index].uid}: ${e.error.message}`));
    }
    return ok;
  };
  const a = await run(scrypt, {
    hash: { algorithm: 'SCRYPT', key: Buffer.from(hash.signerKey, 'base64'), saltSeparator: Buffer.from(hash.saltSeparator, 'base64'), rounds: hash.rounds, memoryCost: hash.memoryCost },
  });
  const b = bcrypt.length ? await run(bcrypt, { hash: { algorithm: 'BCRYPT' } }) : 0;
  console.log(`auth: imported ${a + b} of ${scrypt.length + bcrypt.length} users (${bcrypt.length} with BCRYPT hashes)`);
}

/* ------------------------------------------------------------------ firestore */

function rewrite(v: unknown, db: Firestore): unknown {
  if (typeof v === 'string') {
    return v
      .replace(/https?:\/\/(127\.0\.0\.1|localhost):9199\//g, 'https://firebasestorage.googleapis.com/') // emulator URLs in the snapshot
      .split(OLD_BUCKET)
      .join(NEW_BUCKET)
      .split(`${OLD}.appspot.com`)
      .join(NEW_BUCKET);
  }
  if (v instanceof DocumentReference) return db.doc(v.path);
  if (Array.isArray(v)) return v.map((x) => rewrite(x, db));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, rewrite(x, db)]));
  }
  return v; // Timestamp, GeoPoint, Bytes, null, numbers, booleans
}

async function copyFirestore(src: Firestore = oldDb) {
  const writer = newDb.bulkWriter();
  let n = 0;
  const walk = async (cols: FirebaseFirestore.CollectionReference[]) => {
    for (const c of cols) {
      const snap = await c.get();
      for (const d of snap.docs) {
        writer.set(newDb.doc(d.ref.path), rewrite(d.data(), newDb) as FirebaseFirestore.DocumentData);
        n++;
        if (n % 500 === 0) console.log(`  firestore: ${n} documents queued`);
        await walk(await d.ref.listCollections());
      }
    }
  };
  await walk(await src.listCollections());
  await writer.close();
  console.log(`firestore: copied ${n} documents`);
}

/* ------------------------------------------------------------------ storage */

async function copyStorage() {
  const src = getStorage(oldApp).bucket();
  const dst = getStorage(newApp).bucket();
  const [files] = await src.getFiles();
  let done = 0;
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const [buf] = await f.download();
      await dst.file(f.name).save(buf, {
        resumable: false,
        metadata: { contentType: f.metadata.contentType, cacheControl: f.metadata.cacheControl, metadata: f.metadata.metadata },
      });
      if (++done % 100 === 0) console.log(`  storage: ${done}/${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`storage: copied ${done} objects`);
}

/* ------------------------------------------------------------------ snapshot (emulator-data) */

const SNAP = new URL('./emulator-data/', import.meta.url);

async function seedStorage() {
  const dir = new URL('storage_export/', SNAP);
  const dst = getStorage(newApp).bucket();
  const metas = readdirSync(new URL('metadata/', dir)).filter((f) => f.endsWith('.json'));
  let done = 0;
  const queue = [...metas];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const m = JSON.parse(readFileSync(new URL(`metadata/${f}`, dir), 'utf8'));
      const buf = readFileSync(new URL(`blobs/${f.replace(/\.json$/, '')}`, dir));
      await dst.file(m.name).save(buf, {
        resumable: false,
        metadata: {
          contentType: m.contentType,
          cacheControl: m.cacheControl,
          metadata: { ...(m.customMetadata ?? {}), ...(m.downloadTokens?.length ? { firebaseStorageDownloadTokens: m.downloadTokens.join(',') } : {}) },
        },
      });
      if (++done % 100 === 0) console.log(`  storage: ${done}/${metas.length}`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`storage: uploaded ${done} objects from the snapshot`);
}

/** Snapshot users carry emulator "fakeHash:...:password=<plain>" hashes: import the accounts, then set those passwords. */
async function seedAuth() {
  const users = JSON.parse(readFileSync(new URL('auth_export/accounts.json', SNAP), 'utf8')).users as Record<string, any>[];
  const recs: UserImportRecord[] = users.map((u) => ({
    uid: u.localId,
    email: u.email,
    emailVerified: !!u.emailVerified,
    phoneNumber: u.phoneNumber,
    displayName: u.displayName,
    photoURL: u.photoUrl,
    disabled: !!u.disabled,
    customClaims: u.customAttributes ? JSON.parse(u.customAttributes) : undefined,
    metadata: { creationTime: u.createdAt ? new Date(Number(u.createdAt)).toUTCString() : undefined, lastSignInTime: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toUTCString() : undefined },
  }));
  const auth = getAuth(newApp);
  const res = await auth.importUsers(recs);
  res.errors.forEach((e) => console.warn(`  auth import error uid=${recs[e.index].uid}: ${e.error.message}`));
  let pw = 0;
  for (const u of users) {
    const plain = /:password=(.*)$/.exec(u.passwordHash ?? '')?.[1];
    if (plain) {
      await auth.updateUser(u.localId, { password: plain });
      pw++;
    }
  }
  console.log(`auth: imported ${res.successCount} of ${users.length} users, ${pw} with their demo passwords`);
}

/* ------------------------------------------------------------------ main */

const args = process.argv.slice(2);
(async () => {
  if (args.includes('--count')) return count();
  if (args.includes('--seed-snapshot')) {
    const parts = args.filter((a) => !a.startsWith('--'));
    const want = (p: string) => !parts.length || parts.includes(p);
    if (want('auth')) await seedAuth();
    if (want('storage')) await seedStorage();
    if (want('firestore')) {
      const snapApp = initializeApp({ credential: cert(keyOf(OLD_KEY)), projectId: OLD }, 'snapshot');
      const snapDb = getFirestore(snapApp);
      snapDb.settings({ host: '127.0.0.1:8080', ssl: false });
      await copyFirestore(snapDb);
    }
    return;
  }
  if (!args.includes('--copy')) throw new Error('usage: --count | --copy [auth-config auth firestore storage]');
  const parts = args.filter((a) => !a.startsWith('--'));
  const want = (p: string) => !parts.length || parts.includes(p);
  let hash: Awaited<ReturnType<typeof copyAuthConfig>> | undefined;
  if (want('auth-config') || want('auth')) hash = await copyAuthConfig();
  if (want('auth')) await copyAuth(hash!);
  if (want('storage')) await copyStorage();
  if (want('firestore')) await copyFirestore();
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.response?.data ?? e);
    process.exit(1);
  });
