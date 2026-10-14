'use client';
// Searchable single/multi pickers for products, categories, brands and banners (port of home-builder/partials/picker.blade.php).
// Products are searched server-side (search_keywords array-contains); categories / brands / banners are small collections filtered client-side.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchByIds, fetchList, limit, orderBy, useBrands, useCategories, useListQ, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { imgUrl, money, tr, searchKey, searchTerms } from '@/lib/format';
import { cx } from '@/components/ui';
import type { Banner, Brand, Category, Product } from '@/lib/types';

export type PickType = 'products' | 'categories' | 'brands' | 'banners';
export interface PickItem { id: string; name: string; image?: string | null; sub?: string | null }

export function productItem(p: Product, lang = 'en'): PickItem {
  const v = (p.variants || [])[0];
  const price = v ? (v.sale_price != null && v.sale_price > 0 && v.sale_price < v.price ? v.sale_price : v.price) : p.min_price;
  return { id: p.id, name: tr(p.name, lang) || p.id, image: imgUrl(p.thumbnail || p.images?.[0], tr(p.name, lang)), sub: price != null ? `${money(price)}${v?.name ? ' · ' + v.name : ''}` : null };
}
export function categoryItem(c: Category, all: Category[], lang = 'en'): PickItem {
  const parent = c.parent_id ? all.find((x) => x.id === c.parent_id) : null;
  return { id: c.id, name: tr(c.name, lang) || c.slug, image: imgUrl(c.icon || c.image, tr(c.name, lang)), sub: parent ? tr(parent.name, lang) : null };
}
export function brandItem(b: Brand): PickItem { return { id: b.id, name: b.name, image: imgUrl(b.logo, b.name), sub: null }; }
export function bannerItem(b: Banner, lang = 'en'): PickItem {
  return { id: b.id, name: tr(b.title, lang) || 'Banner', image: imgUrl(b.image, tr(b.title, lang)), sub: b.mode === 'ecommerce' ? 'eCommerce' : b.mode === 'quick' ? 'Quick' : 'Both' };
}

export function useBannersAll() {
  return useListQ<Banner>(['all'], 'banners', [], { staleTime: 60_000 });
}

/** Resolve the display items for a set of ids. */
export function usePickItems(type: PickType, ids: string[]) {
  const { uiLang } = usePanel();
  const { data: cats = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: banners = [] } = useBannersAll();
  const key = ids.join(',');
  const { data: products = [] } = useQuery({
    queryKey: ['pick-products', key],
    queryFn: () => fetchByIds<Product>('products', ids),
    enabled: type === 'products' && ids.length > 0,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const find = (id: string): PickItem => {
      if (type === 'categories') { const c = cats.find((x) => x.id === id); return c ? categoryItem(c, cats, uiLang) : { id, name: '#' + id }; }
      if (type === 'brands') { const b = brands.find((x) => x.id === id); return b ? brandItem(b) : { id, name: '#' + id }; }
      if (type === 'banners') { const b = banners.find((x) => x.id === id); return b ? bannerItem(b, uiLang) : { id, name: '#' + id }; }
      const p = products.find((x) => x.id === id); return p ? productItem(p, uiLang) : { id, name: '#' + id };
    };
    return ids.map(find);
  }, [type, key, cats, brands, banners, products, uiLang]);
}

async function searchProducts(q: string, storeId: string | null, lang: string): Promise<PickItem[]> {
  const terms = searchTerms(q);
  let list: Product[];
  if (terms.length) {
    list = await fetchList<Product>('products', where('search_keywords', 'array-contains', searchKey(terms)), ...(storeId ? [where('status', '==', 'active')] : []), limit(40));
    list = list.filter((p) => terms.slice(1).every((t) => (p.search_keywords || []).includes(t.slice(0, 15))));
  } else if (storeId) {
    list = await fetchList<Product>('products', where('status', '==', 'active'), limit(20));
  } else {
    list = await fetchList<Product>('products', orderBy('created_at', 'desc'), limit(20));
  }
  if (storeId) list = list.filter((p) => !p.store_id || p.store_id === storeId);
  return list.slice(0, 20).map((p) => productItem(p, lang));
}

export function EntityPicker({ type, value, onChange, multiple = true, label, placeholder = 'Search and select…', zoneId, mode, rootsOnly, className = '' }: {
  type: PickType; value: string | string[] | null | undefined; onChange: (v: any) => void; multiple?: boolean; label?: React.ReactNode; placeholder?: string;
  zoneId?: string | null; mode?: string | null; rootsOnly?: boolean; className?: string;
}) {
  const { uiLang, storeId } = usePanel();
  const ids = useMemo(() => (multiple ? (Array.isArray(value) ? value.map(String) : []) : (value ? [String(value)] : [])), [value, multiple]);
  const selected = usePickItems(type, ids);
  const { data: cats = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: banners = [] } = useBannersAll();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim().toLowerCase();
    if (type === 'products') {
      let alive = true;
      setLoading(true);
      const t = setTimeout(() => {
        searchProducts(q, storeId, uiLang).then((r) => alive && setResults(r)).catch(() => alive && setResults([])).finally(() => alive && setLoading(false));
      }, 300);
      return () => { alive = false; clearTimeout(t); };
    }
    const has = (s: string) => !term || s.toLowerCase().includes(term);
    if (type === 'categories') {
      setResults(cats.filter((c) => (!rootsOnly || !c.parent_id) && has(Object.values(c.name || {}).join(' ') + ' ' + c.slug)).slice(0, 30).map((c) => categoryItem(c, cats, uiLang)));
    } else if (type === 'brands') {
      setResults(brands.filter((b) => has(b.name)).slice(0, 30).map(brandItem));
    } else {
      setResults(banners
        .filter((b) => (!zoneId || !b.zone_id || b.zone_id === zoneId) && (!mode || !b.mode || b.mode === 'both' || b.mode === mode))
        .filter((b) => has(Object.values(b.title || {}).join(' ')))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).slice(0, 30).map((b) => bannerItem(b, uiLang)));
    }
    setLoading(false);
  }, [open, q, type, cats, brands, banners, zoneId, mode, rootsOnly]);

  const isSel = (id: string) => ids.includes(String(id));
  const toggle = (it: PickItem) => {
    if (multiple) onChange(isSel(it.id) ? ids.filter((x) => x !== it.id) : [...ids, it.id]);
    else { onChange(it.id); setOpen(false); }
  };
  const removeId = (id: string) => (multiple ? onChange(ids.filter((x) => x !== id)) : onChange(null));

  return (
    <div ref={box} className={cx('relative', className)}>
      {label && <label className="label">{label}</label>}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((it) => (
            <span key={it.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-50 pl-1 pr-2 py-0.5 text-xs text-navy dark:bg-slate-800 dark:border-dark-line dark:text-slate-200 max-w-full">
              {it.image ? <img src={it.image} className="w-5 h-5 rounded-full object-cover bg-white" alt="" /> : <span className="w-1" />}
              <span className="truncate max-w-[150px]">{it.name}</span>
              <button type="button" className="text-slate-400 hover:text-red-500 font-bold leading-none" onClick={() => removeId(it.id)}>&times;</button>
            </span>
          ))}
          {multiple && selected.length > 1 && <button type="button" className="text-[11px] text-red-500 font-semibold" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input type="text" className="input !py-2 !pl-8 text-sm" placeholder={placeholder} value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-white shadow-lg dark:bg-slate-800 dark:border-dark-line">
          {loading && <div className="px-3 py-2 text-xs text-muted">Searching…</div>}
          {results.map((r) => (
            <button key={r.id} type="button" onClick={() => toggle(r)}
              className={cx('w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-slate-700', isSel(r.id) && 'bg-primary-50/70')}>
              {r.image ? <img src={r.image} className="w-8 h-8 rounded-md object-cover bg-slate-100 shrink-0" alt="" /> : <span className="w-8 h-8 rounded-md bg-slate-100 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-navy dark:text-white">{r.name}</span>
                {r.sub && <span className="block truncate text-[11px] text-muted">{r.sub}</span>}
              </span>
              {isSel(r.id) && <span className="text-primary font-bold text-sm">&#10003;</span>}
            </button>
          ))}
          {!loading && !results.length && <div className="px-3 py-3 text-xs text-muted text-center">No results found</div>}
        </div>
      )}
    </div>
  );
}
