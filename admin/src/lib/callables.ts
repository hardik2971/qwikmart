'use client';
// Typed wrappers around the callable Cloud Functions (docs/FIREBASE_BACKEND.md §4).
// Every panel action that needs trusted logic goes through here — never call httpsCallable elsewhere.
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from './firebase';
import type { HomeSection, Mode, OrderStatus } from './types';

export class CallableError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** Long-running callables (bulk email / import / export / broadcast) get a 9-minute client timeout (functions allow up to 540 s). */
const LONG = new Set(['sendBulkEmail', 'bulkImportProducts', 'exportReport', 'sendNotification']);

async function call<I, O>(name: string, data: I): Promise<O> {
  try {
    const fn = httpsCallable<I, O>(functions(), name, LONG.has(name) ? { timeout: 540_000 } : undefined);
    const res: HttpsCallableResult<O> = await fn(data);
    return res.data;
  } catch (e: any) {
    const code = String(e?.code || 'internal').replace(/^functions\//, '');
    let msg = e?.message || 'Request failed';
    if (code === 'not-found' && /not.?found/i.test(msg) && !e?.details) msg = `Function "${name}" is not deployed yet.`;
    if (code === 'internal' && msg === 'internal') msg = `Server error while calling ${name}.`;
    throw new CallableError(code, msg);
  }
}

type Ok = { ok?: boolean; message?: string; [k: string]: any };

// ---- Account ----
export const syncProfile = (d: { name?: string; email?: string; language?: string; app: 'customer' | 'delivery' }) => call<typeof d, { user: any; is_new: boolean }>('syncProfile', d);

// ---- Orders ----
export const adminUpdateOrderStatus = (d: { order_id: string; status: OrderStatus; note?: string; force?: boolean }) => call<typeof d, Ok>('adminUpdateOrderStatus', d);
export const assignDeliveryBoy = (d: { order_id: string; delivery_boy_id: string }) => call<typeof d, Ok>('assignDeliveryBoy', d);
export const verifyPickupOtp = (d: { order_id: string; otp: string }) => call<typeof d, Ok>('verifyPickupOtp', d);
/** `action` is the TARGET return status (functions validate it against RETURN_STATUSES). */
export const processReturn = (d: { return_id: string; action: 'approved' | 'rejected' | 'pickup_assigned' | 'picked_up' | 'refund_completed'; remark?: string; delivery_boy_id?: string; refund_amount?: number; refund_method?: 'wallet' | 'original' }) => call<typeof d, { id: string; status: string; refund_amount?: number; refund_method?: string }>('processReturn', d);
export const updatePaymentStatus = (d: { order_id: string; payment_status: 'pending' | 'paid' | 'failed' | 'refunded'; transaction_id?: string }) => call<typeof d, Ok>('updatePaymentStatus', d);
/** Admin only; cancelled / payment_pending orders (hard delete, stats adjusted by the order trigger). */
export const deleteOrder = (d: { order_id: string }) => call<typeof d, Ok>('deleteOrder', d);
/** Admin only; pending / rejected returns. */
export const deleteReturn = (d: { return_id: string }) => call<typeof d, Ok>('deleteReturn', d);
export const startChat = (d: { user_id: string; order_id?: string; subject?: string; message?: string }) => call<typeof d, { chat_id: string; created: boolean }>('startChat', d);
export const getInvoiceUrl = (d: { order_id: string }) => call<typeof d, { url: string; path?: string }>('getInvoiceUrl', d);
export const cancelOrder = (d: { order_id: string; reason: string }) => call<typeof d, Ok>('cancelOrder', d);

// ---- People ----
export type PanelUserType = 'admin' | 'staff' | 'store';
export const createPanelUser = (d: { type: PanelUserType; name: string; email: string; password: string; phone?: string; store_id?: string; role_id?: string }) => call<typeof d, { uid: string }>('createPanelUser', d);
export const updatePanelUser = (d: { uid: string; name?: string; email?: string; phone?: string; password?: string; role_id?: string | null; store_id?: string | null; status?: 'active' | 'inactive' }) => call<typeof d, Ok>('updatePanelUser', d);
export const setUserStatus = (d: { uid: string; active: boolean }) => call<typeof d, Ok>('setUserStatus', d);
export const deleteUser = (d: { uid: string }) => call<typeof d, Ok>('deleteUser', d);
export const approveDeliveryBoy = (d: { uid: string; approve: boolean; remark?: string }) => call<typeof d, Ok>('approveDeliveryBoy', d);
export interface CreateDeliveryBoyInput {
  name: string; email: string; password: string; phone: string; dob?: string; country_id: string; zone_id: string; address?: string;
  vehicle_type?: string; vehicle_number?: string; driving_license?: string; id_proof?: string; bank?: { name?: string; account?: string; ifsc?: string };
  commission_type?: 'fixed' | 'percent'; commission_value?: number; salary?: number; status?: 'active' | 'inactive';
}
export const createDeliveryBoy = (d: CreateDeliveryBoyInput) => call<typeof d, { uid: string }>('createDeliveryBoy', d);

// ---- Money ----
export const walletAdjust = (d: { uid: string; type: 'credit' | 'debit'; amount: number; message: string }) => call<typeof d, Ok & { balance?: number }>('walletAdjust', d);
export const processWithdrawal = (d: { id: string; approve: boolean; remark?: string; receipt_image?: string }) => call<typeof d, Ok>('processWithdrawal', d);
/** Already processed requests: remark / receipt only. */
export const updateWithdrawal = (d: { id: string; remark?: string | null; receipt_image?: string | null }) => call<typeof d, Ok>('updateWithdrawal', d);
export const collectCash = (d: { delivery_boy_id: string; amount: number; message?: string }) => call<typeof d, Ok>('collectCash', d);
export const payEarnings = (d: { delivery_boy_id: string; amount?: number; type: 'commission' | 'bonus' | 'salary'; message?: string; credit_wallet?: boolean }) => call<typeof d, Ok>('payEarnings', d);

// ---- Content ----
export const publishHomeLayout = (d: { layout_id: string }) => call<typeof d, Ok>('publishHomeLayout', d);
export const previewHomeSections = (d: { zone_id: string; mode: Mode; sections?: HomeSection[]; lang?: string; layout_id?: string }) => call<typeof d, { sections: (HomeSection & { items: any[] })[] }>('previewHomeSections', d);
export const generateProductContent = (d: { name: string; category?: string; keywords?: string; language?: string }) =>
  call<typeof d, { short_description?: string; description?: string; seo_title?: string; seo_description?: string; seo_keywords?: string }>('generateProductContent', d);
/** returns { translations: { [lang]: { [field]: text } } } */
export const translateFields = (d: { fields: Record<string, string>; from: string; to: string[] }) => call<typeof d, { translations: Record<string, Record<string, string>> }>('translateFields', d);
export const bulkImportProducts = (d: { csv_path: string; store_id?: string | null }) => call<typeof d, { created: number; updated?: number; errors: { row: number; message: string }[] }>('bulkImportProducts', d);
/** functions accept type: 'orders' | 'sales' | 'products' | 'customers' | 'returns' */
export const exportReport = (d: { type: 'orders' | 'sales' | 'products' | 'customers' | 'returns'; from: string; to: string; filters?: Record<string, any> }) => call<typeof d, { url: string }>('exportReport', d);
export const sendNotification = (d: { title: string; message: string; type: string; target: string; user_id?: string; image?: string; link?: string; store_id?: string }) => call<typeof d, Ok & { sent_count?: number }>('sendNotification', d);
export const sendBulkEmail = (d: { subject: string; body: string; segment: string; user_ids?: string[] }) => call<typeof d, Ok & { sent?: number }>('sendBulkEmail', d);
export const testSmtp = (d: { to: string }) => call<typeof d, Ok>('testSmtp', d);

// ---- Delivery boy ----
export const setOnline = (d: { is_online: boolean }) => call<typeof d, Ok>('setOnline', d);
export const acceptOrder = (d: { order_id: string }) => call<typeof d, Ok>('acceptOrder', d);
export const rejectOrder = (d: { order_id: string; reason?: string }) => call<typeof d, Ok>('rejectOrder', d);
export const updateDeliveryStatus = (d: { order_id: string; status: 'picked_up' | 'out_for_delivery' }) => call<typeof d, Ok>('updateDeliveryStatus', d);
export const deliverOrder = (d: { order_id: string; otp: string; cash_collected?: number }) => call<typeof d, Ok>('deliverOrder', d);
export const returnPickedUp = (d: { return_id: string }) => call<typeof d, Ok>('returnPickedUp', d);
export const walletWithdraw = (d: { amount: number; message?: string }) => call<typeof d, Ok>('walletWithdraw', d);
