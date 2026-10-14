/**
 * Online payment hand-off for the payloads returned by `placeOrder` / `walletRecharge`:
 *  - Razorpay: Checkout.js modal (order_id + key) → verify with razorpay_* fields
 *  - Stripe:   Stripe.js Payment Element (client_secret + publishable key) → verify with payment_intent_id
 *  - Cashfree: JS SDK v3 checkout (payment_session_id) → returns to return_url
 *  - Paystack / PayPal / PhonePe / PayTabs / Midtrans: `redirect_url` → gateway page → return_url
 * Redirect flows remember the pending payment in sessionStorage; the return page calls `resume*` which runs
 * `verifyPayment` / `verifyWalletRecharge` with the query parameters the gateway appended.
 */
import { api } from './api';
import type { Id, PaymentPayload } from './types';

const PENDING = 'sb-pending-payment';

interface Pending {
  kind: 'order' | 'wallet';
  id: string;
  number?: string;
  gateway: string;
}

function remember(p: Pending) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
function recall(kind: Pending['kind']): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null') as Pending | null;
    return p && p.kind === kind ? p : null;
  } catch {
    return null;
  }
}
function forget() {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection.'));
    document.head.appendChild(s);
  });
}

type Verify = (payload: Record<string, unknown>) => Promise<unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function razorpay(p: PaymentPayload, verify: Verify): Promise<boolean> {
  return loadScript('https://checkout.razorpay.com/v1/checkout.js').then(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const extra = (p.extra || {}) as Any;
        const rzp = new (window as Any).Razorpay({
          key: p.public_key,
          order_id: p.gateway_order_id,
          amount: Math.round((p.amount || 0) * 100),
          currency: p.currency,
          name: extra.name || 'QwikMart',
          prefill: extra.prefill || {},
          theme: { color: extra.theme_color || '#0E9623' },
          handler: (r: Any) => verify({ ...r, gateway: 'razorpay' }).then(() => resolve(true), reject),
          modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
        });
        rzp.open();
      }),
  );
}

async function stripe(p: PaymentPayload, verify: Verify, returnUrl: string): Promise<boolean> {
  await loadScript('https://js.stripe.com/v3/');
  const s = (window as Any).Stripe(p.public_key);
  const elements = s.elements({ clientSecret: p.client_secret });
  return new Promise<boolean>((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px');
    const box = document.createElement('div');
    box.setAttribute('style', 'background:#fff;color:#111827;border-radius:14px;max-width:440px;width:100%;padding:20px;font-family:inherit');
    box.innerHTML = `<div style="font-weight:700;margin-bottom:12px">Pay ${p.currency ?? ''} ${p.amount ?? ''}</div><div id="sb-stripe-el"></div><div id="sb-stripe-err" style="color:#DC2626;font-size:13px;margin-top:8px"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button id="sb-stripe-cancel" style="padding:8px 14px;border:1px solid #E6EAF2;border-radius:10px">Cancel</button><button id="sb-stripe-pay" style="padding:8px 14px;border-radius:10px;background:#0E9623;color:#fff;font-weight:600">Pay now</button></div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    elements.create('payment').mount('#sb-stripe-el');
    const close = () => overlay.remove();
    box.querySelector('#sb-stripe-cancel')!.addEventListener('click', () => {
      close();
      reject(new Error('Payment cancelled.'));
    });
    box.querySelector('#sb-stripe-pay')!.addEventListener('click', async () => {
      const res = await s.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (res.error) {
        box.querySelector('#sb-stripe-err')!.textContent = res.error.message || 'Payment failed.';
        return;
      }
      close();
      verify({ payment_intent_id: res.paymentIntent?.id, gateway: 'stripe' }).then(() => resolve(true), reject);
    });
  });
}

async function cashfree(p: PaymentPayload): Promise<boolean> {
  await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
  const { publicSettings } = await import('./fb/catalog');
  const s = await publicSettings().catch(() => ({}) as Any);
  const mode = (s.payment_methods || []).find((m: Any) => m.key === 'cashfree')?.mode === 'live' ? 'production' : 'sandbox';
  await (window as Any).Cashfree({ mode }).checkout({ paymentSessionId: p.client_secret, redirectTarget: '_self' });
  return false;
}

/** Runs the gateway step. Resolves true when the payment was completed and verified in-page, false on redirect. */
async function handOff(p: PaymentPayload, pending: Pending, verify: Verify, returnUrl: string): Promise<boolean> {
  remember(pending);
  if (p.gateway === 'razorpay' && p.public_key && p.gateway_order_id) return razorpay(p, verify).finally(forget);
  if (p.gateway === 'stripe' && p.public_key && p.client_secret) return stripe(p, verify, returnUrl).finally(forget);
  if (p.gateway === 'cashfree' && p.client_secret) return cashfree(p);
  if (p.redirect_url) {
    window.location.href = p.redirect_url;
    return false;
  }
  forget();
  throw new Error('This payment method cannot be completed on the website. Please choose another one.');
}

/** Order payment after placeOrder. */
export function payOrder(order: { id: Id; order_number: string }, payment: PaymentPayload): Promise<boolean> {
  const returnUrl = `${window.location.origin}/checkout/success?pay=1`;
  return handOff(payment, { kind: 'order', id: String(order.id), number: order.order_number, gateway: payment.gateway }, (payload) => api.verifyPayment(order.id, { ...payload, gateway: payment.gateway }), returnUrl);
}

/** Wallet top-up after walletRecharge. */
export function payWalletRecharge(payment: PaymentPayload | null, rechargeId: string | null): Promise<boolean> {
  if (!payment || !rechargeId) return Promise.reject(new Error('Payment could not be started. Please try again.'));
  const returnUrl = `${window.location.origin}/wallet?recharge_return=1`;
  return handOff(payment, { kind: 'wallet', id: rechargeId, gateway: payment.gateway }, (payload) => api.verifyWalletRecharge(rechargeId, payload), returnUrl);
}

const queryPayload = (params: URLSearchParams) => {
  const out: Record<string, unknown> = {};
  params.forEach((v, k) => {
    if (k !== 'pay' && k !== 'recharge_return') out[k] = v;
  });
  return out;
};

/** Return page of a redirect gateway (order). Returns the pending order, or null when there is nothing to verify. */
export async function resumeOrderPayment(params: URLSearchParams): Promise<{ id: string; number?: string } | null> {
  const p = recall('order');
  if (!p) return null;
  try {
    await api.verifyPayment(p.id, { ...queryPayload(params), gateway: p.gateway });
  } finally {
    forget();
  }
  return { id: p.id, number: p.number };
}

/** Return page of a redirect gateway (wallet recharge). */
export async function resumeWalletRecharge(params: URLSearchParams): Promise<string | null> {
  const p = recall('wallet');
  if (!p) return null;
  try {
    const r = await api.verifyWalletRecharge(p.id, { ...queryPayload(params), gateway: p.gateway });
    return r.message || 'Wallet recharged';
  } finally {
    forget();
  }
}
