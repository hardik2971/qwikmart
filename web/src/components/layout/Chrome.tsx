'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Headset, Home, LayoutGrid, ShoppingCart, User } from 'lucide-react';
import { useMounted } from '@/hooks';
import { useCartStore } from '@/store';
import { isUsingMock } from '@/lib/api';

export function FloatingChat() {
  const pathname = usePathname();
  if (pathname.startsWith('/support')) return null;
  return (
    <Link
      href="/support"
      aria-label="Chat with support"
      className="fixed bottom-20 end-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-pop ring-4 ring-primary/20 transition hover:scale-105 md:bottom-6"
    >
      <Headset className="h-5 w-5" />
    </Link>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const mounted = useMounted();
  const count = useCartStore((s) => s.count);
  const items = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/categories', label: 'Categories', icon: LayoutGrid },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, badge: mounted ? count : 0 },
    { href: '/profile', label: 'Account', icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={clsx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted')}>
              <Icon className="h-5 w-5" />
              {label}
              {!!badge && (
                <span className="absolute start-1/2 top-1 ms-2 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{badge}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Small banner shown when the site is running on the in-browser demo data (NEXT_PUBLIC_USE_MOCK). */
export function DemoBadge() {
  const mounted = useMounted();
  if (!mounted || !isUsingMock()) return null;
  return (
    <div className="fixed bottom-20 start-4 z-40 rounded-full bg-amber-400/95 px-3 py-1 text-[11px] font-bold text-amber-950 shadow md:bottom-6">
      DEMO DATA
    </div>
  );
}
