'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bell,
  ChevronDown,
  Gift,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  ShoppingBag,
  User,
  Wallet,
  MapPinned,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { logout } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useCart, useCurrency, useMounted } from '@/hooks';
import { useAuthStore, useCartStore, useLocationStore, useUiStore } from '@/store';
import type { Mode } from '@/lib/types';
import { Logo } from '../ui';
import SearchBar from './SearchBar';

/** Tints the category strip with the selected category's admin colour (header_color). */
function useCategoryTint() {
  const headerColor = useUiStore((s) => s.headerColor);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement.style;
    if (!headerColor || resolvedTheme === 'dark') root.removeProperty('--cat-tint');
    else root.setProperty('--cat-tint', `color-mix(in srgb, ${headerColor} 16%, white)`);
  }, [headerColor, resolvedTheme]);
}

export function ModeToggle({ className }: { className?: string }) {
  const t = useT();
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const mounted = useMounted();
  const router = useRouter();
  const current: Mode = mounted ? mode : 'quick';
  const pick = (m: Mode) => {
    if (m === current) return;
    setMode(m);
    router.push('/');
  };
  return (
    <div role="tablist" className={clsx('flex rounded-full bg-soft p-1 ring-1 ring-line', className)}>
      {(['quick', 'ecommerce'] as Mode[]).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={current === m}
          onClick={() => pick(m)}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 md:min-w-[92px]',
            current === m ? 'bg-night text-white shadow-soft' : 'text-body hover:text-ink',
          )}
        >
          {m === 'quick' && <Zap className={clsx('h-3.5 w-3.5', current === m ? 'fill-accent text-accent' : '')} />}
          {t(m)}
        </button>
      ))}
    </div>
  );
}

function DeliveryInfo() {
  const t = useT();
  const mounted = useMounted();
  const loc = useLocationStore();
  const mode = useUiStore((s) => s.mode);
  const open = useUiStore((s) => s.openLocationModal);
  const mins = loc.deliveryMinutes || loc.zone?.delivery_time_minutes || 8;
  const chosen = mounted && loc.chosen;
  return (
    <button onClick={() => open(true)} className="flex min-w-0 items-center gap-2.5 rounded-xl py-1 pe-2 text-start transition hover:bg-soft md:ps-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-ink">
        {chosen && mode === 'quick' ? <Zap className="h-[18px] w-[18px] fill-current" /> : <MapPin className="h-[18px] w-[18px]" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[15px] font-bold leading-tight text-ink">
          {!chosen ? t('select_location') : mode === 'ecommerce' ? t('delivery_in_days') : t('delivery_in', { mins })}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <span className="block max-w-[200px] truncate">
            {chosen ? loc.address || `${loc.zone?.name}, ${loc.country?.name ?? ''}` : 'Choose your area'}
            {chosen && loc.distanceKm != null && mode === 'quick' && ` · ${loc.distanceKm.toFixed(1)} km`}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </span>
      </span>
    </button>
  );
}

function CartButton() {
  const t = useT();
  const mounted = useMounted();
  useCart(); // keeps summary in sync
  const { count, total } = useCartStore();
  const { fmt } = useCurrency();
  const filled = mounted && count > 0;
  return (
    <Link
      href="/cart"
      aria-label={t('your_cart')}
      className={clsx(
        'relative flex h-11 items-center gap-2.5 rounded-xl px-3 transition',
        filled ? 'bg-primary text-white shadow-cta hover:bg-primary-dark md:px-4' : 'text-ink ring-1 ring-line hover:bg-soft',
      )}
    >
      <span className="relative">
        <ShoppingBag className="h-5 w-5" />
        {filled && (
          <span className="absolute -end-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white ring-2 ring-primary">
            {count}
          </span>
        )}
      </span>
      {filled ? (
        <span className="hidden text-sm font-bold tabular-nums sm:block">{fmt(total)}</span>
      ) : (
        <span className="hidden text-sm font-semibold lg:block">{t('your_cart')}</span>
      )}
    </Link>
  );
}

const MENU = [
  { href: '/profile', icon: User, key: 'profile' as const },
  { href: '/orders', icon: Package, key: 'my_orders' as const },
  { href: '/wallet', icon: Wallet, key: 'wallet' as const },
  { href: '/refer-earn', icon: Gift, key: 'refer_earn' as const },
  { href: '/favorites', icon: Heart, key: 'favorites' as const },
  { href: '/addresses', icon: MapPinned, key: 'addresses' as const },
  { href: '/notifications', icon: Bell, key: 'notifications' as const },
  { href: '/support', icon: MessageCircle, key: 'support' as const },
];

function UserMenu() {
  const t = useT();
  const mounted = useMounted();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!mounted || !user) {
    return (
      <Link href="/login" className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-soft">
        <User className="h-5 w-5" />
        <span className="hidden sm:inline">{t('login')}</span>
      </Link>
    );
  }

  const doLogout = async () => {
    await logout(); // POST /auth/logout, then Firebase signOut
    qc.clear();
    setOpen(false);
    toast.success('Logged out');
    router.push('/');
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-11 items-center gap-2 rounded-xl px-1.5 transition hover:bg-soft lg:px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night font-display text-sm font-bold text-white">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-semibold text-ink lg:block">{user?.name}</span>
        <ChevronDown className="hidden h-4 w-4 text-muted lg:block" />
      </button>
      {open && (
        <div className="absolute end-0 top-[52px] z-50 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-pop animate-fade-in">
          <div className="bg-night px-4 py-3.5 text-white">
            <div className="truncate font-display font-bold">{user?.name}</div>
            <div className="truncate text-xs text-white/70">{user?.email || user?.phone}</div>
          </div>
          <div className="p-1.5">
            {MENU.map(({ href, icon: Icon, key }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-soft"
              >
                <Icon className="h-4 w-4 text-muted" /> {t(key)}
              </Link>
            ))}
            <div className="my-1 h-px bg-line" />
            <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-red-50 dark:hover:bg-red-500/10">
              <LogOut className="h-4 w-4" /> {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// first path segments that are real pages; any other single segment is a zone home (/mumbai)
const ROUTES = new Set(['addresses', 'blog', 'cart', 'categories', 'category', 'checkout', 'faq', 'favorites', 'login', 'notifications', 'orders', 'pages', 'product', 'products', 'profile', 'refer-earn', 'support', 'wallet']);

function useIsHome() {
  const parts = usePathname().split('/').filter(Boolean);
  return parts.length === 0 || (parts.length === 1 && !ROUTES.has(parts[0]));
}

export default function Header() {
  useCategoryTint();
  const home = useIsHome();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-surface/85">
      <div className="container py-2.5 md:py-3">
        <div className="flex items-center gap-3 lg:gap-5">
          <Link href="/" className="h-8 shrink-0 md:h-9" aria-label="QwikMart home">
            <Logo className="h-8 w-auto md:h-9" />
          </Link>
          <div className="hidden max-w-[280px] shrink-0 md:block">
            <DeliveryInfo />
          </div>
          <div className="hidden flex-1 md:block">
            <SearchBar />
          </div>
          <ModeToggle className="hidden lg:flex" />
          <div className="ms-auto flex items-center gap-1.5 md:ms-0">
            <CartButton />
            <UserMenu />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 md:hidden">
          <DeliveryInfo />
          <ModeToggle className="shrink-0" />
        </div>
        {/* on the home page the hero carries the search on phones */}
        {!home && (
          <div className="mt-2 md:hidden">
            <SearchBar />
          </div>
        )}
        {/* tablet: the mode switch moves under the search row */}
        <div className="mt-2 hidden justify-end md:flex lg:hidden">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
