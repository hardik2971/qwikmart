'use client';
// Add / Edit Product — 5-step wizard, port of admin/products/form.blade.php (screenshot 33):
// 1. Category → 2. Product Details → 3. Variants → 4. SEO (AI + Translate) → 5. Review (+ cross-sell / up-sell) → Save as Draft / Publish.
// Writes products/{id} directly (triggers derive category_ids ancestors, min_price, in_stock_store_ids, …).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Box, FilePenLine, ImagePlus, Layers, Loader2, Plus, Repeat, Send, Sparkles, Trash2, Truck, WandSparkles, Zap, Info } from 'lucide-react';
import { fetchDoc, fetchList, ref, saveDoc, where, limit, useAttributes, useBrands, useCategories, useTaxes } from '@/lib/firestore';
import { errMsg, money, searchKeywords, slugify, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { generateProductContent } from '@/lib/callables';
import { uploadFile, MAX_IMAGE_BYTES } from '@/lib/storage';
import type { Attribute, Category, Fulfillment, Product, ProductStatus, Trans, Variant } from '@/lib/types';
import { Forbidden, Loading, PageHeader, StatusPill, Toggle, Thumb, cx } from '@/components/ui';
import { Input, MultiImageUpload, Select, Textarea } from '@/components/form/fields';
import { LangTabs, TransInput, useLangTab } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import { MODE_LABEL, ProductPicker, RelationTabs, newId, variantOn } from './shared';

interface Row {
  key: string; id: string | null; name: string; sku: string; price: string; sale_price: string; stock: string; low_stock_alert: string;
  weight: string; image: string; status: boolean; attribute_value_ids: string[];
}
const mkRow = (r: Partial<Row> = {}): Row => ({
  key: newId(), id: null, name: '', sku: '', price: '', sale_price: '', stock: '0', low_stock_alert: '5', weight: '', image: '', status: true, attribute_value_ids: [], ...r,
});
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

interface FormState {
  cat1: string | null; cat2: string | null; cat3: string | null;
  product_type: 'simple' | 'variable'; fulfillment_type: Fulfillment;
  name: Trans; short_description: Trans; description: Trans; images: string[];
  brand_id: string; tax_id: string; is_veg: string; tags: string; max_qty_per_order: string; return_days: string;
  return_allowed: boolean; cancelable: boolean; cod_allowed: boolean; is_featured: boolean; status: string;
  seo_title: Trans; seo_description: Trans; seo_keywords: Trans; schema_markup: string;
  cross_sell_ids: string[]; up_sell_ids: string[];
}
const EMPTY: FormState = {
  cat1: null, cat2: null, cat3: null, product_type: 'simple', fulfillment_type: 'both',
  name: {}, short_description: {}, description: {}, images: [], brand_id: '', tax_id: '', is_veg: '', tags: '', max_qty_per_order: '10', return_days: '0',
  return_allowed: false, cancelable: true, cod_allowed: true, is_featured: false, status: 'active',
  seo_title: {}, seo_description: {}, seo_keywords: {}, schema_markup: '', cross_sell_ids: [], up_sell_ids: [],
};
const STEPS = ['Category', 'Product Details', 'Variants', 'SEO', 'Review'];

/** AI button — lives inside the SEO LangTabs so it knows the active language tab. */
function AiButton({ onGenerate, busy }: { onGenerate: (lang: string) => void; busy: boolean }) {
  const lang = useLangTab();
  return (
    <button type="button" className="btn-soft btn-sm" onClick={() => onGenerate(lang)} disabled={busy} data-testid="ai-generate">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{busy ? 'Generating…' : 'Generate SEO with AI'}
    </button>
  );
}

function VariantImage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) { toast('File is larger than 5 MB', 'error'); return; }
    setBusy(true);
    try { onChange((await uploadFile(f, 'catalog/products')).url); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-1">
      <label className="w-9 h-9 rounded-lg border border-dashed border-line dark:border-dark-line flex items-center justify-center cursor-pointer overflow-hidden hover:border-primary/50" title="Variant image">
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : value ? <Thumb src={value} className="w-9 h-9" /> : <ImagePlus className="w-4 h-4 text-slate-400" />}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {value && <button type="button" className="text-[10px] text-red-500" onClick={() => onChange('')}>×</button>}
    </div>
  );
}

export default function ProductFormPage() {
  const params = useParams<{ id?: string }>();
  const editId = typeof params?.id === 'string' ? params.id : null;
  const isEdit = !!editId;
  const router = useRouter();
  const toast = useToast();
  const { p, storeId, uiLang, languages } = usePanel();
  const { can } = useAuth();
  const isStore = !!storeId;
  const defLang = languages[0]?.code || 'en';

  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: taxes = [] } = useTaxes();
  const { data: attributes = [] } = useAttributes();

  const [step, setStep] = useState(1);
  const [f, setF] = useState<FormState>(EMPTY);
  const [rows, setRows] = useState<Row[]>([mkRow()]);
  const [selAttrs, setSelAttrs] = useState<string[]>([]);
  const [selValues, setSelValues] = useState<string[]>([]);
  const [original, setOriginal] = useState<Product | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState<'' | 'draft' | 'publish'>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [relTab, setRelTab] = useState<'cross_sell' | 'up_sell'>('cross_sell');
  const chainDone = useRef(false);
  const attrsDone = useRef(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  // ---- load (edit) ----
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const pr = await fetchDoc<Product>('products', editId);
        if (!alive) return;
        if (!pr || (storeId && pr.store_id !== storeId)) { setNotFound(true); setLoading(false); return; }
        setOriginal(pr);
        setF({
          ...EMPTY,
          cat1: pr.category_id || null,
          product_type: pr.product_type || 'simple', fulfillment_type: pr.fulfillment_type || 'both',
          name: pr.name || {}, short_description: pr.short_description || {}, description: pr.description || {},
          images: [...new Set([pr.thumbnail, ...(pr.images ?? [])].filter(Boolean) as string[])],
          brand_id: pr.brand_id || '', tax_id: pr.tax_id || '', is_veg: pr.is_veg == null ? '' : pr.is_veg ? '1' : '0',
          tags: (pr.tags ?? []).join(', '), max_qty_per_order: s(pr.max_qty_per_order ?? 10), return_days: s(pr.return_days ?? 0),
          return_allowed: !!pr.return_allowed, cancelable: pr.cancelable !== false, cod_allowed: pr.cod_allowed !== false, is_featured: !!pr.is_featured,
          status: pr.status === 'draft' ? 'active' : pr.status,
          seo_title: pr.seo?.title || {}, seo_description: pr.seo?.description || {}, seo_keywords: pr.seo?.keywords || {}, schema_markup: pr.schema_markup || '',
          cross_sell_ids: pr.cross_sell_ids ?? [], up_sell_ids: pr.up_sell_ids ?? [],
        });
        const vs = pr.variants ?? [];
        setRows(vs.length ? vs.map((v: Variant) => mkRow({
          id: v.id, name: v.name || '', sku: v.sku || '', price: s(v.price), sale_price: s(v.sale_price), stock: s(v.stock ?? 0),
          low_stock_alert: s(v.low_stock_alert ?? 5), weight: s(v.weight), image: v.image || '', status: variantOn(v), attribute_value_ids: (v.attribute_value_ids ?? []).map(String),
        })) : [mkRow()]);
      } catch (e) { toast(errMsg(e), 'error'); setNotFound(true); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [editId, storeId]);

  // resolve category chain once categories + product are loaded
  useEffect(() => {
    if (!original || !categories.length || chainDone.current) return;
    chainDone.current = true;
    const sub = categories.find((c) => c.id === original.sub_category_id);
    if (!sub) return;
    if (sub.parent_id === original.category_id) setF((x) => ({ ...x, cat2: sub.id }));
    else setF((x) => ({ ...x, cat2: sub.parent_id, cat3: sub.id }));
  }, [original, categories]);

  // preselect attributes/values used by the variants
  useEffect(() => {
    if (!attributes.length || attrsDone.current || (isEdit && !original)) return;
    attrsDone.current = true;
    const used = [...new Set(rows.flatMap((r) => r.attribute_value_ids))];
    const owner = (vid: string) => attributes.find((a) => a.values?.some((v) => String(v.id) === vid))?.id;
    const vals = used.filter((v) => owner(v));
    setSelValues(vals);
    setSelAttrs([...new Set(vals.map((v) => owner(v)!))]);
  }, [attributes, original, isEdit]);

  // ---- category helpers ----
  const roots = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const children = (id: string | null) => (id ? categories.filter((c) => c.parent_id === id) : []);
  const catName = (id: string | null) => (id ? tr(categories.find((c) => c.id === id)?.name, uiLang) : '');
  const pick = (level: 1 | 2 | 3, id: string) => setF((x) => level === 1 ? { ...x, cat1: id, cat2: null, cat3: null }
    : level === 2 ? { ...x, cat2: x.cat2 === id ? null : id, cat3: null } : { ...x, cat3: x.cat3 === id ? null : id });
  const catPath = [f.cat1, f.cat2, f.cat3].map(catName).filter(Boolean);

  // ---- variants ----
  const visibleRows = f.product_type === 'simple' ? rows.slice(0, 1) : rows;
  const updRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, mkRow({ price: rs[0]?.price ?? '' })]);
  const removeRow = (key: string) => { if (rows.length === 1) { toast('At least one variant is required', 'error'); return; } setRows((rs) => rs.filter((r) => r.key !== key)); };
  const toggleAttr = (a: Attribute) => {
    if (selAttrs.includes(a.id)) {
      setSelAttrs((x) => x.filter((i) => i !== a.id));
      const ids = (a.values ?? []).map((v) => String(v.id));
      setSelValues((x) => x.filter((v) => !ids.includes(v)));
    } else setSelAttrs((x) => [...x, a.id]);
  };
  const toggleValue = (id: string) => setSelValues((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  const generate = () => {
    const groups = attributes.filter((a) => selAttrs.includes(a.id)).map((a) => (a.values ?? []).filter((v) => selValues.includes(String(v.id)))).filter((g) => g.length);
    if (!groups.length) { toast('Select at least one attribute value', 'error'); return; }
    const combos = groups.reduce<{ id: string; value: string }[][]>((acc, g) => acc.flatMap((c) => g.map((v) => [...c, { id: String(v.id), value: v.value }])), [[]]);
    const sig = (ids: string[]) => [...ids].sort().join('|');
    const existing: Record<string, Row> = {};
    rows.forEach((r) => { if (r.attribute_value_ids.length) existing[sig(r.attribute_value_ids)] = r; });
    const base = rows[0];
    const next = combos.map((c) => existing[sig(c.map((v) => v.id))] || mkRow({
      name: c.map((v) => v.value).join(' / '), attribute_value_ids: c.map((v) => v.id), price: base?.price ?? '', sale_price: base?.sale_price ?? '', stock: '0', low_stock_alert: base?.low_stock_alert ?? '5',
    }));
    const manual = rows.filter((r) => !r.attribute_value_ids.length && (r.id || r.name));
    setRows([...next, ...manual]);
    toast(`${combos.length} combination(s) generated`);
  };

  // ---- validation ----
  const stepProblems = (n: number): string[] => {
    const out: string[] = [];
    if (n === 1 && !f.cat1) out.push('Please choose a category.');
    if (n === 2) {
      if (!(f.name[defLang] || f.name.en || '').trim()) out.push('Product name is required.');
      if (Number(f.max_qty_per_order) < 1) out.push('Max qty per order must be at least 1.');
      if (f.return_allowed && Number(f.return_days) < 0) out.push('Return window cannot be negative.');
    }
    if (n === 3) {
      visibleRows.forEach((r, i) => {
        const label = `Variant ${i + 1}`;
        if (f.product_type === 'variable' && !r.name.trim()) out.push(`${label} has no name.`);
        if (r.price === '' || !(Number(r.price) > 0)) out.push(`${label} has no price.`);
        if (r.sale_price !== '' && Number(r.sale_price) > Number(r.price)) out.push(`${label}: sale price is higher than MRP.`);
        if (r.stock !== '' && !Number.isFinite(Number(r.stock))) out.push(`${label}: stock must be a number.`);
      });
      const skus = visibleRows.map((r) => r.sku.trim()).filter(Boolean);
      if (new Set(skus).size !== skus.length) out.push('SKUs must be unique.');
    }
    if (n === 4 && f.schema_markup.trim()) {
      try { JSON.parse(f.schema_markup); } catch { out.push('Schema markup must be valid JSON-LD.'); }
    }
    return out;
  };
  const allProblems = () => [1, 2, 3, 4].flatMap(stepProblems);
  const go = (n: number) => {
    if (n < 1 || n > 5) return;
    if (n > step) {
      for (let k = step; k < n; k++) {
        const pb = stepProblems(k);
        if (pb.length) { toast(pb[0], 'error'); setStep(k); return; }
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- AI ----
  const generateAi = async (lang: string) => {
    const name = (f.name[lang] || f.name[defLang] || f.name.en || '').trim();
    if (!name) { toast('Enter the product name first (Product Details step)', 'error'); return; }
    setAiBusy(true);
    try {
      const d = await generateProductContent({ name, language: lang, category: catPath.join(' > '), keywords: f.seo_keywords[lang] || '' });
      setF((x) => ({
        ...x,
        short_description: d.short_description ? { ...x.short_description, [lang]: d.short_description } : x.short_description,
        description: d.description ? { ...x.description, [lang]: d.description } : x.description,
        seo_title: d.seo_title ? { ...x.seo_title, [lang]: d.seo_title } : x.seo_title,
        seo_description: d.seo_description ? { ...x.seo_description, [lang]: d.seo_description } : x.seo_description,
        seo_keywords: d.seo_keywords ? { ...x.seo_keywords, [lang]: d.seo_keywords } : x.seo_keywords,
      }));
      toast('Content generated');
    } catch (e) { toast(errMsg(e), 'error'); }
    setAiBusy(false);
  };

  // ---- save ----
  const resolveStatus = (draft: boolean): ProductStatus => {
    if (draft) return 'draft';
    if (isStore) {
      if (!original || original.status === 'draft' || original.status === 'pending_approval') return 'pending_approval';
      return original.status;
    }
    return (['active', 'inactive', 'pending_approval'].includes(f.status) ? f.status : 'active') as ProductStatus;
  };

  const uniqueSlug = async (base: string, id: string) => {
    const slug = base || 'product';
    try {
      const hit = await fetchList<Product>('products', where('slug', '==', slug), ...(storeId ? [where('status', '==', 'active')] : []), limit(2));
      if (hit.some((h) => h.id !== id)) return `${slug}-${id.slice(0, 5).toLowerCase()}`;
    } catch { /* store panel may not read other stores' drafts — assume unique */ }
    return slug;
  };

  const save = async (draft: boolean) => {
    const pb = draft ? [...stepProblems(1), ...stepProblems(2).slice(0, 1)] : allProblems();
    if (pb.length) {
      toast(pb[0], 'error');
      const bad = [1, 2, 3, 4].find((n) => stepProblems(n).length);
      if (bad && !draft) setStep(bad);
      return;
    }
    setSaving(draft ? 'draft' : 'publish');
    try {
      const id = editId || ref('products').id;
      const valueOf = (vid: string) => {
        for (const a of attributes) { const v = (a.values ?? []).find((x) => String(x.id) === vid); if (v) return { attr: a, value: v.value }; }
        return null;
      };
      const variants: Variant[] = visibleRows.map((r) => {
        const attrs: Record<string, string> = {};
        r.attribute_value_ids.forEach((vid) => { const m = valueOf(vid); if (m) attrs[tr(m.attr.name, 'en')] = m.value; });
        return {
          id: r.id || newId(), name: f.product_type === 'simple' ? (r.name.trim() || 'Default') : r.name.trim(),
          sku: r.sku.trim() || undefined, attribute_value_ids: f.product_type === 'simple' ? [] : r.attribute_value_ids, attrs: f.product_type === 'simple' ? {} : attrs,
          price: Number(r.price) || 0, sale_price: r.sale_price === '' ? null : Number(r.sale_price), stock: Math.trunc(Number(r.stock) || 0),
          low_stock_alert: Math.trunc(Number(r.low_stock_alert) || 0), weight: r.weight.trim() || undefined, image: r.image || undefined, status: r.status ? 'active' : 'inactive',
        };
      });
      const usedVals = new Set(variants.flatMap((v) => v.attribute_value_ids ?? []));
      const prodAttrs = f.product_type === 'simple' ? [] : attributes
        .filter((a) => (a.values ?? []).some((v) => usedVals.has(String(v.id))))
        .map((a) => ({ name: tr(a.name, 'en'), values: (a.values ?? []).filter((v) => usedVals.has(String(v.id))).map((v) => v.value) }));
      const tax = taxes.find((t) => t.id === f.tax_id);
      const brand = brands.find((b) => b.id === f.brand_id);
      const prices = variants.filter((v) => v.status === 'active').map((v) => (v.sale_price != null && v.sale_price > 0 ? v.sale_price : v.price));
      const disc = variants.map((v) => (v.sale_price != null && v.sale_price > 0 && v.price > 0 ? Math.round(((v.price - v.sale_price) / v.price) * 100) : 0));
      const slug = await uniqueSlug(slugify(f.name.en || f.name[defLang] || ''), id);

      const data: Record<string, any> = {
        store_id: isStore ? storeId : (original ? original.store_id ?? null : null),
        category_id: f.cat1, sub_category_id: f.cat3 || f.cat2 || null, category_ids: [f.cat1, f.cat2, f.cat3].filter(Boolean),
        brand_id: f.brand_id || null, brand_name: brand?.name || '',
        name: f.name, slug, short_description: f.short_description, description: f.description,
        images: f.images, thumbnail: f.images[0] || '',
        product_type: f.product_type, tax_id: f.tax_id || null, tax_percent: Number(tax?.percent || 0),
        is_veg: f.is_veg === '' ? null : f.is_veg === '1',
        return_allowed: f.return_allowed, return_days: f.return_allowed ? Math.max(0, Math.trunc(Number(f.return_days) || 0)) : 0,
        cancelable: f.cancelable, cod_allowed: f.cod_allowed, max_qty_per_order: Math.max(1, Math.trunc(Number(f.max_qty_per_order) || 1)),
        fulfillment_type: f.fulfillment_type,
        seo: { title: f.seo_title, description: f.seo_description, keywords: f.seo_keywords }, schema_markup: f.schema_markup,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
        attributes: prodAttrs, variants,
        cross_sell_ids: f.cross_sell_ids, up_sell_ids: f.up_sell_ids,
        is_featured: isStore ? (original?.is_featured ?? false) : f.is_featured,
        status: resolveStatus(draft),
        min_price: prices.length ? Math.min(...prices) : 0, max_discount_percent: disc.length ? Math.max(...disc) : 0,
        search_keywords: searchKeywords(f.name, ...variants.map((v) => v.sku || ''), brand?.name || '', ...f.tags.split(',')),
      };
      if (!isEdit) Object.assign(data, { rating_avg: 0, rating_count: 0, sold_count: 0 });
      await saveDoc('products', id, data, { merge: isEdit });
      if (isStore) {
        // store-owned stock (quick mode reads store_stocks) — mirrors the Laravel StoreStock::updateOrCreate
        await Promise.all(variants.map((v) => saveDoc('store_stocks', `${storeId}_${v.id}`, {
          store_id: storeId, product_id: id, variant_id: v.id, stock: v.stock, low_stock_alert: v.low_stock_alert ?? 5,
        }).catch(() => null)));
      }
      toast(draft ? 'Product saved as draft.' : data.status === 'pending_approval' ? 'Product submitted for approval.' : isEdit ? 'Product updated.' : 'Product created.');
      router.push(p('/products'));
    } catch (e) { toast(errMsg(e), 'error'); }
    setSaving('');
  };

  if (!can(isEdit ? 'product.update' : 'product.create')) return <Forbidden />;
  if (loading) return <Loading />;
  if (notFound) return <div className="card p-10 text-center text-muted">Product not found. <Link href={p('/products')} className="text-primary font-semibold">Back to products</Link></div>;

  const statusOptions = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' },
    ...(original?.status === 'pending_approval' ? [{ value: 'pending_approval', label: 'Pending Approval' }] : [])];
  const reviewProblems = step === 5 ? allProblems() : [];
  const info: [string, string][] = [
    ['Name', tr(f.name, uiLang)], ['Category', catPath.join(' › ')], ['Product Type', f.product_type === 'simple' ? 'Simple' : 'Variable'],
    ['Fulfillment', MODE_LABEL[f.fulfillment_type]], ['Brand', brands.find((b) => b.id === f.brand_id)?.name || ''],
    ['Tax', (() => { const t = taxes.find((x) => x.id === f.tax_id); return t ? `${t.name} (${t.percent}%)` : ''; })()],
    ['Status', isStore ? (original && original.status !== 'draft' && original.status !== 'pending_approval' ? original.status : 'Pending approval') : (statusOptions.find((o) => o.value === f.status)?.label || '')],
    ['Images', `${f.images.length} gallery image(s)`], ['SEO Title', tr(f.seo_title, uiLang)],
  ];
  const publishLabel = isEdit ? 'Update Product' : isStore ? 'Submit for Approval' : 'Publish';

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Product' : 'Add Product'} subtitle={isEdit ? tr(original?.name, uiLang) : undefined} back={p('/products')} />

      <div className="card p-5">
        <div className="flex flex-wrap gap-2 mb-6">
          {STEPS.map((label, i) => (
            <button key={label} type="button" className={cx('step min-w-[120px]', step === i + 1 ? 'step-active' : step > i + 1 && 'step-done')} onClick={() => go(i + 1)} data-testid={`step-${i + 1}`}>
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="card-title">Category</h3>
              {!isStore && (
                <div className="flex gap-2">
                  <Link href={p('/categories/new')} target="_blank" className="btn-soft btn-sm"><Plus className="w-3.5 h-3.5" /> Add Category</Link>
                  <Link href={p('/attributes')} target="_blank" className="btn-soft btn-sm"><Plus className="w-3.5 h-3.5" /> Add Attribute</Link>
                </div>
              )}
            </div>
            <p className="label uppercase !text-xs tracking-wide">Parent Category <span className="text-red-500">*</span></p>
            <div className="flex flex-wrap gap-2 mb-5">
              {roots.map((c: Category) => <button key={c.id} type="button" className={cx('chip', f.cat1 === c.id && 'chip-active')} onClick={() => pick(1, c.id)}>{tr(c.name, uiLang)}</button>)}
              {!roots.length && <p className="text-sm text-muted">No categories yet. Create one first.</p>}
            </div>
            {children(f.cat1).length > 0 && (
              <>
                <p className="label uppercase !text-xs tracking-wide">Subcategory</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {children(f.cat1).map((c) => <button key={c.id} type="button" className={cx('chip', f.cat2 === c.id && 'chip-active')} onClick={() => pick(2, c.id)}>{tr(c.name, uiLang)}</button>)}
                </div>
              </>
            )}
            {children(f.cat2).length > 0 && (
              <>
                <p className="label uppercase !text-xs tracking-wide">Sub-subcategory</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {children(f.cat2).map((c) => <button key={c.id} type="button" className={cx('chip', f.cat3 === c.id && 'chip-active')} onClick={() => pick(3, c.id)}>{tr(c.name, uiLang)}</button>)}
                </div>
              </>
            )}
            <div className="grid gap-5 md:grid-cols-2 mt-2 pt-5 border-t border-line dark:border-dark-line">
              <div>
                <p className="label">Product Type</p>
                <div className="grid grid-cols-2 gap-3">
                  {([['simple', 'Simple', 'One price & stock', Box], ['variable', 'Variable', 'Sizes, colors, weights…', Layers]] as const).map(([val, title, desc, Icon]) => (
                    <label key={val} className={cx('flex items-start gap-3 rounded-xl border p-3 cursor-pointer', f.product_type === val ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
                      <input type="radio" name="product_type" checked={f.product_type === val} onChange={() => set('product_type', val)} className="mt-1 accent-[#0E9623]" />
                      <span><span className="flex items-center gap-1.5 font-semibold text-navy dark:text-white text-sm"><Icon className="w-4 h-4 text-primary" />{title}</span>
                        <span className="text-xs text-muted">{desc}</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">Fulfillment Type (App Mode)</p>
                <div className="grid grid-cols-3 gap-3">
                  {([['quick', 'Quick', Zap], ['ecommerce', 'eCommerce', Truck], ['both', 'Both', Repeat]] as const).map(([val, title, Icon]) => (
                    <label key={val} className={cx('flex items-center gap-2 rounded-xl border p-3 cursor-pointer', f.fulfillment_type === val ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
                      <input type="radio" name="fulfillment_type" checked={f.fulfillment_type === val} onChange={() => set('fulfillment_type', val)} className="accent-[#0E9623]" />
                      <span className="flex items-center gap-1.5 font-semibold text-navy dark:text-white text-sm"><Icon className="w-4 h-4 text-primary" />{title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <LangTabs translate title="Product Details">
              <div className="grid gap-4">
                <TransInput label="Product Name" value={f.name} onChange={(v) => set('name', v)} required placeholder="e.g. Simple Salted Wafers 100g" />
                <TransInput label="Short Description" type="textarea" rows={2} value={f.short_description} onChange={(v) => set('short_description', v)} />
                <TransInput label="Description" type="editor" value={f.description} onChange={(v) => set('description', v)} />
              </div>
            </LangTabs>

            <div className="grid gap-5 md:grid-cols-3 mt-6 pt-5 border-t border-line dark:border-dark-line">
              <Select label="Brand" value={f.brand_id} onChange={(e) => set('brand_id', e.target.value)} placeholder="No brand"
                options={brands.filter((b) => b.status !== 'inactive' || b.id === f.brand_id).map((b) => ({ value: b.id, label: b.name }))} />
              <Select label="Tax" value={f.tax_id} onChange={(e) => set('tax_id', e.target.value)} placeholder="No tax"
                options={taxes.filter((t) => t.status !== 'inactive' || t.id === f.tax_id).map((t) => ({ value: t.id, label: `${t.name} (${t.percent}%)` }))} />
              <Select label="Food Type" value={f.is_veg} onChange={(e) => set('is_veg', e.target.value)} placeholder="Not applicable" options={[{ value: '1', label: 'Veg' }, { value: '0', label: 'Non-Veg' }]} />
              <Input label="Tags" value={f.tags} onChange={(e) => set('tags', e.target.value)} hint="Comma separated, e.g. snacks, chips" wrapClass="md:col-span-2" />
              <Input label="Max Qty per Order" type="number" min={1} value={f.max_qty_per_order} onChange={(e) => set('max_qty_per_order', e.target.value)} />
              <Input label="Return Window (days)" type="number" min={0} value={f.return_days} onChange={(e) => set('return_days', e.target.value)} />
              {isStore ? (
                <div>
                  <span className="label">Status</span>
                  <div className="flex items-center gap-2 py-2">
                    <StatusPill status={original?.status || 'pending_approval'} />
                    <span className="text-xs text-muted">New store products are reviewed by the admin before going live.</span>
                  </div>
                </div>
              ) : (
                <Select label="Status (when published)" value={f.status} onChange={(e) => set('status', e.target.value)} options={statusOptions} />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-5">
              <Toggle checked={f.return_allowed} onChange={(v) => set('return_allowed', v)} label="Returnable" description="Customers can request returns" />
              <Toggle checked={f.cancelable} onChange={(v) => set('cancelable', v)} label="Cancelable" description="Can be cancelled before dispatch" />
              <Toggle checked={f.cod_allowed} onChange={(v) => set('cod_allowed', v)} label="Cash on Delivery" description="Allow COD payment" />
              {!isStore && <Toggle checked={f.is_featured} onChange={(v) => set('is_featured', v)} label="Featured" description="Show in featured sections" />}
            </div>

            <div className="mt-6 pt-5 border-t border-line dark:border-dark-line">
              <MultiImageUpload label="Images" value={f.images} onChange={(v) => set('images', v)} folder="catalog/products" />
              <p className="mt-1 text-xs text-muted">PNG, JPG or WEBP up to 5MB each. The first image (Main) is used as the thumbnail.</p>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="card-title">{f.product_type === 'simple' ? 'Pricing & Stock' : 'Variants'}</h3>
                <p className="text-xs text-muted">{f.product_type === 'simple' ? 'Simple product — one price and stock.' : 'Pick attributes and values, then generate combinations.'}</p>
              </div>
              {f.product_type === 'variable' && <button type="button" className="btn-soft btn-sm" onClick={addRow}><Plus className="w-3.5 h-3.5" /> Add Row</button>}
            </div>

            {f.product_type === 'variable' && (
              <div className="rounded-xl border border-line dark:border-dark-line p-4 mb-5">
                <p className="label">Attributes</p>
                <div className="flex flex-wrap gap-2">
                  {attributes.map((a) => (
                    <button key={a.id} type="button" className={cx('chip', selAttrs.includes(a.id) && 'chip-active')} onClick={() => toggleAttr(a)}>
                      <span>{tr(a.name, uiLang)}</span><span className="text-muted">({a.values?.length ?? 0})</span>
                    </button>
                  ))}
                  {!attributes.length && <p className="text-sm text-muted">No attributes defined yet.</p>}
                </div>
                {attributes.filter((a) => selAttrs.includes(a.id)).map((a) => (
                  <div key={a.id} className="mt-4">
                    <p className="text-xs font-semibold text-navy dark:text-white mb-1.5">{tr(a.name, uiLang)}</p>
                    <div className="flex flex-wrap gap-2">
                      {(a.values ?? []).map((v) => (
                        <button key={v.id} type="button" className={cx('chip', selValues.includes(String(v.id)) && 'chip-active')} onClick={() => toggleValue(String(v.id))}>
                          {v.color_hex && <span className="w-3 h-3 rounded-full border border-line" style={{ background: v.color_hex }} />}
                          <span>{v.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="mt-4 flex items-center gap-3">
                  <button type="button" className="btn-primary btn-sm" onClick={generate} data-testid="generate-variants"><WandSparkles className="w-3.5 h-3.5" /> Generate combinations</button>
                  <span className="text-xs text-muted">Existing matching variants are kept.</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto scrollbar-thin rounded-xl border border-line dark:border-dark-line">
              <table className="tbl">
                <thead>
                  <tr>
                    {f.product_type === 'variable' && <th>Name *</th>}
                    <th>Image</th><th>SKU</th><th>Price (MRP) *</th><th>Sale Price</th><th>Stock</th><th>Low Alert</th><th>Weight</th><th>Active</th>
                    {f.product_type === 'variable' && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <tr key={r.key}>
                      {f.product_type === 'variable' && <td><input className="input !py-1.5 min-w-[150px]" value={r.name} onChange={(e) => updRow(r.key, { name: e.target.value })} placeholder="e.g. 500 g" /></td>}
                      <td><VariantImage value={r.image} onChange={(v) => updRow(r.key, { image: v })} /></td>
                      <td><input className="input !py-1.5 min-w-[120px]" value={r.sku} onChange={(e) => updRow(r.key, { sku: e.target.value })} placeholder="SKU" data-testid={`variant-sku-${i}`} /></td>
                      <td><input type="number" step="0.01" min="0" className="input !py-1.5 w-28" value={r.price} onChange={(e) => updRow(r.key, { price: e.target.value })} placeholder="0.00" data-testid={`variant-price-${i}`} /></td>
                      <td><input type="number" step="0.01" min="0" className="input !py-1.5 w-28" value={r.sale_price} onChange={(e) => updRow(r.key, { sale_price: e.target.value })} placeholder="—" /></td>
                      <td><input type="number" step="1" className="input !py-1.5 w-24" value={r.stock} onChange={(e) => updRow(r.key, { stock: e.target.value })} data-testid={`variant-stock-${i}`} /></td>
                      <td><input type="number" step="1" min="0" className="input !py-1.5 w-20" value={r.low_stock_alert} onChange={(e) => updRow(r.key, { low_stock_alert: e.target.value })} /></td>
                      <td><input className="input !py-1.5 w-24" value={r.weight} onChange={(e) => updRow(r.key, { weight: e.target.value })} placeholder="e.g. 500g" /></td>
                      <td><button type="button" className={cx('toggle', r.status && 'toggle-on')} onClick={() => updRow(r.key, { status: !r.status })}><span className="toggle-dot" /></button></td>
                      {f.product_type === 'variable' && <td><button type="button" className="icon-btn hover:!text-red-500" title="Remove" onClick={() => removeRow(r.key)}><Trash2 className="w-4 h-4" /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isStore && <p className="mt-3 text-xs text-muted flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Stock entered here is saved as your store&apos;s stock.</p>}
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <LangTabs translate>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="card-title">SEO</h3>
              <AiButton onGenerate={generateAi} busy={aiBusy} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TransInput label="Meta Title" value={f.seo_title} onChange={(v) => set('seo_title', v)} />
              <TransInput label="Meta Keywords" value={f.seo_keywords} onChange={(v) => set('seo_keywords', v)} placeholder="comma, separated, keywords" />
              <TransInput label="Meta Description" type="textarea" rows={4} value={f.seo_description} onChange={(v) => set('seo_description', v)} />
              <Textarea label="Schema Markup" rows={4} value={f.schema_markup} onChange={(e) => set('schema_markup', e.target.value)} placeholder="JSON-LD schema markup (optional)" />
            </div>
            <p className="mt-3 text-xs text-muted">AI fills the short description, description and SEO fields of the selected language tab.</p>
          </LangTabs>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div>
            <h3 className="card-title mb-4">Review</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line dark:border-dark-line p-4 space-y-2 text-sm">
                {info.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="font-medium text-navy dark:text-white text-right">{v || '—'}</span></div>
                ))}
              </div>
              <div className="rounded-xl border border-line dark:border-dark-line p-4 text-sm">
                <p className="font-semibold text-navy dark:text-white mb-2">{visibleRows.length} variant(s)</p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {visibleRows.map((r) => (
                    <div key={r.key} className="flex justify-between gap-3 border-b border-line dark:border-dark-line pb-1.5">
                      <span>{(f.product_type === 'simple' ? 'Default' : r.name || 'Unnamed') + (r.sku ? ` · ${r.sku}` : '')}</span>
                      <span>
                        <span className="font-semibold">{r.price === '' && r.sale_price === '' ? '—' : money(r.sale_price || r.price)}</span>
                        {r.sale_price !== '' && Number(r.sale_price) < Number(r.price) && <span className="text-muted line-through text-xs ml-1">{money(r.price)}</span>}
                        <span className="text-xs text-muted ml-2">Stock {r.stock || 0}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {reviewProblems.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs space-y-1">
                    {reviewProblems.map((pb) => <p key={pb}>• {pb}</p>)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-line dark:border-dark-line">
              <h3 className="card-title mb-3">Recommendations</h3>
              <RelationTabs tab={relTab} setTab={setRelTab} counts={[f.cross_sell_ids.length, f.up_sell_ids.length]} />
              <div className="mt-4">
                <ProductPicker key={relTab} value={relTab === 'cross_sell' ? f.cross_sell_ids : f.up_sell_ids}
                  onChange={(ids) => set(relTab === 'cross_sell' ? 'cross_sell_ids' : 'up_sell_ids', ids)} excludeId={editId || undefined} />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 dark:border-dark-line">
          <button type="button" className="btn-outline" onClick={() => go(step - 1)} disabled={step === 1}><ArrowLeft className="w-4 h-4" /> Previous</button>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100" onClick={() => save(true)} disabled={!!saving} data-testid="save-draft">
              {saving === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePenLine className="w-4 h-4" />} Save as Draft
            </button>
            {step < 5 && <button type="button" className="btn-primary" onClick={() => go(step + 1)} data-testid="next-step">Next <ArrowRight className="w-4 h-4" /></button>}
            {(step === 5 || isEdit) && (
              <button type="button" className={cx('btn-primary', step < 5 && '!bg-navy hover:!bg-navy/90')} onClick={() => save(false)} disabled={!!saving} data-testid="save-product">
                {saving === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {publishLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

