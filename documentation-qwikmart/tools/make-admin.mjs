// QwikMart — create (or promote) the first Super Admin account in YOUR Firebase project.
//
// How to use (see the User Guide, Step 6):
//   1. Copy this file into the folder  firebase/functions/
//   2. Put your service-account key (Firebase console → Project settings → Service accounts →
//      "Generate new private key") into the same folder, e.g. as  admin-key.json
//   3. In a terminal, inside firebase/functions, run:
//        node make-admin.mjs admin-key.json you@yourbrand.com "YourStrongPassword" "Your Name"
//   4. Sign in at  https://<your-admin-site>.web.app/admin/login
//   5. DELETE admin-key.json afterwards — it gives full access to your project.
//
// Running it again for an existing email keeps the account and only makes it an admin
// (the password argument is then ignored).

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , keyFile, emailArg, password, nameArg] = process.argv;
if (!keyFile || !emailArg || !password) {
  console.log('Usage: node make-admin.mjs <service-account-key.json> <email> <password> ["Full Name"]');
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const name = (nameArg || 'Super Admin').trim();
if (password.length < 8) {
  console.log('Please use a password with at least 8 characters.');
  process.exit(1);
}

const key = JSON.parse(readFileSync(keyFile, 'utf8'));
initializeApp({ credential: cert(key), projectId: key.project_id });
const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`Found existing account ${email} — making it a Super Admin.`);
} catch {
  user = await auth.createUser({ email, password, displayName: name, emailVerified: true });
  console.log(`Created account ${email}.`);
}

const words = [...new Set([...name.toLowerCase().split(/\s+/), email, email.split('@')[0]].filter(Boolean))];
await db.doc(`users/${user.uid}`).set(
  {
    type: 'admin',
    name,
    email,
    phone: null,
    avatar: null,
    status: 'active',
    language: 'en',
    wallet_balance: 0,
    orders_count: 0,
    total_spent: 0,
    fcm_tokens: [],
    search_keywords: words,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
await auth.setCustomUserClaims(user.uid, { role: 'admin' });

console.log(`Done. ${email} is now a Super Admin of project "${key.project_id}".`);
console.log('Sign in at https://<your-admin-site>.web.app/admin/login — then delete your key file.');
process.exit(0);
