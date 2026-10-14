'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CheckCheck, Gift, Package, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { EmptyState } from '@/components/ui';

const ICONS: Record<string, typeof Bell> = { order: Package, promotion: Tag, product: Gift };

export default function NotificationsPage() {
  const authed = useIsAuthed();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, enabled: authed, refetchInterval: 30_000 });
  const readAll = useMutation({ mutationFn: api.readAllNotifications, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;
  return (
    <AccountShell title="Notifications">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Notifications {unread > 0 && <span className="ms-1 rounded-full bg-primary px-2 py-0.5 text-xs text-white">{unread}</span>}
          </h1>
          {unread > 0 && (
            <button onClick={() => readAll.mutate()} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </button>
          )}
        </div>
        {q.isLoading && <div className="skeleton h-40" />}
        {q.data?.length === 0 && <EmptyState icon={<Bell className="h-9 w-9" />} title="You're all caught up" />}
        <div className="divide-y divide-line">
          {q.data?.map((n) => {
            const Icon = ICONS[n.type || ''] || Bell;
            const body = (
              <div className={clsx('flex gap-3 py-3.5', !n.read_at && 'font-medium')}>
                <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', n.read_at ? 'bg-soft text-muted' : 'bg-primary-50 text-primary')}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-sm text-muted">{n.message}</p>
                </div>
                {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
            );
            const markRead = () => {
              if (!n.read_at && api.readNotification) void api.readNotification(n.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
            };
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={markRead} className="block hover:bg-soft/50">
                {body}
              </Link>
            ) : (
              <div key={n.id} onClick={markRead} className={clsx(!n.read_at && 'cursor-pointer')}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </AccountShell>
  );
}
