'use client';
// Banners — port of admin/banners/index.blade.php (card grid with zone / mode / link type / status filters).
// Banners are a small collection: loaded once and filtered client-side (no composite indexes).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CircleOff, ImageOff, Layers, LayoutGrid, Link2, MapPin, Package, Plus, RefreshCw, ShoppingBag, Zap } from 'lucide-react';
import { removeDoc, useCategories, useInvalidate, useZones } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fmtDate, imgUrl, tr } from '@/lib/format';
import { Empty, Forbidden, PageHeader, RowActions, Spinner, StatusPill, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import type { Banner } from '@/lib/types';
import { isActive } from './shared';
import { useBannersAll, usePickItems } from './pickers';

const MODE_STYLES: Record<string, [string, typeof Zap, string]> = {
  quick: ['bg-amber-50 text-amber-600', Zap, 'Quick'], ecommerce: ['bg-blue-50 text-blue-600', ShoppingBag, 'eCommerce'], both: ['bg-purple-50 text-purple-600', Layers, 'Both'],
};
const LINK_ICONS: Record<string, typeof Zap> = { product: Package, category: LayoutGrid, url: Link2, none: CircleOff };
const PAGE = 12;

export default function BannersPage() {
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { data: banners = [], isLoading, isFetching, error, refetch } = useBannersAll();
  const { data: zones = [] } = useZones();
  const { data: cats = [] } = useCategories();
  const [zone, setZone] = useState('');
  const [mode, setMode] = useState('');
  const [linkType, setLinkType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return banners
      .filter((b) => !zone || (zone === 'all' ? !b.zone_id : b.zone_id === zone))
      .filter((b) => !mode || (b.mode || 'both') === mode)
      .filter((b) => !linkType || (b.link_type || 'none') === linkType)
      .filter((b) => !status || (isActive(b.status) ? 'active' : 'inactive') === status)
      .filter((b) => !t || `${Object.values(b.title || {}).join(' ')} ${b.link_value || ''}`.toLowerCase().includes(t))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
  }, [banners, zone, mode, linkType, status, q]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const productIds = pageRows.filter((b) => b.link_type === 'product' && b.link_value).map((b) => String(b.link_value));
  const products = usePickItems('products', productIds);
  const linkLabel = (b: Banner) => {
    if (b.link_type === 'product') return products.find((x) => x.id === b.link_value)?.name || (b.link_value ? '#' + b.link_value : '');
    if (b.link_type === 'category') { const c = cats.find((x) => x.id === b.link_value); return c ? tr(c.name, uiLang) : b.link_value ? '#' + b.link_value : ''; }
    if (b.link_type === 'url') return b.link_value || '';
    return '';
  };

  if (isStore) return <Forbidden />;
  const canEdit = can('banner.update');
  const canDelete = can('banner.delete');

  const remove = async (b: Banner) => {
    if (!(await confirm({ title: 'Delete banner?', message: 'Delete this banner?', danger: true }))) return;
    try { await removeDoc('banners', b.id); toast('Banner deleted.'); await invalidate('list', 'banners'); }
    catch (e: any) { toast(e?.message || 'Could not delete banner', 'error'); }
  };
  const set = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { fn(e.target.value); setPage(0); };

  return (
    <div>
      <PageHeader title="Banners" subtitle="Home screen slider banners per zone and shopping mode.">
        {can('banner.create') && <Link href={p('/banners/new')} className="btn-primary" data-testid="add-banner"><Plus className="w-4 h-4" /> Add Banner</Link>}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select value={zone} onChange={set(setZone)} className="input !w-44 !py-2">
            <option value="">All Zones</option>
            <option value="all">Global (all zones)</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={mode} onChange={set(setMode)} className="input !w-40 !py-2">
            <option value="">All Modes</option><option value="quick">Quick</option><option value="ecommerce">eCommerce</option><option value="both">Both</option>
          </select>
          <select value={linkType} onChange={set(setLinkType)} className="input !w-40 !py-2">
            <option value="">All Link Types</option><option value="product">Product</option><option value="category">Category</option><option value="url">URL</option><option value="none">No link</option>
          </select>
          <select value={status} onChange={set(setStatus)} className="input !w-36 !py-2">
            <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search banners" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setZone(''); setMode(''); setLinkType(''); setStatus(''); setQ(''); setPage(0); refetch(); }}>
              <RefreshCw className={cx('w-4 h-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        {isLoading ? <div className="py-16 flex justify-center"><Spinner /></div>
          : error ? <Empty text={(error as any)?.message || 'Failed to load banners'} />
            : !pageRows.length ? <Empty text="No banners found." icon={ImageOff} />
              : (
                <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {pageRows.map((b) => {
                    const [mCls, MIcon, mLabel] = MODE_STYLES[b.mode || 'both'] || MODE_STYLES.both;
                    const LIcon = LINK_ICONS[b.link_type || 'none'] || Link2;
                    const z = zones.find((x) => x.id === b.zone_id);
                    const label = linkLabel(b);
                    const title = tr(b.title, uiLang);
                    return (
                      <div key={b.id} className="rounded-xl border border-line dark:border-dark-line overflow-hidden bg-white dark:bg-dark-card hover:shadow-md transition flex flex-col">
                        <div className="relative aspect-[21/9] bg-slate-100 dark:bg-slate-800">
                          <img src={imgUrl(b.image, title || 'B')} className="w-full h-full object-cover" alt={title} loading="lazy" />
                          <div className="absolute top-2.5 left-2.5 flex gap-1.5"><span className={cx('pill shadow-sm', mCls)}><MIcon className="w-3 h-3" /> {mLabel}</span></div>
                          <div className="absolute top-2.5 right-2.5"><StatusPill status={isActive(b.status) ? 'active' : 'inactive'} /></div>
                          <span className="absolute bottom-2.5 left-2.5 pill bg-white/90 text-navy shadow-sm">#{b.sort_order ?? 0}</span>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <h3 className="font-bold text-navy dark:text-white truncate" title={title}>{title || '—'}</h3>
                          {tr(b.subtitle, uiLang) && <p className="text-xs text-muted truncate">{tr(b.subtitle, uiLang)}</p>}
                          <dl className="mt-2 space-y-1.5 text-sm">
                            <div className="flex items-center gap-2 text-muted min-w-0">
                              <LIcon className="w-4 h-4 shrink-0" />
                              <span className="capitalize">{(b.link_type || 'none') === 'none' ? 'No link' : b.link_type}</span>
                              {label && <span className="text-navy dark:text-slate-200 font-medium truncate" title={label}>· {label}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-muted">
                              <MapPin className="w-4 h-4 shrink-0" />
                              <span className={z ? 'text-navy dark:text-slate-200 font-medium' : ''}>{z ? z.name : 'All zones'}</span>
                            </div>
                          </dl>
                          <div className="mt-auto pt-3 border-t border-line dark:border-dark-line flex items-center justify-between">
                            <span className="text-xs text-muted">{fmtDate((b as any).created_at)}</span>
                            <RowActions edit={canEdit ? p(`/banners/edit/${b.id}`) : undefined} onDelete={canDelete ? () => remove(b) : undefined} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line dark:border-dark-line text-sm">
          <span className="text-muted">Total Records : {rows.length}</span>
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">Page {page + 1} of {pages}</span>
            <button type="button" className="icon-btn" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>‹</button>
            <button type="button" className="icon-btn" disabled={page + 1 >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
