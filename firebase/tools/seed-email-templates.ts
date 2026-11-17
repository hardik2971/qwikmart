/**
 * Order email templates for qwikmart-infidec (source: functions/src/services/emailTemplates.ts).
 *
 *   npx tsx seed-email-templates.ts                       write email_templates/{key} (overwrites subject/body)
 *   npx tsx seed-email-templates.ts --preview <dir>       also render every template with sample data to <dir>/*.html
 *   npx tsx seed-email-templates.ts --send-test <email>   also send the sample "order placed" email through the SMTP
 *                                                         settings stored in settings/private_smtp
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { EMAIL_TEMPLATES, emailLayout, fillTemplate, orderRows } from '../functions/src/services/emailTemplates';

const KEY = new URL('../../secret/qwikmart-infidec-firebase.json', import.meta.url);
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, 'utf8'))), projectId: 'qwikmart-infidec' });
const db = getFirestore(app);
const args = process.argv.slice(2);
const arg = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

const rows = orderRows(
  [
    { name: 'Amul Taaza Toned Milk', variant_name: '500 ml', qty: 2, total: '₹54' },
    { name: 'Aashirvaad Shudh Chakki Atta', variant_name: '5 kg', qty: 1, total: '₹249' },
  ],
  [['Subtotal', '₹303'], ['Discount', '−₹25'], ['Delivery', 'Free'], ['Total', '₹278', true]],
);
const sample = {
  name: 'Aarav Sharma', email: 'aarav@example.com', order_number: 'QM-ORD-00042', order_total: '₹278', status: 'Received',
  store_name: 'Mumbai Store', payment_method: 'Razorpay', delivery_address: '12 Marine Drive, Mumbai 400002', otp: '4821',
  link: 'https://qwikmart-infidec.web.app/orders/sample', app_name: 'QwikMart', support_email: 'support@qwikmart.app',
  items: rows.items, summary: rows.summary,
};

(async () => {
  const batch = db.batch();
  for (const [key, t] of Object.entries(EMAIL_TEMPLATES)) {
    batch.set(db.doc(`email_templates/${key}`), { key, subject: t.subject, body: t.body, status: 'active', updated_at: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  console.log('email_templates written:', Object.keys(EMAIL_TEMPLATES).join(', '));

  const pub = (await db.doc('settings/public').get()).data() ?? {};
  const brand = { app_name: pub.app_name ?? 'QwikMart', logo: pub.logo ?? null, support_email: pub.support?.email ?? null, website: 'https://qwikmart-infidec.web.app' };
  const render = (key: string) => ({
    subject: fillTemplate(EMAIL_TEMPLATES[key].subject, sample),
    html: emailLayout(fillTemplate(EMAIL_TEMPLATES[key].body, sample), brand),
  });

  const dir = arg('--preview');
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const key of Object.keys(EMAIL_TEMPLATES)) writeFileSync(join(dir, `${key}.html`), render(key).html);
    console.log('previews written to', dir);
  }

  const to = arg('--send-test');
  if (to) {
    const s = (await db.doc('settings/private_smtp').get()).data() ?? {};
    const nodemailer = createRequire(new URL('../functions/package.json', import.meta.url))('nodemailer');
    const t = nodemailer.createTransport({ host: s.host, port: Number(s.port), secure: !!s.secure, auth: { user: s.username, pass: s.password } });
    const mail = render('order_placed');
    const info = await t.sendMail({ from: `"${s.from_name ?? 'QwikMart'}" <${s.from_email ?? s.username}>`, to, subject: `[Test] ${mail.subject}`, html: mail.html });
    console.log('test email sent:', info.response);
  }
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
