'use client';
// Port of layouts/panel.blade.php + route guard by custom claim `role`.
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag, X } from 'lucide-react';
import { useAuth, panelForRole, type Panel } from '@/lib/auth';
import { PanelProvider, usePanel } from '@/lib/panel';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Forbidden, Spinner } from '@/components/ui';
import { firstAllowedRoute, routePermission } from '@/lib/menu';

export function FullScreenLoader() {
  return <div className="min-h-screen flex items-center justify-center bg-adminbg dark:bg-dark-bg"><Spinner className="w-8 h-8" /></div>;
}

export function PanelShell({ panel, children }: { panel: Panel; children: ReactNode }) {
  const { loading, user, claims } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!user && panelForRole(claims.role, claims.store_id) === panel && (panel !== 'store' || !!claims.store_id);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace(`/${panel}/login?next=${encodeURIComponent(pathname)}`); return; }
    if (!allowed) {
      const target = panelForRole(claims.role, claims.store_id);
      router.replace(target && target !== panel ? `/${target}/dashboard` : `/${panel}/login?error=role`);
    }
  }, [loading, user, allowed, claims.role]);

  if (loading || !allowed) return <FullScreenLoader />;
  return (
    <PanelProvider panel={panel}>
      <Layout>{children}</Layout>
    </PanelProvider>
  );
}

/** Route-level permission guard: a staff / store-staff user opening a page their role does not grant sees Access denied. */
function RouteGuard({ children }: { children: ReactNode }) {
  const { panel, p } = usePanel();
  const { can, claims, roleReady, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const perm = routePermission(panel, pathname);
  // role doc still loading for a staff / store-staff user → wait instead of flashing Access denied
  const needsRole = claims.role === 'staff' || (claims.role === 'store' && !!(claims.role_id || profile?.role_id));
  const roleLoading = needsRole && (!roleReady || (!claims.role_id && !profile));
  const allowed = !perm || can(perm);
  const isDashboard = pathname === p('/dashboard');
  useEffect(() => {
    if (roleLoading || allowed || !isDashboard) return;
    const first = firstAllowedRoute(panel, can);
    if (first && first !== '/dashboard') router.replace(p(first));
  }, [roleLoading, allowed, isDashboard, panel, can]);
  if (perm && roleLoading) return <div className="py-16 flex justify-center"><Spinner /></div>;
  if (!allowed) return <Forbidden />;
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  const { settings, panel } = usePanel();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [buyNow, setBuyNow] = useState(true);
  useEffect(() => { try { setCollapsed(localStorage.getItem('sb-collapsed') === '1'); } catch { /* */ } }, []);
  const toggle = useCallback(() => {
    if (window.innerWidth < 1024) { setMobile((m) => !m); return; }
    setCollapsed((c) => { try { localStorage.setItem('sb-collapsed', c ? '0' : '1'); } catch { /* */ } return !c; });
  }, []);
  const expand = useCallback(() => setCollapsed(false), []);
  const year = new Date().getFullYear();
  return (
    <div className={collapsed ? 'sidebar-collapsed' : ''}>
      <Suspense fallback={null}>
        <Sidebar collapsed={collapsed} mobileOpen={mobile} onExpand={expand} onCloseMobile={() => setMobile(false)} />
      </Suspense>
      <div className={`transition-all duration-200 min-h-screen flex flex-col ${collapsed ? 'lg:pl-[84px]' : 'lg:pl-[270px]'}`}>
        <Header onToggleSidebar={toggle} />
        <main className="flex-1 p-4 md:p-6">
          <Suspense fallback={<div className="py-16 flex justify-center"><Spinner /></div>}><RouteGuard>{children}</RouteGuard></Suspense>
        </main>
        <footer className="px-6 py-4 text-xs text-muted flex flex-wrap justify-between gap-2 border-t border-line bg-white dark:bg-dark-card dark:border-dark-line">
          <span>© {year} QwikMart. All Rights Reserved.</span>
          <span>Hyperlocal Quick Commerce &amp; eCommerce</span>
        </footer>
      </div>
      {settings.demo_mode && panel !== 'delivery' && buyNow && (
        <a href="#" onClick={(e) => e.preventDefault()} className="fixed bottom-5 right-5 z-40 hidden md:flex items-center gap-3 rounded-xl bg-primary text-white pl-4 pr-2 py-2.5 shadow-lg hover:bg-primary-dark">
          <ShoppingBag className="w-5 h-5" />
          <span className="leading-tight"><b className="block text-sm">Buy Now</b><span className="text-[11px] opacity-90">Like what you see? Get the full version</span></span>
          <button type="button" className="ml-1 rounded-md p-1 hover:bg-white/15" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBuyNow(false); }}><X className="w-4 h-4" /></button>
        </a>
      )}
    </div>
  );
}
