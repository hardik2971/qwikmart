'use client';
// Shared pieces of the delivery-boy panel — port of DeliveryPanel\DeliveryBaseController helpers + partials/order-card + missing-profile.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { Check, ChevronRight, CircleX, Hourglass, LogOut, Ban, UserX } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { useLiveDoc, useStores, withId } from '@/lib/firestore';
import { fmtDateTime, money } from '@/lib/format';
import type { DeliveryBoy, Order, Store } from '@/lib/types';
import { Loading, StatusPill } from '@/components/ui';

export const AVAILABLE_STATUSES = ['received', 'processed', 'ready_for_pickup'];
export const ACTIVE_STATUSES = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
export const FINISHED_STATUSES = ['delivered', 'cancelled', 'returned'];

/** Live `delivery_boys/{uid}` of the signed-in rider. */
export function useRider() {
  const { user, claims } = useAuth();
  const uid = user?.uid || null;
  const { data: boy, loading } = useLiveDoc<DeliveryBoy>('delivery_boys', uid);
  const approved = boy?.approval_status === 'approved' && boy?.status !== 'inactive';
  return { uid, boy, loading: loading || !uid, approved, zoneId: claims.zone_id || boy?.zone_id || null };
}

/** Renders the missing-profile page when the rider profile does not exist; otherwise children(rider). */
export function RiderGate({ children }: { children: (r: ReturnType<typeof useRider> & { boy: DeliveryBoy; uid: string }) => ReactNode }) {
  const r = useRider();
  if (r.loading) return <Loading />;
  if (!r.boy || !r.uid) return <MissingProfile />;
  return <>{children(r as any)}</>;
}

export function MissingProfile() {
  const { logout } = useAuth();
  return (
    <div className="max-w-lg mx-auto mt-10 card p-8 text-center">
      <span className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-4"><UserX className="w-8 h-8" /></span>
      <h1 className="page-title !text-xl">Delivery partner profile not found</h1>
      <p className="text-sm text-muted mt-2">Your account is signed in, but it is not linked to a delivery partner profile yet. Please contact QwikMart support or your administrator to complete your registration.</p>
      <div className="mt-6"><button type="button" className="btn-primary" onClick={() => logout()} data-testid="sign-out"><LogOut className="w-4 h-4" /> Sign out</button></div>
    </div>
  );
}

export function ApprovalNotice({ boy }: { boy: DeliveryBoy }) {
  if (boy.approval_status !== 'approved') {
    const rej = boy.approval_status === 'rejected';
    const Ic = rej ? CircleX : Hourglass;
    return (
      <div className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 ${rej ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        <Ic className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold">{rej ? 'Application rejected' : 'Approval pending'}</p>
          <p>{rej ? 'Your delivery partner application was rejected. Please contact support for details.'
            : 'Your documents are under review. You can explore the panel, but you will start receiving orders once the admin approves your account.'}</p>
        </div>
      </div>
    );
  }
  if (boy.status === 'inactive') {
    return <div className="mb-5 flex items-start gap-3 rounded-xl border bg-red-50 border-red-200 text-red-700 px-4 py-3 text-sm"><Ban className="w-5 h-5 shrink-0" /> Your account is currently disabled. Please contact support.</div>;
  }
  return null;
}

// ---- display helpers ----
export interface Place { name: string; phone?: string; line: string; lat: number | null; lng: number | null }
export function addressOf(o?: Order | null): Place {
  const a: any = o?.address || {};
  const line = a.full_address || [a.address_line, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
  return { name: a.name || o?.customer?.name || 'Customer', phone: a.phone || o?.customer?.phone, line: line || '-', lat: num(a.lat), lng: num(a.lng) };
}
export function storeOf(s?: Store | null): Place {
  return { name: s?.name || 'QwikMart Store', phone: s?.phone, line: s ? [s.address, s.city].filter(Boolean).join(', ') || '-' : '-', lat: num(s?.lat), lng: num(s?.lng) };
}
function num(v: any): number | null { const x = Number(v); return v === '' || v == null || isNaN(x) ? null : x; }
export function mapsUrl(lat: number | null, lng: number | null, address?: string) {
  const dest = lat && lng ? `${lat},${lng}` : address || '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
export function orderTotal(o?: Order | null): number { return Number(o?.totals?.total ?? o?.totals?.grand_total ?? 0); }
export function amountToCollect(o?: Order | null): number {
  return o?.payment_method === 'cod' && o?.payment_status !== 'paid' ? orderTotal(o) : 0;
}

/** Docs by id, skipping ones the rider can't read (rules) instead of failing the whole batch. */
export async function fetchReadable<T>(path: string, ids: (string | null | undefined)[]): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  await Promise.all([...new Set(ids.filter(Boolean) as string[])].map(async (id) => {
    try { const s = await getDoc(doc(db(), path, id)); if (s.exists()) out[id] = withId<T>(s); } catch { /* not readable */ }
  }));
  return out;
}

export function useStoreMap() {
  const { data = [] } = useStores();
  const map: Record<string, Store> = {};
  for (const s of data) map[s.id] = s;
  return map;
}

export function OrderCard({ order, type, store, onAccept, busy }: { order: Order; type?: string; store?: Store | null; onAccept?: (o: Order) => void; busy?: boolean }) {
  const { p } = usePanel();
  const pick = storeOf(store);
  const drop = addressOf(order);
  const cod = order.payment_method === 'cod' && order.payment_status !== 'paid';
  return (
    <div className="card p-4 flex flex-col gap-3 hover:shadow-card transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={p(`/orders/view/${order.id}`)} className="font-bold text-navy dark:text-white hover:text-primary">{order.order_number || order.id}</Link>
          <p className="text-xs text-muted mt-0.5">{fmtDateTime(order.created_at)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="relative pl-6 space-y-3 text-sm">
        <span className="absolute left-[7px] top-2 bottom-2 border-l-2 border-dashed border-line dark:border-dark-line" />
        <div className="relative">
          <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-primary-50 ring-2 ring-primary flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-primary" /></span>
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Pickup</p>
          <p className="font-semibold text-navy dark:text-white truncate">{pick.name}</p>
          <p className="text-xs text-muted truncate">{pick.line}</p>
        </div>
        <div className="relative">
          <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-red-50 ring-2 ring-red-500 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /></span>
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Drop</p>
          <p className="font-semibold text-navy dark:text-white truncate">{drop.name}</p>
          <p className="text-xs text-muted line-clamp-2">{drop.line}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-line dark:border-dark-line">
        <div className="text-sm">
          <span className="font-extrabold text-navy dark:text-white">{money(orderTotal(order))}</span>
          {cod ? <span className="ml-1 pill bg-amber-50 text-amber-700 border border-amber-200">COD</span> : <span className="ml-1 pill bg-emerald-50 text-emerald-700 border border-emerald-200">Prepaid</span>}
        </div>
        <div className="flex items-center gap-2">
          {type === 'available' && onAccept && (
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => onAccept(order)} data-testid="accept-order"><Check className="w-4 h-4" /> Accept</button>
          )}
          <Link href={p(`/orders/view/${order.id}`)} className="btn-soft btn-sm">View <ChevronRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </div>
  );
}

export const sortByCreatedDesc = <T extends { created_at?: any }>(rows: T[]) =>
  [...rows].sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));
