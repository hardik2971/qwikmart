'use client';
// Port of layouts/partials/sidebar.blade.php: sections, collapsible groups, Ctrl+K search, active green pill, collapse to icons.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { menuFor, type MenuChild, type MenuItem } from '@/lib/menu';
import { cx } from '@/components/ui';

function matches(rel: string, search: URLSearchParams, href: string, exact?: boolean) {
  const [p, qs] = href.split('?');
  if (qs) {
    const want = new URLSearchParams(qs);
    for (const [k, v] of want) if (search.get(k) !== v) return false;
  }
  return exact ? rel === p : rel === p || rel.startsWith(p + '/');
}

export function Sidebar({ collapsed, mobileOpen, onExpand, onCloseMobile }: { collapsed: boolean; mobileOpen: boolean; onExpand: () => void; onCloseMobile: () => void }) {
  const { can } = useAuth();
  const { panel, base } = usePanel();
  const pathname = usePathname();
  const search = useSearchParams();
  const rel = pathname.slice(base.length) || '/';
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onExpand(); setTimeout(() => inp.current?.focus(), 50); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onExpand]);

  const menu = useMemo(() => menuFor(panel).map((s) => ({
    ...s,
    items: s.items.filter((i) => can(i.perm)).map((i) => ({ ...i, children: i.children?.filter((c) => can(c.perm)) })),
  })).filter((s) => s.items.length), [panel, can]);

  const childActive = (c: MenuChild) => matches(rel, search, c.href, c.exact) || !!c.active?.some((a) => matches(rel, search, a));
  const itemActive = (i: MenuItem) => i.children?.length
    ? i.children.some(childActive) || !!i.active?.some((a) => matches(rel, search, a))
    : !!i.href && (matches(rel, search, i.href) || !!i.active?.some((a) => matches(rel, search, a)));

  const ql = q.toLowerCase();
  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" />}
      <aside className={cx('fixed inset-y-0 left-0 z-50 flex flex-col w-[270px] bg-white border-r border-line dark:border-dark-line dark:bg-dark-card transition-all duration-200 -translate-x-full lg:translate-x-0',
        collapsed && 'lg:w-[84px]', mobileOpen && 'translate-x-0')} data-testid="sidebar">
        <div className="h-[88px] shrink-0 flex items-center px-4 border-b border-line dark:border-dark-line">
          <Link href={`${base}/dashboard`} className="flex items-center">
            <img src="/images/brand/qwikmart-logo.png" alt="QwikMart" className="h-10 hide-collapsed dark:hidden" />
            <img src="/images/brand/qwikmart-logo-white.png" alt="QwikMart" className="h-10 hide-collapsed hidden dark:block" />
            <img src="/images/brand/qwikmart-icon.png" alt="QwikMart" className={cx('h-11 w-11 hidden', collapsed && 'lg:block')} />
          </Link>
        </div>
        <div className="px-2 pt-2 hide-collapsed">
          <label className="relative block">
            <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Search"
              className="w-full rounded-lg border border-line bg-white py-2 pl-3 pr-14 text-sm placeholder:text-slate-400 focus:border-primary focus:ring-primary/20 dark:bg-slate-800 dark:border-dark-line" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:border-dark-line">Ctrl K</span>
          </label>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-6">
          {menu.map((s) => {
            const labels = s.items.map((i) => `${i.label} ${(i.children || []).map((c) => c.label).join(' ')}`).join(' ').toLowerCase();
            if (ql && !labels.includes(ql)) return null;
            return (
              <div key={s.section}>
                <div className="section-label hide-collapsed">{s.section}</div>
                <div className={cx('hidden border-t border-line my-2 mx-3', collapsed && 'lg:block')} />
                {s.items.map((i) => <Item key={i.label} item={i} base={base} active={itemActive(i)} childActive={childActive} q={ql} collapsed={collapsed} onExpand={onExpand} onNavigate={onCloseMobile} />)}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function Item({ item, base, active, childActive, q, collapsed, onExpand, onNavigate }: {
  item: MenuItem; base: string; active: boolean; childActive: (c: MenuChild) => boolean; q: string; collapsed: boolean; onExpand: () => void; onNavigate: () => void;
}) {
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const Icon = item.icon;
  const search = `${item.label} ${(item.children || []).map((c) => c.label).join(' ')}`.toLowerCase();
  if (q && !search.includes(q)) return null;
  if (item.children?.length) {
    return (
      <div>
        <button type="button" title={item.label} onClick={() => { if (collapsed) { onExpand(); setOpen(true); } else setOpen(!open); }}
          className={cx('side-link w-full', active && 'text-primary font-semibold')}>
          <Icon className="w-5 h-5" />
          <span className="flex-1 text-left hide-collapsed">{item.label}</span>
          <ChevronDown className={cx('hide-collapsed w-4 h-4 text-slate-400 transition', (open || q) && 'rotate-180')} />
        </button>
        {(open || q) && !collapsed && (
          <div className="py-1 space-y-0.5">
            {item.children.map((c) => {
              if (q && !`${item.label} ${c.label}`.toLowerCase().includes(q)) return null;
              const a = childActive(c);
              return (
                <Link key={c.href + c.label} href={base + c.href} onClick={onNavigate} className={cx('side-sub', a && 'side-sub-active')}>
                  <span className={cx('w-1.5 h-1.5 rounded-full', a ? 'bg-primary' : 'bg-slate-300')} />{c.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  return (
    <Link href={base + item.href} title={item.label} onClick={onNavigate} className={cx('side-link', active && 'side-link-active')}>
      <Icon className="w-5 h-5" />
      <span className="hide-collapsed">{item.label}</span>
    </Link>
  );
}
