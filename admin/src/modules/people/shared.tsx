'use client';
// Shared helpers for the people modules (delivery boys, customers, staff, money screens).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getDownloadURL, ref } from 'firebase/storage';
import { FileText } from 'lucide-react';
import type { QueryConstraint } from 'firebase/firestore';
import { storage } from '@/lib/firebase';
import { fetchByIds, fetchDoc, fetchList, useDocQ } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { imgUrl } from '@/lib/format';
import type { DeliveryBoy, Store, UserDoc } from '@/lib/types';
import { Avatar } from '@/components/ui';

export const VEHICLES = [
  { value: 'bike', label: 'Bike' }, { value: 'scooter', label: 'Scooter' }, { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' }, { value: 'van', label: 'Van' }, { value: 'other', label: 'Other' },
];

export type Rider = DeliveryBoy & { user?: UserDoc | null };

/** delivery_boys (+ users/{uid} join for name/phone/email/avatar/wallet_balance). */
export async function loadRiders(...constraints: QueryConstraint[]): Promise<Rider[]> {
  const boys = await fetchList<DeliveryBoy>('delivery_boys', ...constraints);
  const users = await fetchByIds<UserDoc>('users', boys.map((b) => b.id)).catch(() => [] as UserDoc[]);
  const m = new Map(users.map((u) => [u.id, u]));
  return boys.map((b) => {
    const u = m.get(b.id) || null;
    return { ...b, user: u, name: b.name || u?.name, email: b.email || u?.email, phone: b.phone || u?.phone, avatar: b.avatar || u?.avatar };
  });
}

/** Map of users by id for joining ids shown in tables. */
export function useUserMap(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])].sort();
  const { data } = useQuery({ queryKey: ['users-by-id', uniq], queryFn: () => fetchByIds<UserDoc>('users', uniq), enabled: uniq.length > 0, staleTime: 60_000 });
  const map: Record<string, UserDoc> = {};
  (data || []).forEach((u) => { map[u.id] = u; });
  return map;
}

/** Store panel: the zone of the signed-in store (riders serving the store). */
export function useStoreZone() {
  const { storeId } = usePanel();
  const { data: store, isLoading } = useDocQ<Store>('stores', storeId);
  return { storeId, zoneId: store?.zone_id || null, store, loading: !!storeId && isLoading };
}

/** Resolve a Storage path (rider docs are private → need a token URL) or pass through full URLs. */
export function useStorageUrl(path?: string | null) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (!path) { setUrl(''); return; }
    if (/^(https?:|data:|blob:)/.test(path)) { setUrl(path); return; }
    let alive = true;
    getDownloadURL(ref(storage(), path)).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(imgUrl(path)));
    return () => { alive = false; };
  }, [path]);
  return url;
}

function DocTile({ label, path }: { label: string; path?: string | null }) {
  const url = useStorageUrl(path);
  const isPdf = !!path && /\.pdf($|\?)/i.test(path);
  return (
    <div>
      <p className="text-xs font-semibold text-muted mb-1">{label}</p>
      {path ? (
        <a href={url || '#'} target="_blank" rel="noreferrer" className="block rounded-lg border border-line dark:border-dark-line overflow-hidden h-28 bg-slate-50 dark:bg-slate-800 hover:ring-2 hover:ring-primary/40">
          {isPdf
            ? <span className="w-full h-full flex flex-col items-center justify-center text-red-500"><FileText className="w-8 h-8" /><span className="text-xs mt-1">PDF</span></span>
            : url ? <img src={url} className="w-full h-full object-cover" alt={label} /> : null}
        </a>
      ) : (
        <div className="h-28 rounded-lg border-2 border-dashed border-line dark:border-dark-line flex items-center justify-center text-xs text-muted">Not uploaded</div>
      )}
    </div>
  );
}

/** Delivery boy documents grid (port of delivery-boys/_documents.blade.php). */
export function RiderDocuments({ boy }: { boy: Pick<DeliveryBoy, 'driving_license' | 'id_proof'> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DocTile label="Driving License" path={boy.driving_license} />
      <DocTile label="ID Proof" path={boy.id_proof} />
    </div>
  );
}

export function RiderAvatar({ boy, size = 'w-9 h-9' }: { boy: Rider; size?: string }) {
  return (
    <span className="relative shrink-0 inline-block">
      <Avatar src={boy.avatar} name={boy.name} className={size} />
      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-dark-card ${boy.is_online ? 'bg-emerald-500' : 'bg-slate-300'}`} title={boy.is_online ? 'Online' : 'Offline'} />
    </span>
  );
}

/** Name + avatar cell linking to a rider or customer. */
export function UserCell({ user, href, sub, fallback = 'Deleted user' }: { user?: Partial<UserDoc> | null; href?: string; sub?: string | null; fallback?: string }) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <Avatar src={user?.avatar} name={user?.name} className="w-8 h-8" />
      <span className="min-w-0">
        <span className="block font-medium whitespace-nowrap text-navy dark:text-white">{user?.name || fallback}</span>
        {sub && <span className="block text-xs text-muted truncate">{sub}</span>}
      </span>
    </span>
  );
  return href ? <Link href={href} className="hover:text-primary">{inner}</Link> : inner;
}

/** "+91 98******10" style masking used by the Blade panels. */
export function maskPhone(p?: string | null) {
  if (!p) return '—';
  const s = String(p);
  if (s.length < 6) return s;
  return s.slice(0, s.length - 8 > 0 ? s.length - 8 : 2) + '*'.repeat(Math.min(6, s.length - 4)) + s.slice(-2);
}

/** Parent uid of a users/{uid}/… subcollection doc path. */
export const parentUid = (path?: string) => (path ? path.split('/')[1] : '');

/** One rider with its users/{uid} join. */
export async function loadRider(uid: string): Promise<Rider | null> {
  const [b, u] = await Promise.all([fetchDoc<DeliveryBoy>('delivery_boys', uid), fetchDoc<UserDoc>('users', uid).catch(() => null)]);
  if (!b) return null;
  return { ...b, user: u, name: b.name || u?.name, email: b.email || u?.email, phone: b.phone || u?.phone, avatar: b.avatar || u?.avatar };
}

/** deleteUser marks users/{uid}.status = 'deleted' (outside the ActiveStatus type). */
export const isDeleted = (u?: { status?: unknown } | null) => (u?.status as string) === 'deleted';
