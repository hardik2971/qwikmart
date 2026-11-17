/**
 * Default order email templates + the shared branded layout. Pure (no Firebase imports) so firebase/tools can seed
 * email_templates/{key} from the same source. Admins edit only the inner body in Admin → Email Templates; every email is
 * wrapped in emailLayout() at send time. Placeholders: {{var}} (the admin editor's {var} form is accepted too).
 *
 * Order variables (services/emails.ts → orderEmailVars): name, email, order_number, order_total, status, store_name,
 * payment_method, delivery_address, items (HTML rows), summary (HTML rows), otp, link, app_name, support_email.
 */

export interface EmailTemplate {
  subject: string;
  body: string;
}

const C = { night: '#0A1B4D', blue: '#1846D1', orange: '#F26411', ink: '#0B1B3F', body: '#3A4766', muted: '#637091', line: '#E1E7F2', soft: '#F4F6FB' };

/** Headline + one line of copy + optional highlighted box, shared by the order templates below. */
const intro = (title: string, text: string) =>
  `<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:${C.ink}">${title}</h1>` +
  `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${C.body}">${text}</p>`;

const button = (label: string) =>
  `<p style="margin:24px 0 8px"><a href="{{link}}" style="display:inline-block;background:${C.blue};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px">${label}</a></p>`;

/** Items + totals table; {{items}} and {{summary}} are pre-rendered rows. */
const orderTable =
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px;font-size:14px;color:${C.body}">` +
  `<tr><td colspan="2" style="padding:0 0 8px;font-size:13px;color:${C.muted}">Order <strong style="color:${C.ink}">{{order_number}}</strong></td></tr>` +
  `{{items}}{{summary}}</table>`;

const otpBox =
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:${C.soft};border:1px dashed ${C.orange};border-radius:14px;padding:14px 20px">` +
  `<div style="font-size:12px;color:${C.muted}">Delivery OTP — share it with the delivery partner only at your door</div>` +
  `<div style="font-size:28px;letter-spacing:6px;font-weight:800;color:${C.ink}">{{otp}}</div></td></tr></table>`;

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  order_placed: {
    subject: 'Order {{order_number}} placed — {{order_total}}',
    body:
      intro('Thanks for your order, {{name}}!', 'We have received your order and the store is getting it ready. We will email you again when it is on the way.') +
      orderTable +
      `<p style="margin:16px 0 0;font-size:13px;color:${C.muted}">Payment: {{payment_method}}<br>Deliver to: {{delivery_address}}</p>` +
      button('View your order'),
  },
  order_confirmed: {
    subject: 'Order {{order_number}} confirmed',
    body:
      intro('Your order is confirmed', 'Hi {{name}}, {{store_name}} has accepted your order and is packing it now.') +
      orderTable +
      button('Track your order'),
  },
  order_shipped: {
    subject: 'Order {{order_number}} has shipped',
    body: intro('Your order is on its way', 'Hi {{name}}, your order {{order_number}} has left the store. We will let you know when it is out for delivery.') + button('Track your order'),
  },
  order_out_for_delivery: {
    subject: 'Order {{order_number}} is out for delivery',
    body:
      intro('Out for delivery', 'Hi {{name}}, our delivery partner is on the way with order {{order_number}}. Keep this code ready:') +
      otpBox +
      button('Track live'),
  },
  order_ready_for_pickup: {
    subject: 'Order {{order_number}} is ready for pickup',
    body: intro('Ready for pickup', 'Hi {{name}}, your order {{order_number}} is packed and waiting for you at {{store_name}}.') + button('View your order'),
  },
  order_delivered: {
    subject: 'Order {{order_number}} delivered',
    body:
      intro('Delivered — enjoy!', 'Hi {{name}}, your order {{order_number}} has been delivered. If anything is not right, you can request a return from your order page.') +
      orderTable +
      button('Rate your products'),
  },
  order_cancelled: {
    subject: 'Order {{order_number}} cancelled',
    body:
      intro('Your order was cancelled', 'Hi {{name}}, order {{order_number}} has been cancelled. Any amount you paid online or from your wallet is refunded to your QwikMart wallet.') +
      button('View your order'),
  },
};

/** Order status → template key (statuses without an email are absent). */
export const STATUS_TEMPLATE: Record<string, string> = {
  processed: 'order_confirmed',
  shipped: 'order_shipped',
  out_for_delivery: 'order_out_for_delivery',
  ready_for_pickup: 'order_ready_for_pickup',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
};

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fills {{var}} and {var}; values are inserted as given (callers escape user text). */
export const fillTemplate = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g, (m, a, b) => {
    const k = a ?? b;
    return k in vars ? String(vars[k]) : m;
  });

export interface Brand {
  app_name: string;
  logo?: string | null;
  support_email?: string | null;
  website?: string | null;
}

/** Branded wrapper: navy header with logo, white card, footer. Bodies that are already full documents pass through. */
export function emailLayout(inner: string, brand: Brand): string {
  if (/^\s*(<!doctype|<html)/i.test(inner)) return inner;
  const name = escapeHtml(brand.app_name);
  const logo = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${name}" height="34" style="display:block;height:34px;border:0">`
    : `<span style="font-size:22px;font-weight:800;color:${C.ink}">${name}</span>`;
  const help = brand.support_email ? `Questions? Write to <a href="mailto:${escapeHtml(brand.support_email)}" style="color:${C.blue}">${escapeHtml(brand.support_email)}</a>.` : '';
  const site = brand.website ? `<a href="${escapeHtml(brand.website)}" style="color:${C.muted}">${escapeHtml(brand.website.replace(/^https?:\/\//, ''))}</a>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title></head>
<body style="margin:0;padding:0;background:${C.soft};font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:${C.night};border-radius:20px 20px 0 0;padding:22px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><span style="display:inline-block;background:#ffffff;border-radius:10px;padding:6px 10px">${logo}</span></td>
<td align="right" style="vertical-align:middle"><span style="display:inline-block;width:26px;height:3px;background:${C.orange};border-radius:3px"></span><br><span style="display:inline-block;width:18px;height:3px;background:${C.orange};opacity:.75;border-radius:3px"></span><br><span style="display:inline-block;width:10px;height:3px;background:${C.orange};opacity:.5;border-radius:3px"></span></td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;padding:28px;border-radius:0 0 20px 20px;border:1px solid ${C.line};border-top:0">${inner}</td></tr>
<tr><td style="padding:18px 8px;text-align:center;font-size:12px;line-height:1.6;color:${C.muted}">${help}<br>${site}<br>© ${new Date().getFullYear()} ${name}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Rows for the {{items}} / {{summary}} placeholders. */
export function orderRows(
  items: Array<{ name: string; variant_name?: string | null; qty: number; total: string }>,
  totals: Array<[label: string, value: string, strong?: boolean]>,
): { items: string; summary: string } {
  const td = `padding:10px 0;border-top:1px solid ${C.line}`;
  return {
    items: items
      .map(
        (i) =>
          `<tr><td style="${td}"><span style="color:${C.ink};font-weight:600">${escapeHtml(i.name)}</span>` +
          `${i.variant_name ? ` <span style="color:${C.muted}">· ${escapeHtml(i.variant_name)}</span>` : ''}` +
          `<br><span style="font-size:12px;color:${C.muted}">Qty ${i.qty}</span></td>` +
          `<td align="right" style="${td};white-space:nowrap">${escapeHtml(i.total)}</td></tr>`,
      )
      .join(''),
    summary: totals
      .map(
        ([label, value, strong], n) =>
          `<tr><td style="padding:${n === 0 ? '12px' : '4px'} 0 4px;${n === 0 ? `border-top:2px solid ${C.line};` : ''}${strong ? `color:${C.ink};font-weight:800;font-size:16px` : ''}">${escapeHtml(label)}</td>` +
          `<td align="right" style="padding:${n === 0 ? '12px' : '4px'} 0 4px;${n === 0 ? `border-top:2px solid ${C.line};` : ''}${strong ? `color:${C.ink};font-weight:800;font-size:16px` : ''}">${escapeHtml(value)}</td></tr>`,
      )
      .join(''),
  };
}
