/** Invoice PDF (pdfkit) → Cloud Storage → signed URL (token download URL in the emulator / when signing is unavailable). */
import type PDFKit from 'pdfkit';
import { randomUUID } from 'node:crypto';
import { bucket, db, IS_EMULATOR, logger, now, publicSettings } from '../shared/firebase';
import type { OrderDoc } from '../shared/types';
import { money, num } from '../shared/util';
import { PAYMENT_METHOD_LABELS, statusLabel } from '../shared/status';

export function renderInvoice(order: OrderDoc & { id: string }, app: { name: string; email?: string; phone?: string }, currency: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // pdfkit is loaded lazily (only when an invoice is generated) to keep cold starts / deploy discovery fast.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFDocument = require('pdfkit') as typeof PDFKit;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const fmt = (n: number) => `${currency} ${money(n).toFixed(2)}`;

    doc.fontSize(20).fillColor('#0E9623').text(app.name, { continued: false });
    doc.fontSize(9).fillColor('#555').text([app.email, app.phone].filter(Boolean).join('  |  '));
    doc.moveDown();
    doc.fontSize(16).fillColor('#111').text('TAX INVOICE', { align: 'right' });
    doc.fontSize(10).text(`Invoice #: ${order.order_number}`, { align: 'right' });
    const created = order.created_at?.toDate?.() ?? new Date();
    doc.text(`Date: ${created.toISOString().slice(0, 10)}`, { align: 'right' });
    doc.text(`Status: ${statusLabel(order.status)}  |  Payment: ${PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method} (${order.payment_status})`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(11).fillColor('#111').text('Bill to', { underline: true });
    doc.fontSize(10).text(order.customer?.name ?? '');
    if (order.customer?.phone) doc.text(order.customer.phone);
    if (order.address?.full_address) doc.text(order.address.full_address);
    doc.moveDown();

    const top = doc.y;
    const cols = [40, 280, 340, 420, 490];
    doc.fontSize(10).fillColor('#fff').rect(40, top, 515, 18).fill('#0E9623');
    doc.fillColor('#fff').text('Item', cols[0] + 4, top + 4).text('Qty', cols[1], top + 4).text('Price', cols[2], top + 4).text('Tax', cols[3], top + 4).text('Total', cols[4], top + 4);
    let y = top + 24;
    doc.fillColor('#111');
    for (const it of order.items ?? []) {
      const label = `${it.name}${it.variant_name ? ` (${it.variant_name})` : ''}`;
      const h = Math.max(14, doc.heightOfString(label, { width: 230 }));
      if (y + h > 760) { doc.addPage(); y = 40; }
      doc.text(label, cols[0] + 4, y, { width: 230 });
      doc.text(String(it.qty), cols[1], y).text(fmt(num(it.unit_price ?? it.sale_price ?? it.price)), cols[2], y)
        .text(fmt(num(it.tax_amount)), cols[3], y).text(fmt(num(it.total)), cols[4], y);
      y += h + 6;
    }
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#ddd').stroke();
    y += 10;
    const t = order.totals;
    const rows: [string, number][] = [['Subtotal', num(t.subtotal)]];
    if (num(t.promo_discount) > 0 && !order.promo_is_cashback) rows.push([`Promo (${order.promo_code})`, -num(t.promo_discount)]);
    rows.push(['Delivery charge', num(t.delivery_charge)]);
    if (num(t.surge_charge) > 0) rows.push(['Surge charge', num(t.surge_charge)]);
    if (num(t.additional_charges) > 0) rows.push(['Additional charges', num(t.additional_charges)]);
    rows.push(['Tax (included)', num(t.tax_amount)]);
    rows.push(['Grand total', num(t.grand_total)]);
    if (num(t.wallet_used) > 0) rows.push(['Paid from wallet', -num(t.wallet_used)]);
    rows.push(['Amount payable', num(t.total)]);
    for (const [k, v] of rows) {
      doc.fontSize(10).text(k, 340, y).text(fmt(v), 470, y, { width: 85, align: 'right' });
      y += 16;
    }
    doc.fontSize(8).fillColor('#777').text('This is a computer generated invoice.', 40, 790, { align: 'center', width: 515 });
    doc.end();
  });
}

/** Ensure the invoice exists in Storage and return a URL to download it. */
export async function invoiceUrl(order: OrderDoc & { id: string }): Promise<{ url: string; path: string }> {
  const path = order.invoice_path || `invoices/${order.id}/${order.order_number}.pdf`;
  const file = bucket().file(path);
  const [exists] = await file.exists();
  let token: string | undefined;
  if (!exists || !order.invoice_path) {
    const s = await publicSettings();
    let currency = s.currency_code ?? 'INR';
    if (order.country_id) {
      const c = await db.doc(`countries/${order.country_id}`).get();
      if (c.exists && c.get('currency_code')) currency = String(c.get('currency_code'));
    }
    const pdf = await renderInvoice(order, { name: s.app_name ?? 'QwikMart', email: s.support?.email, phone: s.support?.phone }, currency);
    token = randomUUID();
    await file.save(pdf, { contentType: 'application/pdf', resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    await db.doc(`orders/${order.id}`).update({ invoice_path: path, updated_at: now() });
  }
  if (!IS_EMULATOR) {
    try {
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 3600_000, version: 'v4' });
      return { url, path };
    } catch (e) {
      logger.warn('getSignedUrl failed, falling back to token URL', String(e));
    }
  }
  if (!token) {
    const [meta] = await file.getMetadata();
    token = String((meta.metadata as Record<string, unknown> | undefined)?.firebaseStorageDownloadTokens ?? '').split(',')[0] || undefined;
    if (!token) {
      token = randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
  }
  return { url: downloadUrl(file.bucket.name, path, token), path };
}

/** Firebase download URL (token) for an existing object; creates a token when the object has none. null when missing. */
export async function storageDownloadUrl(path: string): Promise<string | null> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  let token = String((meta.metadata as Record<string, unknown> | undefined)?.firebaseStorageDownloadTokens ?? '').split(',')[0] || '';
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  return downloadUrl(file.bucket.name, path, token);
}

export function downloadUrl(bucketName: string, path: string, token: string): string {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST;
  const base = host ? `${host.startsWith('http') ? host : `http://${host}`}` : 'https://firebasestorage.googleapis.com';
  return `${base}/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** Upload any buffer and return a download URL (signed in production, token URL in the emulator). */
export async function uploadAndLink(path: string, data: Buffer | string, contentType: string): Promise<string> {
  const file = bucket().file(path);
  const token = randomUUID();
  await file.save(data, { contentType, resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  if (!IS_EMULATOR) {
    try {
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 3600_000, version: 'v4' });
      return url;
    } catch (e) {
      logger.warn('getSignedUrl failed, falling back to token URL', String(e));
    }
  }
  return downloadUrl(file.bucket.name, path, token);
}
