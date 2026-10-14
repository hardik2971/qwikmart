'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { STATUS_LABEL, STATUS_STYLE, formatDate } from '@/lib/format';
import { useCurrency, useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { EmptyState, StatusPill } from '@/components/ui';

const TABS = [
  ['', 'All'],
  ['active', 'Active'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
] as const;

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const authed = useIsAuthed();
  const { fmt } = useCurrency();
  const q = useQuery({ queryKey: ['orders', status], queryFn: () => api.orders(status), refetchInterval: 15_000, enabled: authed });
  return (
    <AccountShell title="My Orders">
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">My Orders</h1>
          <div className="flex gap-1 rounded-btn bg-soft p-1">
            {TABS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setStatus(k)}
                className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold', status === k ? 'bg-surface text-primary shadow-soft' : 'text-muted')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {q.isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        )}
        {q.data?.items.length === 0 && (
          <EmptyState icon={<Package className="h-9 w-9" />} image="/images/empty/empty-orders.webp" title="No orders yet" subtitle="Your orders will show up here." action={<Link href="/" className="btn-primary">Start Shopping</Link>} />
        )}
        <div className="space-y-3">
          {q.data?.items.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="flex flex-col gap-3 rounded-card border border-line p-4 transition hover:border-primary hover:shadow-card sm:flex-row sm:items-center">
              <div className="flex -space-x-3 rtl:space-x-reverse">
                {(o.items || []).slice(0, 3).map((i) => (
                  <span key={i.id} className="relative h-12 w-12 overflow-hidden rounded-lg border-2 border-surface bg-soft">
                    <Image src={i.image} alt="" fill sizes="48px" className="object-cover" />
                  </span>
                ))}
                {!o.items?.length && (
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 text-primary">
                    <Package className="h-5 w-5" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{o.order_number}</span>
                  <StatusPill label={STATUS_LABEL[o.status] || o.status} className={STATUS_STYLE[o.status]} />
                  <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">{o.mode}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {formatDate(o.created_at)} · {o.items_count} item(s) · {o.payment_method.toUpperCase()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-ink">{fmt(o.grand_total ?? o.total)}</span>
                <ChevronRight className="h-5 w-5 text-muted rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AccountShell>
  );
}
