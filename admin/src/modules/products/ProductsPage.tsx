'use client';
// Manage Products — port of admin/products/index.blade.php (status tabs with counts, filters, grid/table view, card actions,
// recommendations modal, CSV export). Store panel: only products with store_id == storeId.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { QueryConstraint } from 'firebase/firestore';
import Papa from 'papaparse';
import { Copy, Download, Eye, Globe, LayoutGrid, Link2, List, PackageOpen, Pencil, Plus, Star, Store as StoreIcon, Trash2, Upload, Zap } from 'lucide-react';
import { countDocs, patchDoc, removeDoc, required, runQuery, where, orderBy, useBrands, useCategories, useStores } from '@/lib/firestore';
import { errMsg, imgUrl, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Product } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatusPill, cx } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { MODE_LABEL, RelationsModal, downloadText, duplicateProduct, isLow, priceRange, thumbOf, totalStock } from './shared';

const TABS: [string, string][] = [['all', 'All'], ['active', 'Active'], ['draft', 'Drafts'], ['inactive', 'Inactive'], ['pending_approval', 'Pending']];
const SORTS: Record<string, { field: string; dir: 'asc' | 'desc' }> = {
  latest: { field: 'created_at', dir: 'desc' }, oldest: { field: 'created_at', dir: 'asc' },
  price_asc: { field: 'min_price', dir: 'asc' }, price_desc: { field: 'min_price', dir: 'desc' }, name: { field: 'name.en', dir: 'asc' },
};

export default function ProductsPage() {
  const { p, storeId, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: stores = [] } = useStores();

  const [status, setStatus] = useState('all');
  const [f, setF] = useState({ category: '', brand: '', mode: '', store: '', stock: '', sort: 'latest' });
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [relations, setRelations] = useState<Product | null>(null);
  const [exporting, setExporting] = useState(false);
  const reload = () => setRefreshKey((k) => k + 1);

  useEffect(() => { try { const v = localStorage.getItem('sb-products-view'); if (v === 'grid' || v === 'table') setView(v); } catch { /* */ } }, []);
  const changeView = (v: 'grid' | 'table') => { setView(v); try { localStorage.setItem('sb-products-view', v); } catch { /* */ } };

  const catName = (id?: string | null) => (id ? tr(categories.find((c) => c.id === id)?.name, uiLang) : '');
  const brandName = (pr: Product) => brands.find((b) => b.id === pr.brand_id)?.name || pr.brand_name || '';
  const storeName = (id?: string | null) => (id ? stores.find((s) => s.id === id)?.name || 'Store' : 'Global');

  const scope: QueryConstraint[] = useMemo(() => (storeId ? [where('store_id', '==', storeId)] : []), [storeId]);
  // UI filters are optional for the query planner (e.g. category + search = two array-contains → one runs client-side)
  const uiConstraints: QueryConstraint[] = useMemo(() => {
    const cs: QueryConstraint[] = [];
    if (status !== 'all') cs.push(where('status', '==', status));
    if (f.category) cs.push(where('category_ids', 'array-contains', f.category));
    if (f.brand) cs.push(where('brand_id', '==', f.brand));
    if (f.mode) cs.push(where('fulfillment_type', '==', f.mode));
    if (!storeId && f.store) cs.push(where('store_id', '==', f.store === 'global' ? null : f.store));
    return cs;
  }, [scope, status, f.category, f.brand, f.mode, f.store, storeId]);

  // tab counts
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(TABS.map(async ([k]) => {
        try {
          const cs = [...scope, ...(k === 'all' ? [] : [where('status', '==', k)])];
          out[k] = await countDocs('products', cs);
        } catch { out[k] = 0; }
      }));
      if (alive) setCounts(out);
    })();
    return () => { alive = false; };
  }, [scope, refreshKey]);

  const stockOk = (pr: Product) => {
    if (f.stock === 'out') return totalStock(pr) <= 0;
    if (f.stock === 'low') return isLow(pr);
    return true;
  };
  const clientFilter = (r: Product, terms: string[]) => {
    const kw = r.search_keywords || [];
    return terms.slice(1).every((t) => kw.includes(t.slice(0, 15))) && stockOk(r);
  };

  const toggleStatus = async (pr: Product) => {
    try { await patchDoc('products', pr.id, { status: pr.status === 'active' ? 'inactive' : 'active' }); toast('Product status updated.'); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const toggleFeatured = async (pr: Product) => {
    try { await patchDoc('products', pr.id, { is_featured: !pr.is_featured }); toast(pr.is_featured ? 'Removed from featured' : 'Marked as featured'); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const del = async (pr: Product) => {
    if (!(await confirm({ title: 'Delete this product?', message: tr(pr.name, uiLang), danger: true }))) return;
    try { await removeDoc('products', pr.id); toast('Product deleted.'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const dup = async (pr: Product) => {
    if (!(await confirm({ title: 'Duplicate this product as a draft?', message: tr(pr.name, uiLang) }))) return;
    try { const id = await duplicateProduct(pr, storeId); toast('Product duplicated as draft.'); router.push(p(`/products/edit/${id}`)); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const list = (await runQuery<Product>('products', [...scope.map(required), ...uiConstraints, orderBy('created_at', 'desc')], { eqRequired: false, bound: 5000 })).filter(stockOk);
      const rows: (string | number | null)[][] = [];
      for (const pr of list) {
        for (const v of pr.variants?.length ? pr.variants : [null as any]) {
          rows.push([
            pr.id, tr(pr.name), catName(pr.category_id), catName(pr.sub_category_id), brandName(pr), pr.product_type, pr.fulfillment_type, pr.status,
            storeName(pr.store_id), v?.id ?? '', v?.name ?? '', v?.sku ?? '', v?.price ?? '', v?.sale_price ?? '', v?.stock ?? '',
          ]);
        }
      }
      const csv = Papa.unparse({ fields: ['product_id', 'name', 'category', 'sub_category', 'brand', 'type', 'mode', 'status', 'store', 'variant_id', 'variant', 'sku', 'price', 'sale_price', 'stock'], data: rows });
      downloadText(`products-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast(`Exported ${list.length} products`);
    } catch (e) { toast(errMsg(e), 'error'); }
    setExporting(false);
  };

  const canEdit = (pr: Product) => can('product.update') && (!storeId || pr.store_id === storeId);
  const canDelete = (pr: Product) => can('product.delete') && (!storeId || pr.store_id === storeId);

  const Actions = ({ pr }: { pr: Product }) => (
    <>
      <Link href={p(`/products/view/${pr.id}`)} className="icon-btn" title="View"><Eye className="w-4 h-4" /></Link>
      {canEdit(pr) && <Link href={p(`/products/edit/${pr.id}`)} className="icon-btn" title="Edit"><Pencil className="w-4 h-4" /></Link>}
      {can('product.create') && <button type="button" className="icon-btn" title="Duplicate" onClick={() => dup(pr)}><Copy className="w-4 h-4" /></button>}
      <button type="button" className="icon-btn" title="Recommendations (cross-sell / upsell)" onClick={() => setRelations(pr)}><Link2 className="w-4 h-4" /></button>
      {canDelete(pr) && <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(pr)}><Trash2 className="w-4 h-4" /></button>}
    </>
  );

  const StatusCell = ({ pr }: { pr: Product }) => canEdit(pr) && (pr.status === 'active' || pr.status === 'inactive')
    ? <button type="button" className={cx('toggle', pr.status === 'active' && 'toggle-on')} title="Toggle status" onClick={() => toggleStatus(pr)}><span className="toggle-dot" /></button>
    : <StatusPill status={pr.status} />;

  const columns: Column<Product>[] = [
    {
      key: 'product', header: 'Product', sort: 'name.en', render: (pr) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <img src={imgUrl(thumbOf(pr), tr(pr.name))} className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-line" alt="" />
          <div className="min-w-0">
            <Link href={p(`/products/view/${pr.id}`)} className="font-medium text-navy dark:text-white hover:text-primary line-clamp-1">{tr(pr.name, uiLang)}</Link>
            <p className="text-xs text-muted">{storeName(pr.store_id)} · {pr.product_type === 'variable' ? 'Variable' : 'Simple'}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (pr) => <>{catName(pr.category_id) || '-'}{pr.sub_category_id && <span className="block text-xs text-muted">{catName(pr.sub_category_id)}</span>}</> },
    { key: 'brand', header: 'Brand', render: (pr) => brandName(pr) || '-' },
    { key: 'mode', header: 'Mode', render: (pr) => <StatusPill status={pr.fulfillment_type} label={MODE_LABEL[pr.fulfillment_type]} /> },
    { key: 'variants', header: 'Variants', render: (pr) => pr.variants?.length ?? 0 },
    { key: 'price', header: 'Price', sort: 'min_price', className: 'whitespace-nowrap font-semibold', render: (pr) => priceRange(pr) },
    {
      key: 'stock', header: 'Stock', render: (pr) => {
        const s = totalStock(pr);
        return <span className={s <= 0 ? 'text-red-500 font-semibold' : isLow(pr) ? 'text-amber-600 font-semibold' : ''}>{s}</span>;
      },
    },
    ...(!storeId ? [{
      key: 'featured', header: 'Featured', render: (pr: Product) => (
        <button type="button" disabled={!canEdit(pr)} className={cx('toggle', pr.is_featured && 'toggle-on')} title="Toggle featured" onClick={() => toggleFeatured(pr)} data-testid="toggle-featured"><span className="toggle-dot" /></button>
      ),
    }] : []),
    { key: 'status', header: 'Status', render: (pr) => <StatusCell pr={pr} /> },
    { key: 'actions', header: 'Actions', align: 'right', render: (pr) => <div className="flex items-center justify-end gap-1.5"><Actions pr={pr} /></div> },
  ];

  const sel = 'input !w-auto !py-2';
  const filterBar = (
    <>
      <select className={cx(sel, 'min-w-[160px]')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
        <option value="">All Categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{tr(c.name, uiLang)}</option>)}
      </select>
      <select className={cx(sel, 'min-w-[140px]')} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}>
        <option value="">All Brands</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select className={sel} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
        <option value="">All Modes</option><option value="quick">Quick</option><option value="ecommerce">eCommerce</option><option value="both">Both</option>
      </select>
      {!storeId && (
        <select className={cx(sel, 'min-w-[140px]')} value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })}>
          <option value="">All Stores</option><option value="global">Global catalog</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <select className={sel} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })}>
        <option value="">All Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option>
      </select>
      <select className={sel} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
        <option value="latest">Latest</option><option value="oldest">Oldest</option><option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option><option value="name">Name (A-Z)</option>
      </select>
    </>
  );

  const viewToggle = (
    <div className="flex rounded-lg border border-line dark:border-dark-line overflow-hidden">
      {(['grid', 'table'] as const).map((v) => (
        <button key={v} type="button" title={v === 'grid' ? 'Grid view' : 'Table view'} onClick={() => changeView(v)}
          className={cx('w-9 h-9 flex items-center justify-center', view === v ? 'bg-primary text-white' : 'text-slate-500 hover:text-primary bg-white dark:bg-slate-800')}>
          {v === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </button>
      ))}
    </div>
  );

  const grid = (rows: Product[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((pr) => (
        <div key={pr.id} className="rounded-xl border border-line dark:border-dark-line bg-white dark:bg-dark-card overflow-hidden flex flex-col hover:shadow-md transition">
          <Link href={p(`/products/view/${pr.id}`)} className="relative block aspect-square bg-slate-50 dark:bg-slate-800">
            <img src={imgUrl(thumbOf(pr), tr(pr.name))} alt="" className="w-full h-full object-contain p-3" loading="lazy" />
            <StatusPill status={pr.status} className="absolute top-2 right-2" />
            {pr.is_featured && <span className="pill absolute top-2 left-2 bg-amber-400 text-white"><Star className="w-3 h-3" /> Featured</span>}
          </Link>
          <div className="p-3 flex-1 flex flex-col">
            <Link href={p(`/products/view/${pr.id}`)} className="font-semibold text-navy dark:text-white text-sm leading-snug line-clamp-2 hover:text-primary">{tr(pr.name, uiLang)}</Link>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate">{catName(pr.sub_category_id) || catName(pr.category_id) || 'Uncategorized'}</span>
              <span className="flex items-center gap-1 shrink-0"><Zap className="w-3 h-3 text-primary" />{MODE_LABEL[pr.fulfillment_type] ?? pr.fulfillment_type}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-primary">{priceRange(pr)}</span>
              <span className="text-xs text-muted">{pr.variants?.length ?? 0} {(pr.variants?.length ?? 0) === 1 ? 'Variant' : 'Variants'}</span>
            </div>
            {!storeId && pr.store_id && <p className="mt-1 text-[11px] text-muted flex items-center gap-1"><StoreIcon className="w-3 h-3" />{storeName(pr.store_id)}</p>}
            {storeId && !pr.store_id && <p className="mt-1 text-[11px] text-muted flex items-center gap-1"><Globe className="w-3 h-3" />Global catalog</p>}
            <div className="mt-auto pt-3 flex items-center justify-center gap-1.5 border-t border-line dark:border-dark-line">
              <Actions pr={pr} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader title="Products" subtitle={storeId ? 'Your store products' : undefined}>
        <button type="button" className="btn-outline" onClick={exportCsv} disabled={exporting} data-testid="export"><Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export'}</button>
        {can('product.create') && <Link href={p('/products/bulk-upload')} className="btn-outline"><Upload className="w-4 h-4" /> Bulk Upload</Link>}
        {can('product.create') && <Link href={p('/products/new')} className="btn-primary" data-testid="add-product"><Plus className="w-4 h-4" /> Add Product</Link>}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TABS.map(([k, label]) => {
          const active = status === k;
          return (
            <button key={k} type="button" className={cx('chip !py-1.5', active && 'chip-active')} onClick={() => setStatus(k)}>
              {label}
              <span className={cx('ml-1 rounded-full px-1.5 text-[11px] font-bold', active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200')}>{counts[k] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <DataTable<Product>
        key={f.sort}
        path="products"
        constraints={scope}
        extraConstraints={uiConstraints}
        deps={[storeId, status, f.category, f.brand, f.mode, f.store, f.stock]}
        defaultSort={SORTS[f.sort]}
        search="Search products / SKU"
        clientFilter={clientFilter}
        filterExtra={filterBar}
        toolbar={viewToggle}
        columns={columns}
        refreshKey={refreshKey}
        renderBody={view === 'grid' ? grid : undefined}
        empty={<span className="flex flex-col items-center gap-2"><PackageOpen className="w-10 h-10 text-slate-300" />No products found.
          {can('product.create') && <Link href={p('/products/new')} className="btn-soft btn-sm mt-2"><Plus className="w-3.5 h-3.5" /> Add Product</Link>}</span>}
        testId="products-table"
      />

      <RelationsModal product={relations} editable={!!relations && canEdit(relations)} onClose={() => setRelations(null)} onSaved={reload} />
    </div>
  );
}
