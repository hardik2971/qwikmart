/**
 * Payment gateways (Laravel Services/Payments/*). Secrets live in settings/private_payment as `${gateway}_${key}`
 * (e.g. stripe_secret, razorpay_key, razorpay_secret, paystack_secret_key). Enabled flag + mode come from
 * settings/public.payment_methods[{key, enabled, mode}].
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger, privateSettings, publicSettings } from '../shared/firebase';
import type { PaymentPayload } from '../shared/types';

export interface CreateParams {
  amount: number; currency: string; reference: string; description?: string;
  customer: { name?: string | null; email?: string | null; phone?: string | null };
  return_url?: string | null; metadata?: Record<string, string>;
}
export interface VerifyResult { success: boolean; transaction_id: string | null; message?: string | null; raw?: unknown }

type Cfg = (key: string, fallback?: string) => string;

interface Gateway {
  name: string;
  requiredKeys: string[];
  publicConfig(cfg: Cfg): Record<string, unknown>;
  create(cfg: Cfg, p: CreateParams, live: boolean): Promise<PaymentPayload>;
  verify(cfg: Cfg, payload: Record<string, unknown>, live: boolean): Promise<VerifyResult>;
}

const minor = (a: number) => Math.round(a * 100);

async function http(url: string, init: RequestInit & { json?: unknown; form?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(init.json); }
  if (init.form) { headers.set('Content-Type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(init.form).toString(); }
  headers.set('Accept', 'application/json');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { ...init, headers, body, signal: ctrl.signal });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function gatewayError(name: string, ctx: string, res: { status: number; body: any }): never {
  logger.warn(`[Payment:${name}] ${ctx} failed`, { status: res.status, body: res.body });
  const b = res.body ?? {};
  const msg = b?.error?.message ?? b?.message ?? b?.error?.description ?? b?.error_description ?? 'request failed';
  throw new HttpsError('unavailable', `Payment gateway error: ${msg}`);
}

const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

/* ------------------------------------------------------------------ Stripe */
const stripe: Gateway = {
  name: 'stripe',
  requiredKeys: ['key', 'secret'],
  publicConfig: (cfg) => ({ publishable_key: cfg('key') }),
  async create(cfg, p) {
    const form: Record<string, string> = {
      amount: String(minor(p.amount)), currency: p.currency.toLowerCase(), description: p.description ?? p.reference,
      'automatic_payment_methods[enabled]': 'true', 'metadata[reference]': p.reference,
    };
    for (const [k, v] of Object.entries(p.metadata ?? {})) form[`metadata[${k}]`] = v;
    if (p.customer.email) form.receipt_email = p.customer.email;
    const res = await http('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { Authorization: `Bearer ${cfg('secret')}` }, form });
    if (!res.ok) gatewayError('stripe', 'create', res);
    return { gateway: 'stripe', reference: p.reference, gateway_order_id: res.body.id, client_secret: res.body.client_secret, redirect_url: null, public_key: cfg('key'), amount: p.amount, currency: p.currency.toUpperCase() };
  },
  async verify(cfg, payload) {
    const id = String(payload.payment_intent_id ?? payload.gateway_order_id ?? '');
    if (!id) return { success: false, transaction_id: null, message: 'Missing payment_intent_id' };
    const res = await http(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${cfg('secret')}` } });
    const ok = res.ok && res.body?.status === 'succeeded';
    return { success: ok, transaction_id: res.body?.latest_charge ?? id, message: res.body?.status, raw: res.body };
  },
};

/* ------------------------------------------------------------------ Razorpay */
const razorpay: Gateway = {
  name: 'razorpay',
  requiredKeys: ['key', 'secret'],
  publicConfig: (cfg) => ({ key_id: cfg('key') }),
  async create(cfg, p) {
    const res = await http('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { Authorization: basic(cfg('key'), cfg('secret')) },
      json: { amount: minor(p.amount), currency: p.currency.toUpperCase(), receipt: p.reference.slice(0, 40), notes: { reference: p.reference, ...(p.metadata ?? {}) } },
    });
    if (!res.ok) gatewayError('razorpay', 'create', res);
    const app = (await publicSettings()).app_name ?? 'QwikMart';
    return {
      gateway: 'razorpay', reference: p.reference, gateway_order_id: res.body.id, client_secret: null, redirect_url: null, public_key: cfg('key'),
      amount: p.amount, currency: p.currency.toUpperCase(), extra: { name: app, prefill: p.customer, theme_color: '#0E9623' },
    };
  },
  async verify(cfg, payload) {
    const orderId = String(payload.razorpay_order_id ?? payload.gateway_order_id ?? '');
    const paymentId = String(payload.razorpay_payment_id ?? '');
    const signature = String(payload.razorpay_signature ?? '');
    if (!orderId || !paymentId || !signature) return { success: false, transaction_id: null, message: 'Missing Razorpay fields' };
    const expected = createHmac('sha256', cfg('secret')).update(`${orderId}|${paymentId}`).digest('hex');
    const ok = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    return { success: ok, transaction_id: paymentId, message: ok ? 'verified' : 'Signature mismatch' };
  },
};

/* ------------------------------------------------------------------ Paystack */
const paystack: Gateway = {
  name: 'paystack',
  requiredKeys: ['public_key', 'secret_key'],
  publicConfig: (cfg) => ({ public_key: cfg('public_key') }),
  async create(cfg, p) {
    const reference = `${p.reference}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const res = await http('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg('secret_key')}` },
      json: {
        email: p.customer.email ?? `customer${(p.customer.phone ?? '').replace(/\D/g, '')}@qwikmart.app`, amount: minor(p.amount), currency: p.currency.toUpperCase(),
        reference, callback_url: p.return_url ?? undefined, metadata: { reference: p.reference, ...(p.metadata ?? {}) },
      },
    });
    if (!res.ok || !res.body?.status) gatewayError('paystack', 'initialize', res);
    return {
      gateway: 'paystack', reference: p.reference, gateway_order_id: res.body.data.reference, client_secret: res.body.data.access_code,
      redirect_url: res.body.data.authorization_url, public_key: cfg('public_key'), amount: p.amount, currency: p.currency.toUpperCase(),
    };
  },
  async verify(cfg, payload) {
    const ref = String(payload.reference ?? payload.gateway_order_id ?? '');
    if (!ref) return { success: false, transaction_id: null, message: 'Missing reference' };
    const res = await http(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${cfg('secret_key')}` } });
    const ok = res.ok && res.body?.data?.status === 'success';
    return { success: ok, transaction_id: String(res.body?.data?.id ?? ref), message: res.body?.data?.gateway_response, raw: res.body?.data };
  },
};

/* ------------------------------------------------------------------ PayPal */
const paypalBase = (live: boolean) => (live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
async function paypalToken(cfg: Cfg, live: boolean): Promise<string> {
  const res = await http(`${paypalBase(live)}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: basic(cfg('client_id'), cfg('secret')) }, form: { grant_type: 'client_credentials' } });
  if (!res.ok) gatewayError('paypal', 'oauth', res);
  return res.body.access_token;
}
const paypal: Gateway = {
  name: 'paypal',
  requiredKeys: ['client_id', 'secret'],
  publicConfig: (cfg) => ({ client_id: cfg('client_id'), mode: cfg('mode', 'sandbox') }),
  async create(cfg, p, live) {
    const token = await paypalToken(cfg, live);
    const res = await http(`${paypalBase(live)}/v2/checkout/orders`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      json: {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: p.reference, description: p.description ?? p.reference, amount: { currency_code: p.currency.toUpperCase(), value: p.amount.toFixed(2) } }],
        application_context: { brand_name: (await publicSettings()).app_name ?? 'QwikMart', return_url: p.return_url ?? undefined, cancel_url: p.return_url ?? undefined, user_action: 'PAY_NOW' },
      },
    });
    if (!res.ok) gatewayError('paypal', 'create', res);
    const approve = (res.body.links ?? []).find((l: { rel: string }) => l.rel === 'approve')?.href ?? null;
    return { gateway: 'paypal', reference: p.reference, gateway_order_id: res.body.id, redirect_url: approve, public_key: cfg('client_id'), amount: p.amount, currency: p.currency.toUpperCase() };
  },
  async verify(cfg, payload, live) {
    const id = String(payload.paypal_order_id ?? payload.token ?? payload.gateway_order_id ?? '');
    if (!id) return { success: false, transaction_id: null, message: 'Missing PayPal order id' };
    const token = await paypalToken(cfg, live);
    let res = await http(`${paypalBase(live)}/v2/checkout/orders/${id}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, json: {} });
    if (!res.ok) res = await http(`${paypalBase(live)}/v2/checkout/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const ok = res.ok && res.body?.status === 'COMPLETED';
    return { success: ok, transaction_id: res.body?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? id, message: res.body?.status, raw: res.body };
  },
};

/* ------------------------------------------------------------------ Cashfree */
const cfBase = (live: boolean) => (live ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');
const cfHeaders = (cfg: Cfg) => ({ 'x-client-id': cfg('app_id'), 'x-client-secret': cfg('secret'), 'x-api-version': '2023-08-01' });
const cashfree: Gateway = {
  name: 'cashfree',
  requiredKeys: ['app_id', 'secret'],
  publicConfig: (cfg) => ({ mode: cfg('mode', 'sandbox') === 'live' ? 'production' : 'sandbox' }),
  async create(cfg, p, live) {
    const orderId = `${p.reference.replace(/[^A-Za-z0-9_-]/g, '')}_${Math.floor(Date.now() / 1000)}`;
    const phone = (p.customer.phone ?? '9999999999').replace(/\D/g, '');
    const res = await http(`${cfBase(live)}/orders`, {
      method: 'POST', headers: cfHeaders(cfg),
      json: {
        order_id: orderId, order_amount: Math.round(p.amount * 100) / 100, order_currency: p.currency.toUpperCase(),
        customer_details: { customer_id: `cust_${phone || '0'}`, customer_name: p.customer.name ?? 'Customer', customer_email: p.customer.email ?? 'customer@snapbuy.app', customer_phone: phone.slice(-10) || '9999999999' },
        order_meta: p.return_url ? { return_url: p.return_url } : {},
      },
    });
    if (!res.ok) gatewayError('cashfree', 'create', res);
    return { gateway: 'cashfree', reference: p.reference, gateway_order_id: res.body.order_id, client_secret: res.body.payment_session_id, redirect_url: null, amount: p.amount, currency: p.currency.toUpperCase() };
  },
  async verify(cfg, payload, live) {
    const id = String(payload.cf_order_id ?? payload.gateway_order_id ?? '');
    if (!id) return { success: false, transaction_id: null, message: 'Missing order id' };
    const res = await http(`${cfBase(live)}/orders/${encodeURIComponent(id)}`, { headers: cfHeaders(cfg) });
    const ok = res.ok && res.body?.order_status === 'PAID';
    return { success: ok, transaction_id: String(res.body?.cf_order_id ?? id), message: res.body?.order_status, raw: res.body };
  },
};

/* ------------------------------------------------------------------ PhonePe */
const ppBase = (live: boolean) => (live ? 'https://api.phonepe.com/apis/hermes' : 'https://api-preprod.phonepe.com/apis/pg-sandbox');
const ppChecksum = (cfg: Cfg, payload: string) => createHash('sha256').update(payload + cfg('salt_key')).digest('hex') + '###' + cfg('salt_index', '1');
const phonepe: Gateway = {
  name: 'phonepe',
  requiredKeys: ['merchant_id', 'salt_key'],
  publicConfig: () => ({}),
  async create(cfg, p, live) {
    const txnId = (p.reference.replace(/[^A-Za-z0-9]/g, '') + Math.floor(Date.now() / 1000)).slice(0, 35);
    const phone = (p.customer.phone ?? '').replace(/\D/g, '');
    const body = Buffer.from(JSON.stringify({
      merchantId: cfg('merchant_id'), merchantTransactionId: txnId, merchantUserId: `MUID${phone || '0'}`, amount: minor(p.amount),
      redirectUrl: p.return_url ?? 'https://qwikmart.app', redirectMode: 'REDIRECT', callbackUrl: p.return_url ?? 'https://qwikmart.app',
      mobileNumber: phone.slice(-10), paymentInstrument: { type: 'PAY_PAGE' },
    })).toString('base64');
    const res = await http(`${ppBase(live)}/pg/v1/pay`, { method: 'POST', headers: { 'X-VERIFY': ppChecksum(cfg, body + '/pg/v1/pay') }, json: { request: body } });
    if (!res.ok || !res.body?.success) gatewayError('phonepe', 'create', res);
    return { gateway: 'phonepe', reference: p.reference, gateway_order_id: txnId, redirect_url: res.body?.data?.instrumentResponse?.redirectInfo?.url ?? null, amount: p.amount, currency: 'INR' };
  },
  async verify(cfg, payload, live) {
    const txn = String(payload.merchant_transaction_id ?? payload.gateway_order_id ?? '');
    if (!txn) return { success: false, transaction_id: null, message: 'Missing transaction id' };
    const path = `/pg/v1/status/${cfg('merchant_id')}/${txn}`;
    const res = await http(ppBase(live) + path, { headers: { 'X-VERIFY': ppChecksum(cfg, path), 'X-MERCHANT-ID': cfg('merchant_id') } });
    const ok = res.ok && res.body?.code === 'PAYMENT_SUCCESS';
    return { success: ok, transaction_id: res.body?.data?.transactionId ?? txn, message: res.body?.code, raw: res.body };
  },
};

/* ------------------------------------------------------------------ PayTabs */
const PT_HOSTS: Record<string, string> = {
  ARE: 'https://secure.paytabs.com', SAU: 'https://secure.paytabs.sa', OMN: 'https://secure-oman.paytabs.com',
  JOR: 'https://secure-jordan.paytabs.com', EGY: 'https://secure-egypt.paytabs.com', GLOBAL: 'https://secure-global.paytabs.com',
};
const ptBase = (cfg: Cfg) => PT_HOSTS[cfg('region', 'ARE').toUpperCase()] ?? PT_HOSTS.ARE;
const paytabs: Gateway = {
  name: 'paytabs',
  requiredKeys: ['profile_id', 'server_key'],
  publicConfig: () => ({}),
  async create(cfg, p) {
    const res = await http(`${ptBase(cfg)}/payment/request`, {
      method: 'POST', headers: { authorization: cfg('server_key') },
      json: {
        profile_id: Number(cfg('profile_id')), tran_type: 'sale', tran_class: 'ecom', cart_id: p.reference, cart_currency: p.currency.toUpperCase(),
        cart_amount: Math.round(p.amount * 100) / 100, cart_description: p.description ?? p.reference, return: p.return_url ?? 'https://qwikmart.app',
        customer_details: { name: p.customer.name ?? undefined, email: p.customer.email ?? undefined, phone: p.customer.phone ?? undefined },
      },
    });
    if (!res.ok || !res.body?.redirect_url) gatewayError('paytabs', 'create', res);
    return { gateway: 'paytabs', reference: p.reference, gateway_order_id: res.body.tran_ref, redirect_url: res.body.redirect_url, amount: p.amount, currency: p.currency.toUpperCase() };
  },
  async verify(cfg, payload) {
    const ref = String(payload.tran_ref ?? payload.tranRef ?? payload.gateway_order_id ?? '');
    if (!ref) return { success: false, transaction_id: null, message: 'Missing tran_ref' };
    const res = await http(`${ptBase(cfg)}/payment/query`, { method: 'POST', headers: { authorization: cfg('server_key') }, json: { profile_id: Number(cfg('profile_id')), tran_ref: ref } });
    const ok = res.ok && res.body?.payment_result?.response_status === 'A';
    return { success: ok, transaction_id: ref, message: res.body?.payment_result?.response_message, raw: res.body };
  },
};

/* ------------------------------------------------------------------ Midtrans */
const midtrans: Gateway = {
  name: 'midtrans',
  requiredKeys: ['server_key', 'client_key'],
  publicConfig: (cfg) => ({ client_key: cfg('client_key'), mode: cfg('mode', 'sandbox') }),
  async create(cfg, p, live) {
    const orderId = `${p.reference}-${Math.floor(Date.now() / 1000)}`;
    const snap = live ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
    const res = await http(`${snap}/snap/v1/transactions`, {
      method: 'POST', headers: { Authorization: basic(cfg('server_key'), '') },
      json: {
        transaction_details: { order_id: orderId, gross_amount: Math.round(p.amount) },
        customer_details: { first_name: p.customer.name ?? undefined, email: p.customer.email ?? undefined, phone: p.customer.phone ?? undefined },
        callbacks: p.return_url ? { finish: p.return_url } : undefined,
      },
    });
    if (!res.ok) gatewayError('midtrans', 'create', res);
    return { gateway: 'midtrans', reference: p.reference, gateway_order_id: orderId, client_secret: res.body.token, redirect_url: res.body.redirect_url, public_key: cfg('client_key'), amount: p.amount, currency: p.currency.toUpperCase() };
  },
  async verify(cfg, payload, live) {
    const id = String(payload.order_id ?? payload.gateway_order_id ?? '');
    if (!id) return { success: false, transaction_id: null, message: 'Missing order_id' };
    const api = live ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
    const res = await http(`${api}/v2/${encodeURIComponent(id)}/status`, { headers: { Authorization: basic(cfg('server_key'), '') } });
    const status = res.body?.transaction_status;
    const ok = res.ok && ['settlement', 'capture'].includes(status) && (res.body?.fraud_status ?? 'accept') === 'accept';
    return { success: ok, transaction_id: res.body?.transaction_id ?? id, message: status, raw: res.body };
  },
};

export const GATEWAYS: Record<string, Gateway> = { stripe, razorpay, paystack, paypal, cashfree, phonepe, paytabs, midtrans };
export const isOnlineMethod = (m: string) => m in GATEWAYS;

async function gatewayConfig(name: string): Promise<{ cfg: Cfg; enabled: boolean; live: boolean }> {
  const [pub, secrets] = await Promise.all([publicSettings(), privateSettings<Record<string, unknown>>('payment')]);
  const entry = (pub.payment_methods ?? []).find((m) => m.key === name);
  const cfg: Cfg = (key, fallback = '') => {
    if (key === 'mode') return String(entry?.mode ?? secrets[`${name}_mode`] ?? fallback);
    const v = secrets[`${name}_${key}`];
    return v === undefined || v === null || v === '' ? fallback : String(v);
  };
  const gw = GATEWAYS[name];
  const enabled = !!gw && !!entry?.enabled && gw.requiredKeys.every((k) => !!cfg(k));
  return { cfg, enabled, live: cfg('mode', 'sandbox') === 'live' };
}

/** cod / wallet / online gateway availability. */
export async function isMethodEnabled(method: string): Promise<boolean> {
  const pub = await publicSettings();
  const entry = (pub.payment_methods ?? []).find((m) => m.key === method);
  if (method === 'cod') return (pub.cod?.enabled ?? entry?.enabled ?? true) !== false;
  if (method === 'wallet') return entry ? entry.enabled !== false : true;
  if (!isOnlineMethod(method)) return false;
  return (await gatewayConfig(method)).enabled;
}

export async function createPayment(method: string, p: CreateParams): Promise<PaymentPayload> {
  const gw = GATEWAYS[method];
  if (!gw) throw new HttpsError('invalid-argument', `Unsupported payment method [${method}].`);
  const { cfg, enabled, live } = await gatewayConfig(method);
  if (!enabled) throw new HttpsError('failed-precondition', `${method[0].toUpperCase()}${method.slice(1)} payments are not configured.`);
  return gw.create(cfg, p, live);
}

/**
 * Client-supplied keys that name the gateway order/session. They are overwritten with the server-stored id so a client
 * cannot replay another (cheaper / already used) successful payment against this order or wallet recharge.
 */
const ID_KEYS: Record<string, string[]> = {
  stripe: ['payment_intent_id'], razorpay: ['razorpay_order_id'], paystack: ['reference'], paypal: ['paypal_order_id', 'token'],
  cashfree: ['cf_order_id'], phonepe: ['merchant_transaction_id'], paytabs: ['tran_ref', 'tranRef'], midtrans: ['order_id'],
};

/**
 * Verify a payment for the gateway order created by the server (`expectedGatewayOrderId`, stored on the order /
 * wallet_recharges doc). Fails closed when no server-side id is known.
 */
export async function verifyPayment(method: string, payload: Record<string, unknown>, expectedGatewayOrderId?: string | null): Promise<VerifyResult> {
  const gw = GATEWAYS[method];
  if (!gw) throw new HttpsError('invalid-argument', `Unsupported payment method [${method}].`);
  const expected = expectedGatewayOrderId ? String(expectedGatewayOrderId) : '';
  if (!expected) return { success: false, transaction_id: null, message: 'No payment session found for this order.' };
  const bound: Record<string, unknown> = { ...payload, gateway_order_id: expected };
  for (const k of ID_KEYS[method] ?? []) bound[k] = expected;
  const { cfg, live } = await gatewayConfig(method);
  return gw.verify(cfg, bound, live);
}

export async function publicGatewayConfig(method: string): Promise<Record<string, unknown>> {
  const gw = GATEWAYS[method];
  if (!gw) return {};
  return gw.publicConfig((await gatewayConfig(method)).cfg);
}
