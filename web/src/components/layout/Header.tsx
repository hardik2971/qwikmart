'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  ShoppingCart,
  User,
  Wallet,
  MapPinned,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { logout } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useCart, useCurrency, useMounted } from '@/hooks';
import { useAuthStore, useCartStore, useLocationStore, useUiStore } from '@/store';
import type { Mode } from '@/lib/types';
import { Logo } from '../ui';
import SearchBar from './SearchBar';

/** Writes the header gradient CSS variables (category header_color / mode) to <html>. */
function useHeaderGradient() {
  const mode = useUiStore((s) => s.mode);
  const headerColor = useUiStore((s) => s.headerColor);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement.style;
    if (resolvedTheme === 'dark') {
      root.removeProperty('--header-from');
      root.removeProperty('--header-via');
      root.removeProperty('--header-to');
      return;
    }
    let from = '#EBEC8D';
    let via = '#F8F9E9';
    if (mode === 'ecommerce') {
      from = headerColor || '#FDE2D6';
      via = headerColor ? `color-mix(in srgb, ${headerColor} 30%, white)` : '#FFF4EE';
    } else if (headerColor) {
      from = headerColor;
      via = `color-mix(in srgb, ${headerColor} 30%, white)`;
    }
    root.setProperty('--header-from', from);
    root.setProperty('--header-via', via);
    root.setProperty('--header-to', '#FFFFFF');
  }, [mode, headerColor, resolvedTheme]);
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
    <div className={clsx('flex rounded-btn bg-black/[.06] p-1', className)}>
      {(['quick', 'ecommerce'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => pick(m)}
          className={clsx(
            'flex-1 rounded-lg px-4 py-1.5 text-xs font-semibold transition md:min-w-[100px]',
            current === m ? 'bg-surface text-ink shadow-soft' : 'bg-black/25 text-white hover:bg-black/35',
          )}
        >
          {t(m)}
        </button>
      ))}
    </div>
  );
}

function DeliveryInfo({ compact }: { compact?: boolean }) {
  const t = useT();
  const mounted = useMounted();
  const loc = useLocationStore();
  const mode = useUiStore((s) => s.mode);
  const open = useUiStore((s) => s.openLocationModal);
  const mins = loc.deliveryMinutes || loc.zone?.delivery_time_minutes || 8;
  return (
    <button onClick={() => open(true)} className="flex min-w-0 items-start gap-2 text-start">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
      <span className="min-w-0">
        <span className={clsx('block truncate font-bold text-ink', compact ? 'text-sm' : 'text-sm')}>
          {!mounted || !loc.chosen
            ? t('select_location')
            : mode === 'ecommerce'
              ? t('delivery_in_days')
              : t('delivery_in', { mins })}
          {mounted && loc.chosen && loc.distanceKm != null && mode === 'quick' && (
            <span className="font-bold"> · {loc.distanceKm.toFixed(2)} km</span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs text-body/80">
          <span className="block max-w-[220px] truncate">
            {mounted && loc.chosen ? loc.address || `${loc.zone?.name}, ${loc.country?.name ?? ''}` : 'Choose your area'}
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
  return (
    <Link href="/cart" className="relative flex items-center gap-3.5 rounded-btn px-2 py-1.5 hover:bg-black/5">
      <span className="relative">
        <ShoppingCart className="h-6 w-6 text-ink" />
        {mounted && count > 0 && (
          <span className="absolute -end-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </span>
      {mounted && count > 0 && (
        <span className="hidden leading-tight lg:block">
          <span className="block text-[11px] text-body/80">{t('your_cart')}</span>
          <span className="block text-sm font-bold text-ink">{fmt(total)}</span>
        </span>
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
      <Link href="/login" className="flex items-center gap-2 rounded-btn px-2 py-1.5 text-sm font-semibold text-ink hover:bg-black/5">
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
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-btn px-2 py-1.5 hover:bg-black/5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-semibold text-ink lg:block">{user?.name}</span>
        <ChevronDown className="hidden h-4 w-4 text-ink lg:block" />
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-50 w-60 rounded-card border border-line bg-surface p-2 shadow-pop animate-fade-in">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <div className="truncate font-semibold text-ink">{user?.name}</div>
            <div className="truncate text-xs text-muted">{user?.email || user?.phone}</div>
          </div>
          {MENU.map(({ href, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-soft"
            >
              <Icon className="h-4 w-4 text-muted" /> {t(key)}
            </Link>
          ))}
          <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-500/10">
            <LogOut className="h-4 w-4" /> {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  useHeaderGradient();
  return (
    <header className="sticky top-0 z-40 border-b border-black/5" style={{ background: 'linear-gradient(180deg,var(--header-from),var(--header-via))' }}>
      <div className="container py-2.5">
        <div className="flex items-center gap-3 lg:gap-6">
          <Link href="/" className="h-9 shrink-0 md:h-10" aria-label="QwikMart home">
            <Logo className="h-9 w-auto md:h-10" />
          </Link>
          <div className="hidden max-w-[300px] shrink-0 md:block">
            <DeliveryInfo />
          </div>
          <div className="hidden flex-1 md:block">
            <SearchBar />
          </div>
          <ModeToggle className="hidden md:flex" />
          <div className="ms-auto flex items-center gap-1 md:ms-0 md:border-s md:border-black/10 md:ps-3">
            <CartButton />
            <UserMenu />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 md:hidden">
          <DeliveryInfo compact />
          <ModeToggle className="w-44 shrink-0" />
        </div>
        <div className="mt-2 md:hidden">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
