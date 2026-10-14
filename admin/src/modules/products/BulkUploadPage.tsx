'use client';
// Bulk Upload — port of admin/products/bulk-upload.blade.php. CSV preview client-side (papaparse), then the file is uploaded
// to Storage imports/ and processed by the bulkImportProducts callable (columns must match functions/src/callables/panel.ts).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { ArrowRight, FileDown, FileSpreadsheet, Info, ListChecks, Upload } from 'lucide-react';
import { useBrands, useCategories } from '@/lib/firestore';
import { bulkImportProducts } from '@/lib/callables';
import { uploadForFunction } from '@/lib/storage';
import { errMsg, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { Card, Forbidden, PageHeader, StatusPill, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { downloadText } from './shared';

const COLUMNS = [
  'name', 'name_ar', 'name_hi', 'category_id', 'sub_category_id', 'brand_id', 'price', 'sale_price', 'stock', 'sku', 'variant_name',
  'short_description', 'description', 'images', 'thumbnail', 'tax_id', 'tax_percent', 'is_veg', 'return_allowed', 'return_days',
  'cancelable', 'cod_allowed', 'max_qty_per_order', 'fulfillment_type', 'tags', 'status',
];
const MAX_ROWS = 5000;
type Row = Record<string, string>;
interface Result { created: number; updated: number; failed: number; errors: { row: number; message: string }[] }

export default function BulkUploadPage() {
  const { p, storeId, uiLang } = usePanel();
  const { can, user } = useAuth();
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headerErr, setHeaderErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showRef, setShowRef] = useState(false);

  const cols = storeId ? COLUMNS : [...COLUMNS, 'store_id'];
  const catIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);

  const sample = () => {
    const root = categories.find((c) => !c.parent_id);
    const sub = categories.find((c) => c.parent_id === root?.id);
    const ex = (o: Row) => cols.map((c) => o[c] ?? '');
    const csv = Papa.unparse({
      fields: cols,
      data: [
        ex({ name: 'Fresh Bananas 1kg', category_id: root?.id || 'CATEGORY_ID', sub_category_id: sub?.id || '', brand_id: brands[0]?.id || '', price: '60', sale_price: '49', stock: '100', sku: 'SKU-1001', variant_name: '1 kg', short_description: 'Naturally ripened bananas.', description: 'Naturally ripened bananas.', images: 'https://placehold.co/600x600?text=Banana', is_veg: '1', return_allowed: '0', return_days: '0', cancelable: '1', cod_allowed: '1', max_qty_per_order: '10', fulfillment_type: 'both', tags: 'fruits|fresh', status: 'active' }),
        ex({ name: 'Amul Butter 500g', category_id: root?.id || 'CATEGORY_ID', price: '285', stock: '40', sku: 'SKU-1002', fulfillment_type: 'quick', status: 'active' }),
      ],
    });
    downloadText('qwikmart-bulk-upload-sample.csv', csv);
  };

  const hint = (r: Row): string => {
    const out: string[] = [];
    if (!r.name?.trim()) out.push('name is required');
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) out.push('price must be > 0');
    if (!r.category_id?.trim()) out.push('category_id is required');
    else if (categories.length && !catIds.has(r.category_id.trim())) out.push('unknown category_id');
    if (r.sub_category_id && categories.length && !catIds.has(r.sub_category_id.trim())) out.push('unknown sub_category_id');
    if (r.sale_price && Number(r.sale_price) > price) out.push('sale_price > price');
    if (r.fulfillment_type && !['quick', 'ecommerce', 'both'].includes(r.fulfillment_type.trim())) out.push('fulfillment_type must be quick/ecommerce/both');
    return out.join(', ');
  };

  const choose = (f?: File) => {
    setResult(null); setRows([]); setHeaderErr(''); setFile(f ?? null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setHeaderErr('The file is larger than 10MB.'); return; }
    Papa.parse<Row>(f, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.replace(/^﻿/, '').trim().toLowerCase(),
      complete: (res) => {
        const fields = (res.meta.fields ?? []).map((x) => x.toLowerCase());
        const missing = ['name', 'price', 'category_id'].filter((c) => !fields.includes(c));
        if (missing.length) setHeaderErr(`Missing required column(s): ${missing.join(', ')}`);
        else if (res.data.length > MAX_ROWS) setHeaderErr(`Too many rows (${res.data.length}). Max ${MAX_ROWS}.`);
        setRows(res.data);
      },
      error: (e) => setHeaderErr(e.message),
    });
  };

  const invalidCount = useMemo(() => rows.filter((r) => hint(r)).length, [rows, categories]);

  const submit = async () => {
    if (!file || headerErr || !rows.length) { toast(headerErr || 'Choose a CSV file first', 'error'); return; }
    setBusy(true);
    try {
      const path = await uploadForFunction(file, `imports/${user?.uid ?? 'anon'}`); // storage.rules: imports/{uid}/**
      const r: any = await bulkImportProducts({ csv_path: path, store_id: storeId });
      const errors = Array.isArray(r?.errors) ? r.errors : [];
      setResult({ created: Number(r?.created || 0), updated: Number(r?.updated || 0), failed: errors.length, errors });
      toast(`${Number(r?.created || 0)} product(s) imported${errors.length ? `, ${errors.length} failed` : ''}.`, errors.length ? 'warning' : 'success');
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  if (!can('product.create')) return <Forbidden />;
  const preview = rows.slice(0, 20);

  return (
    <div>
      <PageHeader title="Bulk Upload" subtitle="Create many products at once from a CSV file" back={p('/products')}>
        <button type="button" className="btn-outline" onClick={sample} data-testid="download-sample"><FileDown className="w-4 h-4" /> Download Sample</button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Upload CSV" icon={Upload} className="lg:col-span-2">
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line dark:border-dark-line py-12 cursor-pointer hover:border-primary/50">
            <FileSpreadsheet className="w-10 h-10 text-primary" />
            <span className="font-semibold text-navy dark:text-white">{file?.name || 'Click to choose a CSV file'}</span>
            <span className="text-xs text-muted">.csv up to 10MB · max 5,000 rows</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="csv-input" />
          </label>
          {headerErr && <p className="mt-2 text-xs text-red-500">{headerErr}</p>}
          {rows.length > 0 && !headerErr && (
            <p className="mt-2 text-xs text-muted">{rows.length} row(s) found{invalidCount ? <span className="text-amber-600 font-semibold"> · {invalidCount} row(s) look invalid and will likely fail</span> : ' · all rows look valid'}.</p>
          )}
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary" onClick={submit} disabled={busy || !file || !!headerErr} data-testid="import-products">
              <Upload className="w-4 h-4" /> {busy ? 'Importing…' : 'Import Products'}
            </button>
          </div>
        </Card>

        <Card title="Instructions" icon={Info}>
          <ol className="list-decimal pl-4 space-y-2 text-sm text-bodytext dark:text-slate-300">
            <li>Download the sample CSV and keep the header row.</li>
            <li>Required columns: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">name, price, category_id</code></li>
            <li><b>category_id</b> / <b>sub_category_id</b> / <b>brand_id</b> / <b>tax_id</b> must be existing document IDs.</li>
            <li><b>images</b> and <b>tags</b> are separated with <code>|</code>. Booleans accept 1/0, true/false, yes/no.</li>
            <li>Each row creates a simple product with one variant.</li>
            {storeId && <li>Products you upload are sent to the admin for approval.</li>}
          </ol>
          <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setShowRef((v) => !v)}>{showRef ? 'Hide' : 'Show'} category IDs</button>
          {showRef && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line dark:border-dark-line text-xs divide-y divide-line dark:divide-dark-line">
              {categories.map((c) => (
                <div key={c.id} className="flex justify-between gap-2 px-2 py-1"><span>{c.parent_id ? '— ' : ''}{tr(c.name, uiLang)}</span><code className="text-muted select-all">{c.id}</code></div>
              ))}
            </div>
          )}
          {!storeId && can('product.update') && (
            <Link href={p('/products/bulk-update')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Update prices &amp; stock instead <ArrowRight className="w-4 h-4" /></Link>
          )}
        </Card>
      </div>

      {preview.length > 0 && !result && (
        <Card title="Preview" subtitle={`First ${preview.length} of ${rows.length} rows`} icon={FileSpreadsheet} padding={false} className="mt-5">
          <div className="overflow-x-auto max-h-[480px] scrollbar-thin">
            <table className="tbl">
              <thead><tr><th>Line</th><th>Name</th><th>Category</th><th>Price</th><th>Sale Price</th><th>Stock</th><th>SKU</th><th>Validation</th></tr></thead>
              <tbody>
                {preview.map((r, i) => {
                  const h = hint(r);
                  return (
                    <tr key={i}>
                      <td>{i + 2}</td>
                      <td className="font-medium">{r.name || '—'}</td>
                      <td>{tr(categories.find((c) => c.id === r.category_id)?.name, uiLang) || r.category_id || '—'}</td>
                      <td>{r.price || '—'}</td><td>{r.sale_price || '—'}</td><td>{r.stock || '0'}</td><td>{r.sku || '—'}</td>
                      <td className={cx(h ? 'text-amber-600' : 'text-primary', 'text-xs')}>{h || 'OK'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card title="Import Results" subtitle={`${result.created} created · ${result.updated} updated · ${result.failed} failed`} icon={ListChecks} padding={false} className="mt-5">
          <div className="grid grid-cols-3 gap-3 p-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-700">{result.created}</p><p className="text-xs text-emerald-700">Created</p></div>
            <div className="rounded-xl bg-blue-50 p-3 text-center"><p className="text-2xl font-extrabold text-blue-700">{result.updated}</p><p className="text-xs text-blue-700">Updated</p></div>
            <div className="rounded-xl bg-red-50 p-3 text-center"><p className="text-2xl font-extrabold text-red-600">{result.failed}</p><p className="text-xs text-red-600">Failed</p></div>
          </div>
          {result.errors.length > 0 && (
            <div className="overflow-x-auto max-h-[480px] scrollbar-thin">
              <table className="tbl">
                <thead><tr><th>Line</th><th>Name</th><th>Result</th><th>Message</th></tr></thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}</td><td className="font-medium">{rows[e.row - 2]?.name || '—'}</td>
                      <td><StatusPill status="failed" /></td><td className="text-red-500">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 p-4 border-t border-line dark:border-dark-line">
            <button type="button" className="btn-outline" onClick={() => { setResult(null); setFile(null); setRows([]); }}>Import another file</button>
            <Link href={p('/products')} className="btn-primary">View products</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
