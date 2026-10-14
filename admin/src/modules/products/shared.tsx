'use client';
// Shared helpers for the products module (list, form, view, approvals, bulk tools).
import { useEffect, useState } from 'react';
import { Link2, Plus, Search, ShoppingCart, Star, TrendingUp, X, Info } from 'lucide-react';
import { fetchByIds, fetchList, patchDoc, ref, saveDoc, where, limit } from '@/lib/firestore';
import { money, slugify, tr, imgUrl, errMsg, searchKeywords } from '@/lib/format';
import type { Product, Variant } from '@/lib/types';
import { cx } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { usePanel } from '@/lib/panel';

export const MODE_LABEL: Record<string, string> = { quick: 'Quick', ecommerce: 'eCommerce', both: 'Both' };

/** Variant status may be stored as 'active'/'inactive' or as a boolean (bulk import). */
export const variantOn = (v: Pick<Variant, 'status'> | any) => v?.status === undefined || v.status === true || v.status === 'active' || v.status === 1;

export const effPrice = (v: Variant) => Number(v.sale_price != null && v.sale_price !== ('' as any) && Number(v.sale_price) > 0 ? v.sale_price : v.price) || 0;

export function priceRange(p: Pick<Product, 'variants' | 'min_price'>): string {
  const vs = p.variants ?? [];
  if (!vs.length) return p.min_price != null ? money(p.min_price) : '-';
  const prices = vs.map(effPrice);
  const lo = Math.min(...prices); const hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} - ${money(hi)}`;
}
export const totalStock = (p: Pick<Product, 'variants'>) => (p.variants ?? []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
export const isLow = (p: Pick<Product, 'variants'>) => (p.variants ?? []).some((v) => (Number(v.stock) || 0) <= (Number(v.low_stock_alert ?? 5) || 0));
export const thumbOf = (p: Pick<Product, 'thumbnail' | 'images'>) => p.thumbnail || p.images?.[0] || '';

export function Stars({ value, className = 'w-3.5 h-3.5' }: { value: number; className?: string }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx(className, i <= Math.round(value) ? 'fill-current' : 'text-slate-300')} />)}
    </div>
  );
}

/** Trigger a browser download of a text file. */
export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** Copy a product as a draft (port of ProductController@duplicate). Returns the new id. */
export async function duplicateProduct(p: Product, storeId: string | null): Promise<string> {
  const { id: _id, created_at: _c, updated_at: _u, rating_avg: _r, rating_count: _rc, sold_count: _s, in_stock_store_ids: _i, ...rest } = p as any;
  delete rest._path;
  const id = ref('products').id;
  const name = Object.fromEntries(Object.entries(p.name || {}).map(([k, v]) => [k, k === 'en' || !p.name?.en ? `${v} (Copy)` : v]));
  await saveDoc('products', id, {
    ...rest,
    name,
    slug: `${slugify(tr(p.name)) || 'product'}-${id.slice(0, 5).toLowerCase()}`,
    variants: (p.variants ?? []).map((v) => ({ ...v, id: newId(), sku: v.sku ? `${v.sku}-COPY` : v.sku })),
    status: 'draft', is_featured: false, rating_avg: 0, rating_count: 0, sold_count: 0,
    store_id: storeId ?? p.store_id ?? null,
    search_keywords: searchKeywords(name, ...(p.variants ?? []).map((v) => v.sku || '')),
  }, { merge: false });
  return id;
}

/** Product search for pickers — search_keywords array-contains (+ status active / own store in the store panel). */
export async function searchProducts(term: string, storeId: string | null, exclude: string[] = []): Promise<Product[]> {
  const t = term.trim().toLowerCase().split(/\s+/)[0]?.slice(0, 15);
  if (!t || t.length < 2) return [];
  const cs = [where('search_keywords', 'array-contains', t), ...(storeId ? [where('status', '==', 'active')] : []), limit(15)];
  const list = await fetchList<Product>('products', ...cs);
  return list.filter((p) => !exclude.includes(p.id));
}

function RowItem({ p, right }: { p: Product; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <img src={imgUrl(thumbOf(p), tr(p.name))} className="w-9 h-9 rounded-lg object-cover bg-slate-50 border border-line" alt="" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy dark:text-white truncate">{tr(p.name)}</p>
        <p className="text-xs text-muted">{priceRange(p)}{p.variants?.[0]?.sku ? ` · ${p.variants[0].sku}` : ''}</p>
      </div>
      {right}
    </div>
  );
}

/** Search + selected list of product ids (used by the form's cross-sell / up-sell pickers and the relations modal). */
export function ProductPicker({ value, onChange, excludeId, editable = true }: { value: string[]; onChange: (ids: string[]) => void; excludeId?: string; editable?: boolean }) {
  const { storeId } = usePanel();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const missing = value.filter((id) => !items.some((i) => i.id === id));
    if (!missing.length) { setItems((s) => s.filter((i) => value.includes(i.id))); return; }
    setLoading(true);
    fetchByIds<Product>('products', missing).catch(() => [] as Product[]).then((r) => {
      if (!alive) return;
      setItems((s) => [...s, ...r].filter((i) => value.includes(i.id)));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [value.join(',')]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) { setResults([]); return; }
      searchProducts(q, storeId, excludeId ? [excludeId] : []).then(setResults).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q, storeId, excludeId]);

  const add = (p: Product) => { if (!value.includes(p.id)) { setItems((s) => [...s, p]); onChange([...value, p.id]); } };
  const remove = (id: string) => onChange(value.filter((x) => x !== id));
  const ordered = value.map((id) => items.find((i) => i.id === id)).filter(Boolean) as Product[];

  return (
    <div>
      {editable && (
        <>
          <label className="relative block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" className="input !pl-9" placeholder="Search products to add…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {results.length > 0 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line dark:border-dark-line divide-y divide-line dark:divide-dark-line">
              {results.map((r) => (
                <RowItem key={'r' + r.id} p={r} right={value.includes(r.id)
                  ? <span className="text-xs text-primary font-semibold">Added</span>
                  : <button type="button" className="btn-soft btn-sm" onClick={() => add(r)}><Plus className="w-3.5 h-3.5" /> Add</button>} />
              ))}
            </div>
          )}
        </>
      )}
      <p className="mt-5 mb-2 text-xs font-bold uppercase tracking-wide text-muted">Currently added</p>
      <div className="rounded-xl border border-line dark:border-dark-line divide-y divide-line dark:divide-dark-line max-h-80 overflow-y-auto">
        {loading && !ordered.length ? <div className="p-6 text-center text-sm text-muted">Loading…</div>
          : !ordered.length ? <div className="p-6 text-center text-sm text-muted">No products added yet.</div>
            : ordered.map((it) => (
              <div key={it.id} className="border-l-4 border-primary/70">
                <RowItem p={it} right={editable && <button type="button" className="icon-btn hover:!text-red-500" title="Remove" onClick={() => remove(it.id)}><X className="w-4 h-4" /></button>} />
              </div>
            ))}
      </div>
    </div>
  );
}

export function RelationTabs({ tab, setTab, counts }: { tab: 'cross_sell' | 'up_sell'; setTab: (t: 'cross_sell' | 'up_sell') => void; counts: [number, number] }) {
  const cls = (on: boolean) => cx('btn justify-center rounded-lg py-2 text-sm font-semibold border', on ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary/40 dark:bg-slate-800');
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={cls(tab === 'cross_sell')} onClick={() => setTab('cross_sell')}>
          <ShoppingCart className="w-4 h-4" /> Cross-sell <span className={cx('ml-1 rounded-full px-2 text-xs', tab === 'cross_sell' ? 'bg-white/25' : 'bg-primary-50')}>{counts[0]}</span>
        </button>
        <button type="button" className={cls(tab === 'up_sell')} onClick={() => setTab('up_sell')}>
          <TrendingUp className="w-4 h-4" /> Upsell <span className={cx('ml-1 rounded-full px-2 text-xs', tab === 'up_sell' ? 'bg-white/25' : 'bg-primary-50')}>{counts[1]}</span>
        </button>
      </div>
      <p className="mt-3 text-xs text-muted flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        {tab === 'cross_sell' ? 'Shown alongside this product — items customers often buy together.' : 'Shown as better / premium alternatives to this product.'}
      </p>
    </>
  );
}

/** Recommendations (cross-sell / up-sell) modal — port of partials/relations-modal.blade.php. Saves on every change. */
export function RelationsModal({ product, editable, onClose, onSaved }: { product: Product | null; editable: boolean; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<'cross_sell' | 'up_sell'>('cross_sell');
  const [ids, setIds] = useState<{ cross_sell: string[]; up_sell: string[] }>({ cross_sell: [], up_sell: [] });
  useEffect(() => {
    if (product) { setTab('cross_sell'); setIds({ cross_sell: product.cross_sell_ids ?? [], up_sell: product.up_sell_ids ?? [] }); }
  }, [product?.id]);
  const save = async (next: string[]) => {
    if (!product) return;
    setIds((s) => ({ ...s, [tab]: next }));
    try {
      await patchDoc('products', product.id, { [`${tab}_ids`]: next });
      toast('Recommendations saved');
      onSaved?.();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <Modal open={!!product} onClose={onClose} size="2xl" title={<span className="flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" />Recommendations — {tr(product?.name)}</span>}>
      <div className="p-5">
        <RelationTabs tab={tab} setTab={setTab} counts={[ids.cross_sell.length, ids.up_sell.length]} />
        <div className="mt-4">
          <ProductPicker key={tab} value={ids[tab]} onChange={save} excludeId={product?.id} editable={editable} />
        </div>
      </div>
    </Modal>
  );
}
