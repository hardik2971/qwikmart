'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight, List, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Category, ProductFilters } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useCtxKey, useCurrency } from '@/hooks';
import { EmptyState } from '../ui';
import ProductCard, { ProductCardSkeleton } from './ProductCard';

const PRICE_PRESETS: Array<[number, number | null]> = [
  [0, 99],
  [100, 499],
  [500, 1999],
  [2000, 9999],
  [10000, null],
];
const SORTS: Array<[ProductFilters['sort'], string]> = [
  ['', 'Relevance'],
  ['popular', 'Popularity'],
  ['price_asc', 'Price: Low to High'],
  ['price_desc', 'Price: High to Low'],
  ['discount', 'Discount'],
  ['rating', 'Customer Rating'],
  ['newest', 'Newest First'],
];

/** Listing views: list, or a grid with 2–5 columns (desktop). Saved per browser. */
type View = 'list' | 2 | 3 | 4 | 5;
const VIEWS: View[] = ['list', 2, 3, 4, 5];
const VIEW_KEY = 'qm-listing-view';
const GRID_COLS: Record<Exclude<View, 'list'>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5',
};
const MAX_ROOTS = 8;
const MAX_BRANDS = 8;

export function useCategoryTree() {
  const ctx = useCtxKey();
  return useQuery({
    queryKey: ['categories-tree', ...ctx],
    queryFn: () => api.categories(),
    staleTime: 300_000,
  });
}

export function flattenTree(tree: Category[] = []): Category[] {
  return tree.flatMap((c) => [c, ...(c.children || [])]);
}

/** Accordion section of the filter sidebar. Content is never put in its own scroll area. */
function FilterGroup({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-4 text-[15px] font-semibold text-ink" aria-expanded={open}>
        {title}
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted rtl:rotate-180" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ColumnsIcon({ n }: { n: number }) {
  const w = 16 / n - 1;
  return (
    <svg viewBox="0 0 16 14" className="h-4 w-4" fill="currentColor" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={i * (w + 1)} y="0" width={w} height="14" rx="0.6" />
      ))}
    </svg>
  );
}

export default function ProductListing({ category }: { category?: Category | null }) {
  const t = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useCtxKey();
  const { fmt } = useCurrency();
  const [drawer, setDrawer] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [moreRoots, setMoreRoots] = useState(false);
  const [moreBrands, setMoreBrands] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>(5);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      const v = (saved === 'list' ? 'list' : Number(saved)) as View;
      if (VIEWS.includes(v)) setView(v);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  const q = sp.get('q') || '';
  const catParam = sp.get('cat');
  const brandIds = (sp.get('brand') || '').split(',').filter(Boolean);
  const min = Number(sp.get('min')) || undefined;
  const max = Number(sp.get('max')) || undefined;
  const sort = (sp.get('sort') || '') as ProductFilters['sort'];
  const page = Number(sp.get('page')) || 1;

  const tree = useCategoryTree();
  const brands = useQuery({ queryKey: ['brands'], queryFn: api.brands, staleTime: 600_000 });

  const categoryId = catParam || (category ? String(category.id) : undefined);
  // attribute facets (Color / Size / Weight …) from /products/filters; each one is a URL param named by its key
  const facets = useQuery({
    queryKey: ['product-facets', categoryId ?? null, ...ctx],
    queryFn: () => api.productFacets(categoryId),
    staleTime: 300_000,
  });
  const attrFacets = facets.data?.attributes || [];
  const selectedAttrs: Record<string, string[]> = {};
  for (const f of attrFacets) {
    const vals = (sp.get(f.key) || '').split(',').filter(Boolean);
    if (vals.length) selectedAttrs[f.key] = vals;
  }
  const attrCount = Object.values(selectedAttrs).reduce((n, v) => n + v.length, 0);
  const filters: ProductFilters = {
    q,
    category_id: categoryId,
    brand_id: brandIds,
    min_price: min,
    max_price: max,
    sort,
    page,
    per_page: 20,
    attributes: selectedAttrs,
  };
  const products = useQuery({
    queryKey: ['products', filters, ...ctx],
    queryFn: () => api.products(filters),
    placeholderData: (prev) => prev,
  });

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const toggleList = (key: string, list: string[], value: string) =>
    setParam({ [key]: (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]).join(',') });

  const clearAll = () => router.push(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });

  // Category tree: every root is listed; the branch holding the current category starts expanded.
  const rootCats = useMemo(() => tree.data || [], [tree.data]);
  const activeRootId = useMemo(() => {
    const root = rootCats.find((c) => String(c.id) === categoryId || c.children?.some((s) => String(s.id) === categoryId));
    return root ? String(root.id) : null;
  }, [rootCats, categoryId]);
  const isOpen = (id: string) => expanded.has(id) || id === activeRootId;
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visibleRoots = moreRoots ? rootCats : rootCats.filter((c, i) => i < MAX_ROOTS || String(c.id) === activeRootId);

  const brandList = ((facets.data?.brands?.length ? facets.data.brands : brands.data) ?? []).filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase()),
  );
  const shownBrands = moreBrands || brandSearch ? brandList : brandList.filter((b, i) => i < MAX_BRANDS || brandIds.includes(String(b.id)));

  const activeCount = brandIds.length + attrCount + (min || max ? 1 : 0) + (catParam ? 1 : 0);

  const sidebar = (
    <div>
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-lg font-bold text-ink">{t('filters')}</span>
        <button
          onClick={clearAll}
          disabled={activeCount === 0}
          className={clsx('text-sm font-semibold', activeCount > 0 ? 'text-danger hover:underline' : 'cursor-default text-muted/60')}
        >
          {t('clear_all')}
          {activeCount > 0 && ` (${activeCount})`}
        </button>
      </div>

      <FilterGroup title="Browse Categories" defaultOpen>
        {tree.isLoading && <div className="skeleton h-24" />}
        <ul className="space-y-0.5">
          {visibleRoots.map((c) => {
            const id = String(c.id);
            const open = isOpen(id);
            const hasKids = !!c.children?.length;
            return (
              <li key={c.id}>
                <div className="flex items-center">
                  <button
                    onClick={() => hasKids && toggleExpand(id)}
                    className={clsx('flex h-7 w-6 shrink-0 items-center justify-center text-muted', !hasKids && 'invisible')}
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    <ChevronRight className={clsx('h-4 w-4 transition rtl:rotate-180', open && 'rotate-90 rtl:rotate-90')} />
                  </button>
                  <button
                    onClick={() => setParam({ cat: catParam === id ? null : id })}
                    className={clsx('flex-1 rounded-md px-1.5 py-1.5 text-start text-[15px]', id === categoryId ? 'font-semibold text-primary' : 'text-ink hover:text-primary')}
                  >
                    {c.name}
                  </button>
                </div>
                {open && hasKids && (
                  <ul className="mb-1 ms-6 border-s border-line ps-3">
                    {c.children!.map((sc) => (
                      <li key={sc.id}>
                        <button
                          onClick={() => setParam({ cat: String(sc.id) })}
                          className={clsx('block w-full py-1 text-start text-sm', String(sc.id) === categoryId ? 'font-semibold text-primary' : 'text-muted hover:text-ink')}
                        >
                          {sc.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {rootCats.length > MAX_ROOTS && (
          <button onClick={() => setMoreRoots((m) => !m)} className="mt-2 ps-6 text-sm font-semibold text-primary hover:underline">
            {moreRoots ? 'Less' : 'More'}
          </button>
        )}
      </FilterGroup>

      <FilterGroup title="Brands" defaultOpen={brandIds.length > 0}>
        <input value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} placeholder="Search brand" className="input mb-3 py-1.5" />
        <div className="space-y-2">
          {shownBrands.map((b) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={brandIds.includes(String(b.id))}
                onChange={() => toggleList('brand', brandIds, String(b.id))}
                className="h-4 w-4 accent-[#0E9623]"
              />
              {b.name}
            </label>
          ))}
          {brandList.length === 0 && <p className="text-sm text-muted">No brands found</p>}
        </div>
        {!brandSearch && brandList.length > MAX_BRANDS && (
          <button onClick={() => setMoreBrands((m) => !m)} className="mt-3 text-sm font-semibold text-primary hover:underline">
            {moreBrands ? 'Show less' : `+ ${brandList.length - MAX_BRANDS} more`}
          </button>
        )}
      </FilterGroup>

      {attrFacets.map((f) => {
        const selected = selectedAttrs[f.key] || [];
        const swatches = f.values.some((v) => v.color_hex);
        return (
          <FilterGroup key={f.key} title={f.name} defaultOpen={selected.length > 0}>
            <div className="flex flex-wrap gap-2">
              {f.values.map((v) =>
                swatches && v.color_hex ? (
                  <button
                    key={v.id}
                    title={v.value}
                    onClick={() => toggleList(f.key, selected, v.value)}
                    className={clsx('h-7 w-7 rounded-full border-2 transition', selected.includes(v.value) ? 'border-primary ring-2 ring-primary/30' : 'border-line')}
                    style={{ background: v.color_hex }}
                    aria-label={v.value}
                  />
                ) : (
                  <button
                    key={v.id}
                    onClick={() => toggleList(f.key, selected, v.value)}
                    className={clsx('chip min-w-10 justify-center py-1', selected.includes(v.value) && 'chip-active')}
                  >
                    {v.value}
                  </button>
                ),
              )}
            </div>
          </FilterGroup>
        );
      })}

      <FilterGroup title="Price Range" defaultOpen={!!(min || max)}>
        <div className="space-y-2">
          {PRICE_PRESETS.map(([a, b]) => {
            const active = (min || 0) === a && (max ?? null) === b;
            return (
              <label key={a} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                <input
                  type="radio"
                  name="price"
                  checked={active}
                  onChange={() => setParam({ min: a ? String(a) : null, max: b ? String(b) : null })}
                  className="h-4 w-4 accent-[#0E9623]"
                />
                {b ? `${fmt(a)} – ${fmt(b)}` : `${fmt(a)} & above`}
              </label>
            );
          })}
        </div>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setParam({ min: String(f.get('min') || ''), max: String(f.get('max') || '') });
          }}
        >
          <input name="min" defaultValue={min} placeholder="Min" className="input px-2 py-1.5" inputMode="numeric" />
          <input name="max" defaultValue={max} placeholder="Max" className="input px-2 py-1.5" inputMode="numeric" />
          <button className="btn-soft px-3 py-1.5">Go</button>
        </form>
      </FilterGroup>
    </div>
  );

  const meta = products.data?.meta;
  const items = products.data?.items || [];

  return (
    // The sidebar is a normal card (not sticky, no own scroll area) so the page has a single scrollbar.
    <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="hidden lg:block">
        <div className="card overflow-hidden p-0">{sidebar}</div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[60] bg-black/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-y-0 start-0 w-[85%] max-w-sm overflow-y-auto bg-surface animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDrawer(false)} className="absolute end-3 top-3 z-10 rounded-full p-1.5 hover:bg-soft" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div>
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm text-body">
            {products.isLoading ? (
              'Loading…'
            ) : (
              <>
                <b className="text-ink">{meta?.total ?? items.length}</b> Products Found
              </>
            )}
            {q && <span className="text-muted">for “{q}”</span>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawer(true)} className="btn-ghost px-3 py-1.5 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> {t('filters')} {activeCount > 0 && `(${activeCount})`}
            </button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">{t('sort_by')}</span>
              <select value={sort || ''} onChange={(e) => setParam({ sort: e.target.value })} className="input w-auto py-1.5">
                {SORTS.map(([v, l]) => (
                  <option key={l} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="hidden items-center gap-1 rounded-lg bg-soft p-1 md:flex" role="group" aria-label="Layout">
              {VIEWS.map((v) => (
                <button
                  key={String(v)}
                  onClick={() => chooseView(v)}
                  aria-pressed={view === v}
                  title={v === 'list' ? 'List view' : `${v} columns`}
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition', view === v ? 'bg-primary text-white shadow-sm' : 'text-ink/70 hover:bg-surface')}
                >
                  {v === 'list' ? <List className="h-4 w-4" /> : <ColumnsIcon n={v} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!products.isLoading && items.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="h-9 w-9" />}
            image="/images/empty/empty-search.webp"
            title="No products found"
            subtitle="Try removing some filters or searching for something else."
            action={
              <button onClick={clearAll} className="btn-primary">
                {t('clear_all')}
              </button>
            }
          />
        ) : (
          <div className={clsx('grid gap-3', view === 'list' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : GRID_COLS[view])}>
            {products.isLoading
              ? Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : items.map((p) => <ProductCard key={p.id} product={p} layout={view === 'list' ? 'list' : 'grid'} />)}
          </div>
        )}

        {meta && meta.last_page > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} className="btn-ghost px-3 py-1.5">
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            {Array.from({ length: meta.last_page }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setParam({ page: String(n) })}
                className={clsx('h-9 w-9 rounded-lg text-sm font-semibold', n === page ? 'bg-primary text-white' : 'border border-line bg-surface text-ink hover:bg-soft')}
              >
                {n}
              </button>
            ))}
            <button disabled={page >= meta.last_page} onClick={() => setParam({ page: String(page + 1) })} className="btn-ghost px-3 py-1.5">
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
