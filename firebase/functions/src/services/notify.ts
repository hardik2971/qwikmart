/** Notifications: in-app (users/{uid}/notifications), FCM push, SMTP email, SMS gateways. */
import type * as Nodemailer from 'nodemailer';
// nodemailer is loaded lazily (only when an email is sent) to keep cold starts / deploy discovery fast.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = { createTransport: (...a: Parameters<typeof Nodemailer.createTransport>) => (require('nodemailer') as typeof Nodemailer).createTransport(...a) };
import { db, FieldValue, IS_EMULATOR, logger, messaging, now, privateSettings, publicSettings } from '../shared/firebase';
import type { PrivateSmsSettings } from '../shared/types';
import { chunk, uniq } from '../shared/util';

export interface NotifyData { type?: string; image?: string | null; [k: string]: unknown }

/** Store an in-app notification and push it to the user's devices. Never throws. */
export async function notifyUser(uid: string | null | undefined, title: string, message: string, data: NotifyData = {}): Promise<void> {
  if (!uid) return;
  try {
    const { type = 'default', image = null, ...rest } = data;
    await db.collection(`users/${uid}/notifications`).add({ title, message, type, data: rest, image, read_at: null, created_at: now() });
    await pushToUsers([uid], title, message, { type, ...rest });
  } catch (e) {
    logger.warn('notifyUser failed', { uid, error: String(e) });
  }
}

/** FCM to every token of the given users; prunes invalid tokens. Skipped in the emulator unless FCM_IN_EMULATOR=1. */
export async function pushToUsers(uids: string[], title: string, body: string, data: Record<string, unknown> = {}, image?: string | null): Promise<number> {
  const ids = uniq(uids.filter(Boolean));
  if (!ids.length) return 0;
  const snaps = await db.getAll(...ids.map((u) => db.doc(`users/${u}`)));
  const owners = new Map<string, string>();
  for (const s of snaps) for (const t of ((s.get('fcm_tokens') as string[] | undefined) ?? [])) if (t) owners.set(t, s.id);
  return pushToTokens(owners, title, body, data, image);
}

export async function pushToTokens(owners: Map<string, string>, title: string, body: string, data: Record<string, unknown> = {}, image?: string | null): Promise<number> {
  const tokens = [...owners.keys()];
  if (!tokens.length) return 0;
  if (IS_EMULATOR && process.env.FCM_IN_EMULATOR !== '1') {
    logger.info('[FCM skipped in emulator]', { title, tokens: tokens.length });
    return 0;
  }
  const strData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) strData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  let sent = 0;
  for (const batch of chunk(tokens, 500)) {
    try {
      const res = await messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body, ...(image ? { imageUrl: image } : {}) },
        data: strData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'qwikmart_default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      sent += res.successCount;
      const bad: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) bad.push(batch[i]);
      });
      for (const t of bad) {
        const uid = owners.get(t);
        if (uid) await db.doc(`users/${uid}`).update({ fcm_tokens: FieldValue.arrayRemove(t) }).catch(() => undefined);
      }
    } catch (e) {
      logger.warn('FCM send failed', String(e));
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ email */
let transport: { key: string; t: Nodemailer.Transporter } | null = null;

export interface SmtpConfig {
  host: string | null; port: number; secure: boolean; ignoreTLS: boolean; username: string | null; password: string | null;
  from_email: string | null; from_name: string | null;
}

/**
 * Resolve settings/private_smtp. Canonical keys are the ones the admin Settings page writes
 * (`host, port, username, password, encryption, secure, from_email, from_name`); the Laravel names
 * (`mail_host, mail_port, mail_username, mail_password, mail_encryption, mail_from_address, mail_from_name`)
 * and `from_address` are accepted as fallbacks so old / hand-edited docs keep working.
 */
export function normalizeSmtp(raw: Record<string, unknown> | null | undefined): SmtpConfig {
  const s = raw ?? {};
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = s[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };
  const port = Number(pick('port', 'mail_port') ?? 587) || 587;
  const enc = (pick('encryption', 'mail_encryption') ?? '').toLowerCase();
  const secure = enc === 'ssl' || enc === 'smtps' ? true
    : enc === 'tls' || enc === 'starttls' || enc === 'none' || enc === 'null' ? false
      : typeof s.secure === 'boolean' ? s.secure : port === 465;
  const username = pick('username', 'mail_username');
  return {
    host: pick('host', 'mail_host'), port, secure, ignoreTLS: enc === 'none' || enc === 'null',
    username, password: pick('password', 'mail_password'),
    from_email: pick('from_email', 'from_address', 'mail_from_address') ?? username,
    from_name: pick('from_name', 'mail_from_name'),
  };
}

export async function smtpTransport(): Promise<{ t: Nodemailer.Transporter; from: string } | null> {
  const s = normalizeSmtp(await privateSettings<Record<string, unknown>>('smtp'));
  if (!s.host) return null;
  const key = JSON.stringify([s.host, s.port, s.username, s.password, s.secure, s.ignoreTLS]);
  if (!transport || transport.key !== key) {
    transport = {
      key,
      t: nodemailer.createTransport({
        host: s.host, port: s.port, secure: s.secure, ignoreTLS: s.ignoreTLS,
        auth: s.username ? { user: s.username, pass: s.password ?? '' } : undefined,
        connectionTimeout: 10_000,
      }),
    };
  }
  const app = (await publicSettings()).app_name ?? 'QwikMart';
  return { t: transport.t, from: `"${s.from_name ?? app}" <${s.from_email ?? ''}>` };
}

/** Send an email; returns false when SMTP is not configured or sending failed. Logs to mail_log. */
export async function sendEmail(to: string | null | undefined, subject: string, html: string, opts: { throwOnError?: boolean; template?: string } = {}): Promise<boolean> {
  if (!to) return false;
  const smtp = await smtpTransport();
  if (!smtp) {
    if (opts.throwOnError) throw new Error('SMTP is not configured. Add it in Settings → Email.');
    return false;
  }
  try {
    await smtp.t.sendMail({ from: smtp.from, to, subject, html });
    await db.collection('mail_log').add({ to, subject, template: opts.template ?? null, status: 'sent', created_at: now() });
    return true;
  } catch (e) {
    await db.collection('mail_log').add({ to, subject, template: opts.template ?? null, status: 'failed', error: String(e), created_at: now() });
    if (opts.throwOnError) throw e;
    logger.warn('sendEmail failed', String(e));
    return false;
  }
}

/** Render an email template (email_templates/{key}: {subject, body}) with {{var}} placeholders. */
export async function sendTemplate(key: string, to: string | null | undefined, vars: Record<string, string | number>, fallback: { subject: string; body: string }): Promise<boolean> {
  if (!to) return false;
  const snap = await db.doc(`email_templates/${key}`).get();
  const tpl = snap.exists && snap.get('status') !== 'inactive' ? { subject: String(snap.get('subject') ?? fallback.subject), body: String(snap.get('body') ?? fallback.body) } : fallback;
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ''));
  return sendEmail(to, fill(tpl.subject), fill(tpl.body), { template: key });
}

/* ------------------------------------------------------------------ SMS */
/** Send a text via the configured gateway (settings/private_sms.gateway). Returns true on success. */
export async function sendSms(phone: string, text: string, otp?: string): Promise<boolean> {
  const s = await privateSettings<PrivateSmsSettings>('sms');
  const digits = phone.replace(/\D/g, '');
  try {
    switch (s.gateway || s.sms_gateway) {
      case 'twilio': {
        if (!s.twilio_sid || !s.twilio_token || !s.twilio_from) return false;
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${s.twilio_sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + Buffer.from(`${s.twilio_sid}:${s.twilio_token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: phone.startsWith('+') ? phone : `+${digits}`, From: s.twilio_from, Body: text }),
        });
        return res.ok;
      }
      case 'msg91': {
        if (!s.msg91_auth_key) return false;
        const url = otp && s.msg91_template_id
          ? `https://control.msg91.com/api/v5/otp?${new URLSearchParams({ template_id: s.msg91_template_id, mobile: digits, otp })}`
          : 'https://control.msg91.com/api/v5/flow';
        const res = await fetch(url, {
          method: 'POST', headers: { authkey: s.msg91_auth_key, 'Content-Type': 'application/json' },
          body: otp ? undefined : JSON.stringify({ template_id: s.msg91_template_id, recipients: [{ mobiles: digits, message: text }] }),
        });
        return res.ok;
      }
      case 'fast2sms': {
        if (!s.fast2sms_key) return false;
        const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST', headers: { authorization: s.fast2sms_key, 'Content-Type': 'application/json' },
          body: JSON.stringify(otp ? { route: 'otp', variables_values: otp, numbers: digits.slice(-10) } : { route: 'q', message: text, numbers: digits.slice(-10) }),
        });
        return res.ok;
      }
      case '2factor': {
        if (!s.twofactor_key) return false;
        const url = otp
          ? `https://2factor.in/API/V1/${s.twofactor_key}/SMS/${digits}/${otp}/${s.twofactor_template ?? 'OTP1'}`
          : `https://2factor.in/API/V1/${s.twofactor_key}/ADDON_SERVICES/SEND/TSMS`;
        const res = await fetch(url, otp ? {} : { method: 'POST', body: new URLSearchParams({ From: 'SNAPBY', To: digits, Msg: text }) });
        return res.ok;
      }
      default:
        logger.info(`[SMS:log] ${phone}: ${text}`);
        return true;
    }
  } catch (e) {
    logger.warn('sendSms failed', String(e));
    return false;
  }
}
