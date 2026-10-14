'use client';
// Bulk Update (admin) — port of admin/products/bulk-update.blade.php as an editable grid: price / sale price / stock / status per
// variant, saved with batchUpdate on products/{id}.variants. A CSV (sku, price, sale_price, stock) can be applied to the loaded rows by SKU.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { Download, FileDown, FileSpreadsheet, RefreshCw, Save, Undo2 } from 'lucide-react';
import { batchUpdate, fetchList, limit, orderBy, where, useCategories } from '@/lib/firestore';
import { errMsg, imgUrl, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Product, Variant } from '@/lib/types';
import { Forbidden, PageHeader, Spinner, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { downloadText, thumbOf, variantOn } from './shared';

interface Edit { price?: string; sale_price?: string; stock?: string; status?: boolean }
const PAGE = 50;
const k = (pid: string, vid: string) => `${pid}::${vid}`;
const sv = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export default function BulkUpdatePage() {
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [size, setSize] = useState(PAGE);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [csvMsg, setCsvMsg] = useState('');

  useEffect(() => {
    if (isStore) return;
    let alive = true;
    setLoading(true);
    const cs = [
      ...(category ? [where('category_ids', 'array-contains', category)] : []),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('created_at', 'desc'), limit(size),
    ];
    fetchList<Product>('products', ...cs).then((l) => { if (alive) setProducts(l); })
      .catch((e) => { if (alive) { toast(errMsg(e), 'error'); setProducts([]); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [category, status, size, tick, isStore]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((pr) => tr(pr.name).toLowerCase().includes(t) || (pr.variants ?? []).some((v) => (v.sku || '').toLowerCase().includes(t)));
  }, [products, q]);

  const val = (pr: Product, v: Variant, f: keyof Edit) => {
    const e = edits[k(pr.id, v.id)];
    if (e && e[f] !== undefined) return e[f];
    return f === 'status' ? variantOn(v) : sv((v as any)[f]);
  };
  const setVal = (pr: Product, v: Variant, f: keyof Edit, value: string | boolean) => {
    setEdits((s) => {
      const key = k(pr.id, v.id);
      const next: Edit = { ...(s[key] || {}), [f]: value };
      const orig = f === 'status' ? variantOn(v) : sv((v as any)[f]);
      if (orig === value) delete (next as any)[f];
      const out = { ...s };
      if (Object.keys(next).length) out[key] = next; else delete out[key];
      return out;
    });
  };
  const dirty = Object.keys(edits).length;

  const save = async () => {
    const byProduct = new Map<string, Product>();
    for (const key of Object.keys(edits)) { const pid = key.split('::')[0]; const pr = products.find((x) => x.id === pid); if (pr) byProduct.set(pid, pr); }
    const problems: string[] = [];
    const updates = [...byProduct.values()].map((pr) => {
      const variants = (pr.variants ?? []).map((v) => {
        const e = edits[k(pr.id, v.id)];
        if (!e) return v;
        const price = e.price !== undefined ? Number(e.price) : Number(v.price);
        const sale = e.sale_price !== undefined ? (e.sale_price === '' ? null : Number(e.sale_price)) : (v.sale_price ?? null);
        const stock = e.stock !== undefined ? Math.trunc(Number(e.stock) || 0) : Number(v.stock || 0);
        if (!(price > 0)) problems.push(`${tr(pr.name)} / ${v.name}: price must be > 0`);
        if (sale != null && sale > price) problems.push(`${tr(pr.name)} / ${v.name}: sale price is higher than MRP`);
        return { ...v, price, sale_price: sale, stock, status: (e.status !== undefined ? e.status : variantOn(v)) ? 'active' : 'inactive' } as Variant;
      });
      const prices = variants.filter(variantOn).map((v) => (v.sale_price != null && v.sale_price > 0 ? v.sale_price : v.price));
      return { path: 'products', id: pr.id, data: { variants, min_price: prices.length ? Math.min(...prices) : 0 } };
    });
    if (problems.length) { toast(problems[0], 'error'); return; }
    setSaving(true);
    try {
      await batchUpdate(updates);
      toast(`${updates.length} product(s) updated.`);
      setEdits({}); setTick((t) => t + 1);
    } catch (e) { toast(errMsg(e), 'error'); }
    setSaving(false);
  };

  const exportCurrent = () => {
    const data = products.flatMap((pr) => (pr.variants ?? []).map((v) => [v.sku || '', v.price ?? '', v.sale_price ?? '', v.stock ?? 0, tr(pr.name), v.name]));
    downloadText('products-prices-stock.csv', Papa.unparse({ fields: ['sku', 'price', 'sale_price', 'stock', 'product', 'variant'], data }));
  };
  const sample = () => downloadText('qwikmart-bulk-update-sample.csv', Papa.unparse({ fields: ['sku', 'price', 'sale_price', 'stock'], data: [['SKU-1001', '120', '99', '50'], ['SKU-1002', '', '', '25']] }));

  const applyCsv = (file?: File) => {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.replace(/^﻿/, '').trim().toLowerCase(),
      complete: (res) => {
        if (!(res.meta.fields ?? []).includes('sku')) { toast('The CSV must contain a sku column', 'error'); return; }
        const bySku = new Map<string, { pr: Product; v: Variant }>();
        products.forEach((pr) => (pr.variants ?? []).forEach((v) => { if (v.sku) bySku.set(v.sku.trim().toLowerCase(), { pr, v }); }));
        let matched = 0; const missing: string[] = [];
        const next = { ...edits };
        for (const r of res.data) {
          const sku = (r.sku || '').trim().toLowerCase();
          if (!sku) continue;
          const hit = bySku.get(sku);
          if (!hit) { missing.push(r.sku); continue; }
          const key = k(hit.pr.id, hit.v.id);
          const e: Edit = { ...(next[key] || {}) };
          if ((r.price ?? '').trim() !== '') e.price = r.price.trim();
          if ((r.sale_price ?? '').trim() !== '') e.sale_price = r.sale_price.trim();
          if ((r.stock ?? '').trim() !== '') e.stock = r.stock.trim();
          next[key] = e; matched++;
        }
        setEdits(next);
        setCsvMsg(`${matched} row(s) applied to the grid${missing.length ? ` · ${missing.length} SKU(s) not in the loaded products (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}) — load more rows and re-apply` : ''}. Review and click "Save Changes".`);
        toast(`${matched} row(s) applied`);
      },
      error: (e) => toast(e.message, 'error'),
    });
  };

  if (isStore || !can('product.update')) return <Forbidden />;

  const inp = 'input !py-1.5';
  return (
    <div>
      <PageHeader title="Bulk Update" subtitle="Update prices and stock for many variants at once" back={p('/products')}>
        <button type="button" className="btn-outline" onClick={exportCurrent}><Download className="w-4 h-4" /> Export Current</button>
        <button type="button" className="btn-outline" onClick={sample}><FileDown className="w-4 h-4" /> Download Sample</button>
        <label className="btn-outline cursor-pointer"><FileSpreadsheet className="w-4 h-4" /> Apply CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { applyCsv(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </PageHeader>
      {csvMsg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{csvMsg}</div>}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select className="input !w-auto !py-2 min-w-[160px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{tr(c.name, uiLang)}</option>)}
          </select>
          <select className="input !w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option><option value="pending_approval">Pending</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Filter loaded rows / SKU" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Reload" onClick={() => setTick((t) => t + 1)}><RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="tbl">
            <thead><tr><th>Product</th><th>Variant</th><th>SKU</th><th>Price (MRP)</th><th>Sale Price</th><th>Stock</th><th>Active</th></tr></thead>
            <tbody>
              {loading && !products.length ? <tr><td colSpan={7} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : !shown.length ? <tr><td colSpan={7} className="!py-14 text-center text-muted">No products found.</td></tr>
                  : shown.flatMap((pr) => (pr.variants ?? []).map((v, i) => {
                    const ch = !!edits[k(pr.id, v.id)];
                    return (
                      <tr key={k(pr.id, v.id)} className={cx(ch && 'bg-amber-50/60 dark:bg-amber-500/5')}>
                        <td>{i === 0 && (
                          <div className="flex items-center gap-2.5 min-w-[200px]">
                            <img src={imgUrl(thumbOf(pr), tr(pr.name))} className="w-9 h-9 rounded-lg object-cover border border-line" alt="" />
                            <Link href={p(`/products/view/${pr.id}`)} className="font-medium hover:text-primary line-clamp-2">{tr(pr.name, uiLang)}</Link>
                          </div>
                        )}</td>
                        <td className="text-sm">{v.name}</td>
                        <td className="text-xs text-muted">{v.sku || '-'}</td>
                        <td><input type="number" step="0.01" min="0" className={cx(inp, 'w-28')} value={val(pr, v, 'price') as string} onChange={(e) => setVal(pr, v, 'price', e.target.value)} /></td>
                        <td><input type="number" step="0.01" min="0" className={cx(inp, 'w-28')} placeholder="—" value={val(pr, v, 'sale_price') as string} onChange={(e) => setVal(pr, v, 'sale_price', e.target.value)} /></td>
                        <td><input type="number" step="1" className={cx(inp, 'w-24')} value={val(pr, v, 'stock') as string} onChange={(e) => setVal(pr, v, 'stock', e.target.value)} /></td>
                        <td><button type="button" className={cx('toggle', val(pr, v, 'status') && 'toggle-on')} onClick={() => setVal(pr, v, 'status', !val(pr, v, 'status'))}><span className="toggle-dot" /></button></td>
                      </tr>
                    );
                  }))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line dark:border-dark-line text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted">{products.length} product(s) loaded</span>
            {products.length >= size && <button type="button" className="btn-outline btn-sm" disabled={loading} onClick={() => setSize((s) => s + PAGE)}>Load {PAGE} more</button>}
          </div>
          <div className="flex items-center gap-2">
            {dirty > 0 && <span className="text-amber-600 font-semibold">{dirty} variant(s) changed</span>}
            <button type="button" className="btn-outline" disabled={!dirty || saving} onClick={() => { setEdits({}); setCsvMsg(''); }}><Undo2 className="w-4 h-4" /> Discard</button>
            <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
