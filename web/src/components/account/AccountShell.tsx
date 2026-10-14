'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Bell, Gift, Heart, MapPinned, MessageCircle, Package, User, Wallet } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useRequireAuth } from '@/hooks';
import { useAuthStore } from '@/store';
import { Breadcrumbs } from '../ui';

const NAV = [
  { href: '/profile', icon: User, key: 'profile' as const },
  { href: '/orders', icon: Package, key: 'my_orders' as const },
  { href: '/wallet', icon: Wallet, key: 'wallet' as const },
  { href: '/refer-earn', icon: Gift, key: 'refer_earn' as const },
  { href: '/favorites', icon: Heart, key: 'favorites' as const },
  { href: '/addresses', icon: MapPinned, key: 'addresses' as const },
  { href: '/notifications', icon: Bell, key: 'notifications' as const },
  { href: '/support', icon: MessageCircle, key: 'support' as const },
];

export default function AccountShell({ title, crumbs, children }: { title: string; crumbs?: { label: string; href?: string }[]; children: ReactNode }) {
  const t = useT();
  const authed = useRequireAuth();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  return (
    <div className="container py-5">
      <Breadcrumbs items={crumbs || [{ label: title }]} />
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="card hidden overflow-hidden lg:block">
          <div className="flex items-center gap-3 border-b border-line bg-primary-50/60 p-4 dark:bg-primary/10">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{authed ? user?.name : '…'}</div>
              <div className="truncate text-xs text-muted">{authed ? user?.email || user?.phone : ''}</div>
            </div>
          </div>
          <nav className="p-2">
            {NAV.map(({ href, icon: Icon, key }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition',
                  pathname.startsWith(href) ? 'bg-primary text-white' : 'text-ink hover:bg-soft',
                )}
              >
                <Icon className="h-4 w-4" /> {t(key)}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
          {NAV.map(({ href, key }) => (
            <Link key={href} href={href} className={clsx('chip shrink-0', pathname.startsWith(href) && 'chip-active')}>
              {t(key)}
            </Link>
          ))}
        </div>
        <div className="min-w-0">{authed ? children : <div className="skeleton h-96" />}</div>
      </div>
    </div>
  );
}
