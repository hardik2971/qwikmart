import type { OrderStatus, Variant } from './types';

export function money(n: number | null | undefined, symbol = '₹') {
  const v = Number(n || 0);
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${symbol}${s}`;
}

export const effectivePrice = (v: Pick<Variant, 'price' | 'sale_price'>) => v.sale_price ?? v.price;

export function discountPercent(v: Pick<Variant, 'price' | 'sale_price'>) {
  if (!v.sale_price || v.sale_price >= v.price) return 0;
  return Math.round(((v.price - v.sale_price) / v.price) * 100);
}

export function formatDate(iso: string, withTime = true) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export const STATUS_LABEL: Record<OrderStatus | string, string> = {
  payment_pending: 'Payment Pending',
  received: 'Order Placed',
  processed: 'Preparing',
  shipped: 'Ready for Pickup',
  ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Picked Up',
  out_for_delivery: 'Out For Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  return_requested: 'Return Requested',
};

export const STATUS_STYLE: Record<string, string> = {
  payment_pending: 'bg-amber-50 text-amber-700',
  received: 'bg-primary-50 text-primary',
  processed: 'bg-purple-50 text-purple-700',
  shipped: 'bg-blue-50 text-blue-700',
  ready_for_pickup: 'bg-blue-50 text-blue-700',
  picked_up: 'bg-blue-50 text-blue-700',
  out_for_delivery: 'bg-amber-50 text-amber-700',
  delivered: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
  returned: 'bg-slate-100 text-slate-600',
  return_requested: 'bg-amber-50 text-amber-700',
};

export function etaLabel(mins?: number) {
  if (!mins) return '8 mins';
  if (mins < 120) return `${mins} mins`;
  return `${Math.round(mins / 60 / 24) || 1}-${(Math.round(mins / 60 / 24) || 1) + 2} days`;
}
