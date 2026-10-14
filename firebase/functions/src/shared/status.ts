/** Order / return status maps — ported 1:1 from Laravel `Order` and `ReturnRequest` models. */
import type { OrderStatus, ReturnStatus } from './types';

export const ORDER_STATUSES: Record<OrderStatus, string> = {
  payment_pending: 'Payment Pending',
  received: 'Received',
  processed: 'Processed',
  shipped: 'Shipped',
  ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Picked Up',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  payment_pending: 'gray', received: 'info', processed: 'purple', shipped: 'primary', ready_for_pickup: 'warning',
  picked_up: 'orange', out_for_delivery: 'primary', delivered: 'success', cancelled: 'danger', returned: 'warning',
};

/** Statuses considered "open" (not final). */
export const ACTIVE_STATUSES: OrderStatus[] = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];

/** Customer may cancel while in these statuses. */
export const CANCELABLE_STATUSES: OrderStatus[] = ['payment_pending', 'received', 'processed'];

/** Orders a rider may pick from the zone pool (Laravel DeliveryController::AVAILABLE_STATUSES). */
export const RIDER_AVAILABLE_STATUSES: OrderStatus[] = ['received', 'processed', 'ready_for_pickup', 'shipped'];

/** Statuses that do not count towards revenue. */
export const NON_REVENUE_STATUSES: OrderStatus[] = ['payment_pending', 'cancelled', 'returned'];

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  payment_pending: ['received', 'cancelled'],
  received: ['processed', 'ready_for_pickup', 'shipped', 'cancelled'],
  processed: ['shipped', 'ready_for_pickup', 'cancelled'],
  shipped: ['ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'],
  ready_for_pickup: ['picked_up', 'out_for_delivery', 'delivered', 'cancelled'],
  picked_up: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery', wallet: 'Wallet', stripe: 'Stripe', paypal: 'PayPal', razorpay: 'Razorpay',
  cashfree: 'Cashfree', phonepe: 'PhonePe', paytabs: 'PayTabs', midtrans: 'Midtrans', paystack: 'Paystack',
};

export const RETURN_STATUSES: Record<ReturnStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup_assigned: 'Pickup Assigned',
  picked_up: 'Picked Up',
  refund_completed: 'Refund Completed',
};

export function isOrderStatus(s: unknown): s is OrderStatus {
  return typeof s === 'string' && s in ORDER_STATUSES;
}

export function statusLabel(s: string): string {
  return (ORDER_STATUSES as Record<string, string>)[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Customer-facing status messages (Laravel OrderService::notifyStatus). */
export function statusMessage(status: OrderStatus, orderNumber: string, otp?: string | null): string | null {
  const m: Partial<Record<OrderStatus, string>> = {
    received: `We've received your order ${orderNumber}.`,
    processed: `Your order ${orderNumber} is being packed.`,
    shipped: `Your order ${orderNumber} has been shipped.`,
    ready_for_pickup: `Your order ${orderNumber} is ready for pickup.`,
    picked_up: `Your order ${orderNumber} has been picked up by our delivery partner.`,
    out_for_delivery: `Your order ${orderNumber} is out for delivery.${otp ? ` Share OTP ${otp} with the delivery partner.` : ''}`,
    delivered: `Your order ${orderNumber} has been delivered. Enjoy!`,
    cancelled: `Your order ${orderNumber} has been cancelled.`,
    returned: `Your order ${orderNumber} has been returned and refunded.`,
  };
  return m[status] ?? null;
}
