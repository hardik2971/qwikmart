/** Website "Contact us" form: submitContactMessage → contact_messages/{id} + e-mail to support (and an acknowledgement). */
import { createHash } from 'node:crypto';
import { db, fail, invalid, logger, now, oneOf, open, publicSettings, str } from '../shared/firebase';
import { sendEmail } from '../services/notify';

export const CONTACT_TOPICS = ['order', 'payment', 'delivery', 'return', 'account', 'partner', 'feedback', 'other'] as const;
const TOPIC_LABEL: Record<(typeof CONTACT_TOPICS)[number], string> = {
  order: 'Order issue', payment: 'Payment / refund', delivery: 'Delivery', return: 'Return / replacement', account: 'Account / login',
  partner: 'Sell or deliver with us', feedback: 'Feedback / suggestion', other: 'Other',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMIT_PER_HOUR = 5;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** At most LIMIT_PER_HOUR messages per caller (uid, else IP) per hour. */
async function rateLimit(key: string) {
  const ref = db.doc(`rate_limits/contact_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`);
  const hour = Math.floor(Date.now() / 3_600_000);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const count = s.exists && s.get('hour') === hour ? Number(s.get('count') ?? 0) : 0;
    if (count >= LIMIT_PER_HOUR) fail('resource-exhausted', 'You have sent several messages already. Please wait a while and try again.');
    tx.set(ref, { hour, count: count + 1, updated_at: now() });
  });
}

export const submitContactMessage = open(async (data: Record<string, unknown>, ctx) => {
  // honeypot: bots fill every field; pretend success
  if (str(data.website, 'website', { max: 200 })) return { ok: true };
  const name = str(data.name, 'name', { required: true, max: 80 });
  const email = str(data.email, 'email', { required: true, max: 120 }).toLowerCase();
  if (!EMAIL_RE.test(email)) invalid('Please enter a valid e-mail address.', { field: 'email' });
  const phone = str(data.phone, 'phone', { max: 20 });
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) invalid('Please enter a valid phone number.', { field: 'phone' });
  const topic = oneOf(data.topic, 'topic', CONTACT_TOPICS, 'other');
  const orderNo = str(data.order_no, 'order_no', { max: 40 });
  const message = str(data.message, 'message', { required: true, max: 2000 });
  if (message.length < 10) invalid('Please tell us a little more (at least 10 characters).', { field: 'message' });

  const ip = String(ctx?.raw.rawRequest?.ip ?? '');
  await rateLimit(ip ? `ip:${ip}` : `uid:${ctx?.uid ?? 'anonymous'}`);

  const ref = await db.collection('contact_messages').add({
    name, email, phone: phone || null, topic, order_no: orderNo || null, message,
    user_id: ctx?.uid ?? null, source: oneOf(data.source, 'source', ['website', 'app'] as const, 'website'),
    status: 'new', ip_hash: ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : null,
    created_at: now(), updated_at: now(),
  });
  const ticket = `QM-${ref.id.slice(0, 6).toUpperCase()}`;
  await ref.update({ ticket });

  const s = await publicSettings();
  const app = s.app_name ?? 'QwikMart';
  const support = (s as { support?: { email?: string } }).support?.email;
  const rows: [string, string][] = [['Ticket', ticket], ['Name', name], ['E-mail', email], ['Phone', phone || '—'], ['Topic', TOPIC_LABEL[topic]], ['Order no.', orderNo || '—']];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
  const body = `<p style="white-space:pre-wrap;border-left:3px solid #0E9623;padding-left:12px">${esc(message)}</p>`;
  // e-mail failures (SMTP not configured) never fail the request — the message is stored for Admin → Contact messages
  await Promise.all([
    sendEmail(support, `[${app}] ${TOPIC_LABEL[topic]} — ${name} (${ticket})`, `<h3>New contact message</h3><table>${table}</table>${body}`, { template: 'contact_admin' }),
    sendEmail(email, `We received your message (${ticket})`,
      `<p>Hi ${esc(name)},</p><p>Thanks for contacting ${esc(app)}. Your ticket number is <b>${ticket}</b>. Our support team replies within 24 hours (usually much sooner).</p>${body}<p>— Team ${esc(app)}</p>`,
      { template: 'contact_ack' }),
  ]).catch((e) => logger.warn('contact mail failed', String(e)));
  return { ok: true, ticket };
});
