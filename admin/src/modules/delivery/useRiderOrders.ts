'use client';
import { useMemo } from 'react';
import { q, useLiveQuery, where, orderBy, limit } from '@/lib/firestore';
import type { Order } from '@/lib/types';
import { ACTIVE_STATUSES, AVAILABLE_STATUSES, FINISHED_STATUSES, sortByCreatedDesc } from './shared';

/** Realtime rider order lists: available in zone (approved only), active assigned, finished history. */
export function useRiderOrders(uid: string | null, zoneId: string | null, approved: boolean) {
  const avail = useLiveQuery<Order>(
    uid && zoneId && approved ? q('orders', where('zone_id', '==', zoneId), where('delivery_boy_id', '==', null), where('status', 'in', AVAILABLE_STATUSES)) : null,
    [uid, zoneId, approved],
  );
  const active = useLiveQuery<Order>(
    uid ? q('orders', where('delivery_boy_id', '==', uid), where('status', 'in', ACTIVE_STATUSES)) : null,
    [uid],
  );
  const hist = useLiveQuery<Order>(
    uid ? q('orders', where('delivery_boy_id', '==', uid), orderBy('created_at', 'desc'), limit(100)) : null,
    [uid],
  );
  return useMemo(() => ({
    available: sortByCreatedDesc(avail.data.filter((o) => o.delivery_type !== 'self_pickup')),
    active: [...active.data].sort((a, b) => ((b as any).assigned_at?.seconds ?? b.created_at?.seconds ?? 0) - ((a as any).assigned_at?.seconds ?? a.created_at?.seconds ?? 0)),
    history: hist.data.filter((o) => FINISHED_STATUSES.includes(o.status)),
    loading: avail.loading || active.loading || hist.loading,
    error: avail.error || active.error || hist.error,
  }), [avail.data, active.data, hist.data, avail.loading, active.loading, hist.loading, avail.error, active.error, hist.error]);
}
