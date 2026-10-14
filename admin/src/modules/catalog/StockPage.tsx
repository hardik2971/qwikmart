'use client';
// Stock Management — port of admin/stock/index.blade.php + StockController.
//  - Store mode (store panel = own store; admin picks a store): edits store_stocks/{storeId}_{variantId}
//    (store_id, product_id, variant_id, stock, price, sale_price, low_stock_alert). Blank prices fall back to the catalog price.
//  - Global mode (admin only): edits the central variants[] (stock / price / sale_price / low_stock_alert) on products/{id}.
// Products are paged from Firestore (25 per batch, "Load more"); the low / out-of-stock filter applies to the loaded rows.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { RefreshCw, Save, Undo2 } from 'lucide-react';
import { fetchByIds, fetchList, orderBy, patchDoc, planQuery, runSpec, saveDoc, useCategories, useStores, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { imgUrl, money, searchKey, searchTerms, tr } from '@/lib/format';
import { Empty, PageHeader, Spinner, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import type { Product, StoreStock, Variant } from '@/lib/types';
import { categoryOptions } from './shared';

const BATCH = 25;
type Edit = Partial<Record<'stock' | 'price' | 'sale_price' | 'low_stock_alert', string>>;
interface Row { key: string; product: Product; variant: Variant; ss: StoreStock | null }

const fmtN = (n: any) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100));
const numOrNull = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Math.round(Number(v) * 100) / 100);

export default function StockPage() {
  const { storeId: panelStore, isStore, countryId, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { data: stores = [] } = useStores();
  const { data: cats = [] } = useCategories();
  const visibleStores = useMemo(() => stores.filter((s) => !countryId || s.country_id === countryId), [stores, countryId]);

  const [store, setStore] = useState<string>(''); // store id | 'global'
  const [category, setCategory] = useState('');
  const [stockF, setStockF] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [ss, setSs] = useState<Record<string, StoreStock>>({});
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const cursor = useRef<DocumentSnapshot | null>(null);

  const storeId = isStore ? panelStore : store && store !== 'global' ? store : null;
  const global = !isStore && store === 'global';
  const ready = isStore ? !!panelStore : !!store;
  const canEdit = can('stock.update');

  useEffect(() => { if (!isStore && !store && visibleStores.length) setStore(visibleStores[0].id); }, [visibleStores, isStore, store]);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim().toLowerCase()), 350); return () => clearTimeout(t); }, [q]);

  const constraints = (): QueryConstraint[] => {
    const terms = searchTerms(dq);
    const cs: QueryConstraint[] = [];
    if (isStore) cs.push(where('status', '==', 'active'));
    if (terms.length) cs.push(where('search_keywords', 'array-contains', searchKey(terms)));
    else if (category) cs.push(where('category_ids', 'array-contains', category));
    if (!cs.length) cs.push(orderBy('created_at', 'desc'));
    return cs;
  };
  const clientOk = (p: Product) => {
    const terms = searchTerms(dq);
    if (terms.length > 1 && !terms.slice(1).every((t) => (p.search_keywords || []).includes(t.slice(0, 15)))) return false;
    if (terms.length && category && !(p.category_ids || [p.category_id, p.sub_category_id]).includes(category)) return false;
    if (storeId && p.store_id && p.store_id !== storeId) return false;
    return true;
  };

  const loadStoreStocks = async (list: Product[], sid: string | null) => {
    if (!sid) return;
    const ids = list.flatMap((p) => (p.variants || []).map((v) => `${sid}_${v.id}`));
    const docs = await fetchByIds<StoreStock>('store_stocks', ids);
    setSs((s) => { const n = { ...s }; for (const d of docs) n[d.id] = d; return n; });
  };

  const load = async (reset: boolean) => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      if (reset) { cursor.current = null; setSs({}); }
      // planned query (all StockPage shapes are index-covered → exact server query with cursor pagination)
      const pl = planQuery('products', constraints());
      const { rows: got, docs: snapDocs } = await runSpec<Product>('products', { ...pl, server: { ...pl.server, limit: BATCH + 1 } }, cursor.current);
      const docs = snapDocs.slice(0, BATCH);
      cursor.current = (docs[docs.length - 1] as DocumentSnapshot | undefined) || null;
      setMore(snapDocs.length > BATCH);
      let list = got.slice(0, BATCH).filter(clientOk);
      // store panel: also include the store's own (possibly inactive) products on the first page
      if (reset && isStore && panelStore && !dq) {
        const own = await fetchList<Product>('products', where('store_id', '==', panelStore)).catch(() => [] as Product[]);
        const seen = new Set(list.map((p) => p.id));
        list = [...own.filter((p) => !seen.has(p.id) && (!category || (p.category_ids || []).includes(category))), ...list];
      }
      setProducts((prev) => {
        if (reset) return list;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...list.filter((p) => !seen.has(p.id))];
      });
      await loadStoreStocks(list, storeId);
    } catch (e: any) {
      setError(e?.code === 'failed-precondition' ? 'This filter combination needs a Firestore index.' : e?.message || 'Failed to load products');
    }
    setLoading(false);
  };

  useEffect(() => { setEdits({}); load(true); }, [ready, storeId, global, category, dq, tick]);

  const rows: Row[] = useMemo(() => products.flatMap((p) => (p.variants || []).map((v) => ({
    key: `${p.id}:${v.id}`, product: p, variant: v, ss: storeId ? ss[`${storeId}_${v.id}`] || null : null,
  }))), [products, ss, storeId]);

  const effective = (r: Row) => {
    const e = edits[r.key] || {};
    const stock = e.stock !== undefined ? Number(e.stock || 0) : global ? Number(r.variant.stock || 0) : Number(r.ss?.stock ?? 0);
    const alertSrc = global ? r.variant.low_stock_alert : r.ss?.low_stock_alert ?? r.variant.low_stock_alert;
    const alert = e.low_stock_alert !== undefined ? Number(e.low_stock_alert || 0) : Number(alertSrc ?? 0);
    const state = stock <= 0 ? 'out' : stock <= alert ? 'low' : 'in';
    return { stock, alert, state };
  };
  const shown = rows.filter((r) => !stockF || effective(r).state === stockF);
  const dirtyCount = Object.keys(edits).length;

  const setField = (r: Row, f: keyof Edit, v: string) => setEdits((s) => ({ ...s, [r.key]: { ...s[r.key], [f]: v } }));
  const val = (r: Row, f: keyof Edit, orig: any) => (edits[r.key]?.[f] !== undefined ? edits[r.key]![f]! : fmtN(orig));

  const save = async () => {
    if (!dirtyCount) { toast('Change a value first', 'error'); return; }
    // validate
    for (const [key, e] of Object.entries(edits)) {
      const r = rows.find((x) => x.key === key); if (!r) continue;
      const price = e.price !== undefined ? numOrNull(e.price) : global ? r.variant.price : r.ss?.price ?? null;
      const sale = e.sale_price !== undefined ? numOrNull(e.sale_price) : global ? r.variant.sale_price ?? null : r.ss?.sale_price ?? null;
      const name = `${tr(r.product.name, uiLang)} (${r.variant.name || 'Default'})`;
      if (e.stock !== undefined && (e.stock.trim() === '' || Number(e.stock) < 0 || !Number.isFinite(Number(e.stock)))) { toast(`Enter a valid stock for ${name}`, 'error'); return; }
      if (global && (price === null || price < 0)) { toast(`Price is required for ${name}`, 'error'); return; }
      const base = price ?? r.variant.price;
      if (sale !== null && sale !== undefined && base != null && sale > base) { toast(`Sale price cannot exceed the price for ${name}`, 'error'); return; }
    }
    setSaving(true);
    try {
      let saved = 0;
      if (global) {
        const byProduct = new Map<string, Row[]>();
        for (const key of Object.keys(edits)) { const r = rows.find((x) => x.key === key); if (r) byProduct.set(r.product.id, [...(byProduct.get(r.product.id) || []), r]); }
        for (const [pid, list] of byProduct) {
          const p = products.find((x) => x.id === pid)!;
          const variants = (p.variants || []).map((v) => {
            const r = list.find((x) => x.variant.id === v.id); if (!r) return v;
            const e = edits[r.key];
            return {
              ...v,
              ...(e.stock !== undefined ? { stock: Math.max(0, Math.floor(Number(e.stock))) } : {}),
              ...(e.price !== undefined ? { price: numOrNull(e.price) ?? v.price } : {}),
              ...(e.sale_price !== undefined ? { sale_price: numOrNull(e.sale_price) } : {}),
              ...(e.low_stock_alert !== undefined ? { low_stock_alert: Math.max(0, Math.floor(Number(e.low_stock_alert) || 0)) } : {}),
            };
          });
          await patchDoc('products', pid, { variants });
          saved += list.length;
        }
      } else if (storeId) {
        await Promise.all(Object.entries(edits).map(async ([key, e]) => {
          const r = rows.find((x) => x.key === key); if (!r) return;
          const cur = r.ss;
          await saveDoc('store_stocks', `${storeId}_${r.variant.id}`, {
            store_id: storeId, product_id: r.product.id, variant_id: r.variant.id,
            stock: e.stock !== undefined ? Math.max(0, Math.floor(Number(e.stock))) : Number(cur?.stock ?? 0),
            price: e.price !== undefined ? numOrNull(e.price) : cur?.price ?? null,
            sale_price: e.sale_price !== undefined ? numOrNull(e.sale_price) : cur?.sale_price ?? null,
            low_stock_alert: e.low_stock_alert !== undefined ? Math.max(0, Math.floor(Number(e.low_stock_alert) || 0)) : Number(cur?.low_stock_alert ?? r.variant.low_stock_alert ?? 0),
          });
          saved++;
        }));
      }
      toast(saved ? `Stock updated for ${saved} ${saved === 1 ? 'item' : 'items'}.` : 'No changes were saved.');
      setEdits({});
      setTick((t) => t + 1);
    } catch (e: any) { toast(e?.message || 'Could not save stock', 'error'); }
    setSaving(false);
  };

  const currentStore = stores.find((s) => s.id === storeId);
  const cur = money(0).replace(/[0-9.,]/g, '').trim();
  const catOpts = useMemo(() => categoryOptions(cats, uiLang), [cats, uiLang]);

  const priceInput = (r: Row, f: 'price' | 'sale_price', orig: any, placeholder: string) => (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{cur}</span>
      <input type="number" min={0} step="0.01" disabled={!canEdit} value={val(r, f, orig)} placeholder={placeholder}
        onChange={(e) => setField(r, f, e.target.value)} className="input !py-1.5 !pl-6 !w-28" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Stock Management"
        subtitle={global ? 'Editing global catalog stock & prices (product variants).' : `Editing stock for ${currentStore?.name ?? 'store'}. Blank price fields fall back to the catalog price.`}>
        {dirtyCount > 0 && <span className="text-sm text-muted"><span className="font-bold text-navy dark:text-white">{dirtyCount}</span> unsaved change(s)</span>}
        {dirtyCount > 0 && <button type="button" className="btn-outline" onClick={() => setEdits({})}><Undo2 className="w-4 h-4" /> Discard</button>}
        {canEdit && <button type="button" className={cx('btn-primary', !dirtyCount && 'opacity-60')} onClick={save} disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}</button>}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          {!isStore && (
            <select value={store} onChange={(e) => setStore(e.target.value)} className="input !w-56 !py-2" data-testid="store-select">
              {visibleStores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>)}
              <option value="global">Global (catalog default)</option>
            </select>
          )}
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input !w-48 !py-2">
            <option value="">All Categories</option>
            {catOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={stockF} onChange={(e) => setStockF(e.target.value)} className="input !w-40 !py-2">
            <option value="">All Stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search product" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setQ(''); setCategory(''); setStockF(''); setTick((t) => t + 1); }}>
              <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th><th>SKU</th><th>Catalog Price</th>
                {!global && <th>Central Stock</th>}
                <th>{global ? 'Stock' : 'Store Stock'}</th>
                <th>{global ? 'Price (MRP)' : 'Price Override'}</th>
                <th>{global ? 'Sale Price' : 'Sale Price Override'}</th>
                <th>Alert At</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!ready ? <tr><td colSpan={9}><Empty text={isStore ? 'Your account is not linked to a store.' : 'Create a store first.'} /></td></tr>
                : loading && !rows.length ? <tr><td colSpan={9} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                  : error ? <tr><td colSpan={9}><Empty text={error} /></td></tr>
                    : !shown.length ? <tr><td colSpan={9}><Empty text="No products found." /></td></tr>
                      : shown.map((r) => {
                        const { product: p, variant: v } = r;
                        const { state } = effective(r);
                        const thumb = p.thumbnail || v.image || p.images?.[0];
                        const name = tr(p.name, uiLang);
                        const cat = cats.find((c) => c.id === (p.sub_category_id || p.category_id));
                        const sale = v.sale_price != null && v.sale_price > 0 && v.sale_price < v.price;
                        return (
                          <tr key={r.key} className={edits[r.key] ? '!bg-amber-50/60 dark:!bg-amber-500/5' : ''}>
                            <td>
                              <div className="flex items-center gap-3 min-w-[220px]">
                                <img src={imgUrl(thumb, name)} className="w-10 h-10 rounded-lg object-cover border border-line dark:border-dark-line bg-slate-50" alt="" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-navy dark:text-white truncate max-w-[260px]">{name || '—'}</div>
                                  <div className="text-xs text-muted">
                                    {v.name || 'Default'}{cat ? ` · ${tr(cat.name, uiLang)}` : ''}
                                    {!global && !r.ss && <span className="ml-1 text-amber-600" title="No store stock row yet — not stocked in this store">· not stocked</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="font-mono text-xs text-muted">{v.sku || '—'}</td>
                            <td className="whitespace-nowrap">
                              {sale ? <><span className="font-semibold">{money(v.sale_price)}</span><span className="block text-xs text-muted line-through">{money(v.price)}</span></>
                                : <span className="font-semibold">{money(v.price)}</span>}
                            </td>
                            {!global && <td className="text-muted">{Number(v.stock ?? 0)}</td>}
                            <td>
                              <input type="number" min={0} step={1} disabled={!canEdit} value={val(r, 'stock', global ? v.stock : r.ss?.stock ?? '')} placeholder={global ? '0' : '—'}
                                onChange={(e) => setField(r, 'stock', e.target.value)}
                                className={cx('input !py-1.5 !w-24 text-center font-semibold', state === 'out' ? 'text-red-500' : state === 'low' ? 'text-amber-600' : '')} />
                            </td>
                            <td>{priceInput(r, 'price', global ? v.price : r.ss?.price, global ? '' : fmtN(v.price))}</td>
                            <td>{priceInput(r, 'sale_price', global ? v.sale_price : r.ss?.sale_price, global ? '—' : fmtN(v.sale_price))}</td>
                            <td>
                              <input type="number" min={0} step={1} disabled={!canEdit} value={val(r, 'low_stock_alert', global ? v.low_stock_alert ?? 0 : r.ss?.low_stock_alert ?? v.low_stock_alert ?? 0)}
                                onChange={(e) => setField(r, 'low_stock_alert', e.target.value)} className="input !py-1.5 !w-20 text-center" />
                            </td>
                            <td>
                              {state === 'out' ? <span className="pill bg-red-50 text-red-600">Out of stock</span>
                                : state === 'low' ? <span className="pill bg-amber-50 text-amber-600">Low stock</span>
                                  : <span className="pill bg-primary-50 text-primary">In stock</span>}
                            </td>
                          </tr>
                        );
                      })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line dark:border-dark-line text-sm">
          <span className="text-muted">Showing {shown.length} of {rows.length} loaded variants ({products.length} products){stockF ? ' · stock filter applies to loaded rows' : ''}</span>
          {more && <button type="button" className="btn-outline btn-sm" disabled={loading} onClick={() => load(false)}>{loading ? 'Loading…' : 'Load more'}</button>}
        </div>
      </div>
    </div>
  );
}
