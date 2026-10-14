'use client';
// Port of layouts/partials/header.blade.php.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeft, Moon, Sun, Globe, Bell, Languages, ChevronDown, UserRound, Settings, LogOut, ShoppingBag } from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth, roleLabel } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { limit, orderBy, q, useLiveQuery } from '@/lib/firestore';
import { flagEmoji, timeAgo } from '@/lib/format';
import type { UserNotification } from '@/lib/types';
import { Avatar, cx } from '@/components/ui';

function Dropdown({ button, children, width = 'w-56' }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {button(open, () => setOpen(!open))}
      {open && <div className={cx('absolute right-0 mt-2 card shadow-lg z-50', width)}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('sb-theme', dark ? 'dark' : 'light'); } catch { /* */ }
}

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, claims, profile, role, logout, can } = useAuth();
  const { panel, base, settings, countries, countryId, setCountryId, languages, uiLang, setUiLang } = usePanel();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  const notesQ = user ? q(`users/${user.uid}/notifications`, orderBy('created_at', 'desc'), limit(10)) : null;
  const { data: notes } = useLiveQuery<UserNotification>(notesQ, [user?.uid]);
  const unread = notes.filter((n) => !n.read_at).length;
  const cur = countries.find((c) => c.id === countryId);
  const name = profile?.name || user?.displayName || user?.email || 'User';

  const markAllRead = async () => {
    if (!user || !unread) return;
    const b = writeBatch(db());
    notes.filter((n) => !n.read_at).forEach((n) => b.update(doc(db(), 'users', user.uid, 'notifications', n.id), { read_at: serverTimestamp() }));
    try { await b.commit(); } catch { /* rules may restrict; ignore */ }
  };

  return (
    <header className="sticky top-0 z-30 h-[68px] flex items-center gap-3 px-4 md:px-6 bg-white/95 backdrop-blur border-b border-line dark:bg-dark-card/95 dark:border-dark-line" data-testid="header">
      <button type="button" onClick={onToggleSidebar} className="icon-btn !w-9 !h-9" title="Toggle sidebar"><PanelLeft className="w-5 h-5" /></button>
      {settings.demo_mode && (
        <span className="pill bg-amber-50 text-amber-700 border border-amber-300 font-bold tracking-wide"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />DEMO</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="icon-btn !w-9 !h-9" title="Toggle dark mode" onClick={() => { setTheme(!dark); setDark(!dark); }}>
          {dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>

        <Dropdown button={(_, t) => (
          <button type="button" className="icon-btn !w-9 !h-9" title="Country" onClick={t}>
            {cur ? <span className="text-base leading-none">{flagEmoji(cur.flag, cur.iso2)}</span> : <Globe className="w-[18px] h-[18px]" />}
          </button>
        )}>
          {(close) => (
            <div className="p-1.5">
              <div className="px-3 py-1.5 text-xs font-bold text-muted uppercase">Country</div>
              {panel === 'admin' ? (
                <div className="max-h-72 overflow-y-auto scrollbar-thin">
                  <button type="button" onClick={() => { setCountryId(''); close(); }} className={cx('w-full flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800', !cur && 'text-primary font-semibold')}><Globe className="w-4 h-4" /> All Countries</button>
                  {countries.map((c) => (
                    <button type="button" key={c.id} onClick={() => { setCountryId(c.id); close(); }} className={cx('w-full flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800', countryId === c.id && 'text-primary font-semibold')}>
                      <span>{flagEmoji(c.flag, c.iso2)}</span> {c.name}
                    </button>
                  ))}
                </div>
              ) : <div className="px-3 py-2 text-muted text-xs">Your panel is scoped to your {panel === 'store' ? "store's" : "zone's"} country.</div>}
            </div>
          )}
        </Dropdown>

        <Dropdown width="w-80" button={(_, t) => (
          <button type="button" className="icon-btn !w-9 !h-9 relative" title="Notifications" onClick={() => { t(); }} data-testid="bell">
            <Bell className="w-[18px] h-[18px]" />
            {notes.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-dark-card">
                {unread > 9 || notes.length > 9 ? '9+' : Math.max(unread, notes.length)}
              </span>
            )}
          </button>
        )}>
          {() => (
            <div className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line">
                <span className="font-bold text-navy dark:text-white">Notifications</span>
                <button type="button" onClick={markAllRead} className="pill bg-primary-50 text-primary">{unread} new</button>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-line dark:divide-dark-line">
                {notes.length ? notes.map((n) => (
                  <div key={n.id} className={cx('flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800', !n.read_at && 'bg-primary-50/40')}>
                    <span className="w-9 h-9 shrink-0 rounded-full bg-primary-50 text-primary flex items-center justify-center"><ShoppingBag className="w-4 h-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-navy dark:text-white truncate">{n.title}</span>
                      <span className="block text-xs text-muted truncate">{n.message}</span>
                      <span className="block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                    </span>
                  </div>
                )) : <div className="px-4 py-8 text-center text-muted text-sm">You're all caught up.</div>}
              </div>
              {panel !== 'delivery' && <Link href={`${base}/orders`} className="block text-center text-sm font-semibold text-primary py-2.5 border-t border-line dark:border-dark-line hover:bg-slate-50 dark:hover:bg-slate-800">View all orders</Link>}
            </div>
          )}
        </Dropdown>

        <Dropdown width="w-44" button={(_, t) => (
          <button type="button" className="icon-btn !w-9 !h-9" title="Language" onClick={t}><Languages className="w-[18px] h-[18px]" /></button>
        )}>
          {(close) => (
            <div className="p-1.5">
              {languages.map((l) => (
                <button type="button" key={l.code} onClick={() => { setUiLang(l.code); close(); }} className={cx('w-full flex items-center justify-between rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800', uiLang === l.code && 'text-primary font-semibold')}>
                  {l.name} <span className="text-xs text-muted uppercase">{l.code}</span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        <Dropdown button={(_, t) => (
          <button type="button" className="flex items-center gap-2.5 pl-1" onClick={t} data-testid="user-menu">
            <Avatar src={profile?.avatar} name={name} className="w-9 h-9 ring-2 ring-primary-50" />
            <span className="hidden sm:block text-left leading-tight">
              <span className="block text-sm font-bold text-navy dark:text-white">{name}</span>
              <span className="block text-[11px] text-muted">{roleLabel(claims, role)}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        )}>
          {(close) => (
            <div className="p-1.5">
              <div className="px-3 py-2 border-b border-line dark:border-dark-line mb-1">
                <div className="font-semibold text-navy dark:text-white text-sm truncate">{name}</div>
                <div className="text-xs text-muted truncate">{user?.email}</div>
              </div>
              <Link href={`${base}/profile`} onClick={close} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><UserRound className="w-4 h-4" /> My Profile</Link>
              {panel === 'admin' && can('setting.view') && <Link href={`${base}/settings`} onClick={close} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><Settings className="w-4 h-4" /> Settings</Link>}
              <button type="button" data-testid="logout" onClick={async () => { close(); await logout(); router.replace(`${base}/login`); }} className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><LogOut className="w-4 h-4" /> Logout</button>
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}

