'use client';
// Shared helpers for the orders / self-pickup / returns / chat modules (ported from Laravel Order & ReturnRequest models).
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Zap } from 'lucide-react';
import { fetchByIds, fetchList, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import type { DeliveryBoy, OrderStatus, UserDoc } from '@/lib/types';

export const ORDER_STATUSES: Record<OrderStatus, string> = {
  payment_pending: 'Payment Pending', received: 'Received', processed: 'Processed', shipped: 'Shipped', ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Picked Up', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};
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
export const FINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled', 'returned'];
export const PENDING_GROUP: OrderStatus[] = ['payment_pending', 'received'];
export const PROCESSING_GROUP: OrderStatus[] = ['processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];

export const STATUS_HEX: Record<string, string> = {
  payment_pending: '#94A3B8', received: '#3B82F6', processed: '#8B5CF6', shipped: '#0E9623', ready_for_pickup: '#F59E0B',
  picked_up: '#F97316', out_for_delivery: '#06B6D4', delivered: '#10B981', cancelled: '#EF4444', returned: '#F59E0B',
};

export const PAYMENT_METHODS: Record<string, string> = {
  cod: 'Cash on Delivery', wallet: 'Wallet', stripe: 'Stripe', paypal: 'PayPal', razorpay: 'Razorpay',
  cashfree: 'Cashfree', phonepe: 'PhonePe', paytabs: 'PayTabs', midtrans: 'Midtrans', paystack: 'Paystack',
};
export const PAYMENT_STATUSES: Record<string, string> = { pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' };
export const paymentMethodLabel = (m?: string | null) => (m ? PAYMENT_METHODS[m] ?? m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');
export const orderStatusLabel = (s?: string | null) => (s ? (ORDER_STATUSES as Record<string, string>)[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');

export const RETURN_STATUSES: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', pickup_assigned: 'Pickup Assigned', picked_up: 'Picked Up', refund_completed: 'Refund Completed',
};

/** Laravel mask_phone(): masks the middle digits only in demo mode. */
export function useMaskPhone() {
  const { settings } = usePanel();
  return (phone?: string | null) => {
    if (!phone) return '-';
    if (!settings.demo_mode || phone.length < 7) return phone;
    return phone.slice(0, 3) + '*'.repeat(Math.max(phone.length - 6, 0)) + phone.slice(-3);
  };
}

export function ModePill({ mode }: { mode?: string }) {
  return mode === 'quick'
    ? <span className="pill border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap"><Zap className="w-3 h-3" /> Quick</span>
    : <span className="pill border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap"><ShoppingBag className="w-3 h-3" /> eCommerce</span>;
}

export interface RiderOption { id: string; name: string; phone?: string; avatar?: string; is_online: boolean }

/** Approved + active delivery boys of a zone (online first), names joined from users/{uid} when not denormalised. */
export function useZoneRiders(zoneId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['orders-module', 'zone-riders', zoneId],
    enabled: enabled && !!zoneId,
    staleTime: 30_000,
    queryFn: async (): Promise<RiderOption[]> => {
      const boys = await fetchList<DeliveryBoy>('delivery_boys', where('zone_id', '==', zoneId), where('approval_status', '==', 'approved'));
      const active = boys.filter((b) => (b.status ?? 'active') === 'active' || (b.status as any) === true);
      const missing = active.filter((b) => !b.name).map((b) => b.id);
      const users = missing.length ? await fetchByIds<UserDoc>('users', missing).catch(() => [] as UserDoc[]) : [];
      const um = new Map(users.map((u) => [u.id, u]));
      return active
        .map((b) => ({ id: b.id, name: b.name || um.get(b.id)?.name || `Delivery Boy #${b.id.slice(0, 6)}`, phone: b.phone || um.get(b.id)?.phone, avatar: b.avatar || um.get(b.id)?.avatar, is_online: !!b.is_online }))
        .sort((a, b) => Number(b.is_online) - Number(a.is_online) || a.name.localeCompare(b.name));
    },
  });
}

/** Open a URL produced by an async call in a new tab without tripping popup blockers. */
export async function openAsync(getUrl: () => Promise<string>) {
  const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const url = await getUrl();
    if (w) w.location.href = url; else window.open(url, '_blank', 'noopener');
  } catch (e) {
    w?.close();
    throw e;
  }
}
