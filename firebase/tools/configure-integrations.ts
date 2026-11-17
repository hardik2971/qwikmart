/**
 * Writes payment gateway, SMTP and phone-auth settings for qwikmart-infidec from ../../secret/.env.
 *
 *   npx tsx configure-integrations.ts            write settings (secrets only to settings/private_*)
 *   npx tsx configure-integrations.ts --check    also create a ₹1 test order/intent at each enabled gateway
 *
 * .env keys: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID,
 * PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live), MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS.
 * A gateway is enabled only when both its keys are present; mode follows the key type (rzp_test / pk_test / sandbox).
 * Phone OTP sends real SMS: Firebase refuses test numbers that already belong to a user (e.g. the seeded demo customer).
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'qwikmart-infidec';
const KEY = new URL('../../secret/qwikmart-infidec-firebase.json', import.meta.url);
const ENV = new URL('../../secret/.env', import.meta.url);

const env: Record<string, string> = Object.fromEntries(
  readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, 'utf8'))), projectId: PROJECT });
const db = getFirestore(app);
const keyPath = KEY.pathname.replace(/^\/([A-Za-z]:)/, '$1');

const gateways = {
  razorpay: { key: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET, mode: env.RAZORPAY_KEY_ID?.startsWith('rzp_live') ? 'live' : 'sandbox' },
  stripe: { key: env.STRIPE_PUBLISHABLE_KEY, secret: env.STRIPE_SECRET_KEY, mode: env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live') ? 'live' : 'sandbox' },
  paypal: { client_id: env.PAYPAL_CLIENT_ID, secret: env.PAYPAL_CLIENT_SECRET, mode: env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox' },
} as const;
const publicKey = { razorpay: gateways.razorpay.key, stripe: gateways.stripe.key, paypal: gateways.paypal.client_id };
// orders are charged in the store currency; PayPal rejects INR for non-Indian accounts (CURRENCY_NOT_SUPPORTED)
const UNSUPPORTED: Record<string, string[]> = { paypal: ['INR'] };
let storeCurrency = 'INR';
const hasKeys = (g: keyof typeof gateways) => Object.entries(gateways[g]).every(([, v]) => !!v);
const ready = (g: keyof typeof gateways) => hasKeys(g) && !(UNSUPPORTED[g] ?? []).includes(storeCurrency);

async function payments() {
  storeCurrency = String((await db.doc('settings/public').get()).get('currency_code') ?? 'INR').toUpperCase();
  for (const g of Object.keys(gateways) as Array<keyof typeof gateways>) {
    if (hasKeys(g) && !ready(g)) console.log(`payments: ${g} left off — it cannot charge ${storeCurrency}`);
  }
  const priv: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
  for (const [name, cfg] of Object.entries(gateways)) {
    for (const [k, v] of Object.entries(cfg)) priv[`${name}_${k}`] = v ?? '';
    priv[`${name}_enabled`] = ready(name as keyof typeof gateways);
  }
  await db.doc('settings/private_payment').set(priv, { merge: true });

  const pubRef = db.doc('settings/public');
  const methods = ((await pubRef.get()).get('payment_methods') ?? []) as Array<Record<string, unknown>>;
  const next = methods.map((m) => {
    const name = m.key as keyof typeof gateways;
    if (!(name in gateways)) return m;
    return { ...m, enabled: ready(name), mode: gateways[name].mode, public_key: ready(name) ? publicKey[name] : null };
  });
  await pubRef.update({ payment_methods: next, updated_at: FieldValue.serverTimestamp() });
  console.log('payments:', next.filter((m) => m.enabled).map((m) => `${m.key}${m.mode ? ` (${m.mode})` : ''}`).join(', '));
}

async function smtp() {
  const port = Number(env.MAIL_PORT || 587);
  await db.doc('settings/private_smtp').set(
    {
      mailer: 'smtp',
      host: env.MAIL_HOST,
      port,
      username: env.MAIL_USERNAME,
      password: env.MAIL_PASSWORD,
      encryption: port === 465 ? 'ssl' : 'tls',
      secure: port === 465,
      from_email: env.MAIL_FROM_ADDRESS || env.MAIL_USERNAME,
      from_name: 'QwikMart',
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`smtp: ${env.MAIL_HOST}:${port} as ${env.MAIL_USERNAME?.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
}

/** Phone OTP: allow SMS to India (the default policy blocks it). */
async function phoneAuth() {
  const c = await new GoogleAuth({ keyFile: keyPath, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  await c.request({
    url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=smsRegionConfig,signIn.phoneNumber.enabled`,
    method: 'PATCH',
    data: {
      smsRegionConfig: { allowlistOnly: { allowedRegions: ['IN'] } },
      signIn: { phoneNumber: { enabled: true } },
    },
  });
  console.log('phone auth: SMS allowed for IN');
}

/** ₹1 test order at each enabled gateway, straight against its API (sandbox keys). */
async function check() {
  const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
  if (ready('razorpay')) {
    const r = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: basic(gateways.razorpay.key!, gateways.razorpay.secret!), 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 100, currency: 'INR', receipt: 'config-check' }) });
    console.log('check razorpay INR:', r.status, r.ok ? 'ok' : (await r.json()).error?.description);
  }
  if (ready('stripe')) {
    const r = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { Authorization: `Bearer ${gateways.stripe.secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ amount: '5000', currency: 'inr', 'automatic_payment_methods[enabled]': 'true' }) });
    const b = await r.json();
    console.log('check stripe INR:', r.status, r.ok ? 'ok' : b.error?.message);
    if (r.ok) await fetch(`https://api.stripe.com/v1/payment_intents/${b.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${gateways.stripe.secret}` } });
  }
  if (ready('paypal')) {
    const base = gateways.paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const t = await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: basic(gateways.paypal.client_id!, gateways.paypal.secret!), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }).then((r) => r.json());
    const r = await fetch(`${base}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'INR', value: '10.00' } }] }) });
    const b = await r.json();
    console.log('check paypal INR:', r.status, r.ok ? 'ok' : `${b.name}: ${b.details?.[0]?.issue ?? b.message}`);
  }
}

(async () => {
  await payments();
  await smtp();
  await phoneAuth();
  if (process.argv.includes('--check')) await check();
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.response?.data ?? e);
    process.exit(1);
  });
