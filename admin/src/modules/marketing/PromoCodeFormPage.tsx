'use client';
// Port of admin/promo-codes/form.blade.php — 9 sections with a sticky section nav (screenshot docs/reference/36.png).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowLeft, Save, Shuffle, Percent, Banknote, Truck, Store as StoreIcon, Clock, Users, UserPlus, UserCheck, Smartphone, Monitor, Zap, ShoppingBag,
} from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fetchDoc, fetchList, saveDoc, useCategories, useCountries, useStores, useZones, useInvalidate, where, orderBy, limit } from '@/lib/firestore';
import { toDate, tr, searchKeywords, errMsg } from '@/lib/format';
import type { Product, PromoCode, Trans } from '@/lib/types';
import { Card, Forbidden, Loading, Toggle, cx } from '@/components/ui';
import { Input, ImageUpload } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import { MultiPicker } from './MultiPicker';

const SECTIONS: [string, string][] = [
  ['basic', 'Basic Info'], ['discount', 'Discount'], ['applicability', 'Applicability'], ['cart', 'Cart Conditions'], ['usage', 'Usage Restrictions'],
  ['scheduling', 'Scheduling'], ['audience', 'Audience Targeting'], ['platform', 'Platform & Visibility'], ['channel', 'Channel & Zone'],
];

interface FormState {
  code: string; title: Trans; description: Trans; image: string; banner_color: string;
  discount_type: PromoCode['discount_type']; discount_value: string; max_discount: string; benefit: 'instant' | 'cashback';
  applies_to: PromoCode['applies_to']; applies_to_ids: string[]; min_order: string;
  usage_limit_total: string; usage_limit_per_user: string; used_count: number;
  is_permanent: boolean; starts_at: string; ends_at: string; time_from: string; time_to: string;
  audience: PromoCode['audience']; platforms: ('app' | 'web')[]; status: boolean; channels: ('quick' | 'ecommerce')[]; country_ids: string[]; zone_ids: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (v: any) => { const d = toDate(v); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
export const randomCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

function blank(isStore: boolean): FormState {
  return {
    code: randomCode(), title: {}, description: {}, image: '', banner_color: '#0E9623', discount_type: 'percent', discount_value: '', max_discount: '', benefit: 'instant',
    applies_to: isStore ? 'stores' : 'all', applies_to_ids: [], min_order: '0', usage_limit_total: '', usage_limit_per_user: '', used_count: 0,
    is_permanent: false, starts_at: '', ends_at: '', time_from: '', time_to: '', audience: 'all', platforms: ['app', 'web'], status: true,
    channels: ['quick', 'ecommerce'], country_ids: [], zone_ids: [],
  };
}
function fromDoc(p: PromoCode): FormState {
  const s = (v: any) => (v === null || v === undefined ? '' : String(v));
  return {
    code: p.code || '', title: typeof p.title === 'string' ? { en: p.title } : p.title || {}, description: typeof p.description === 'string' ? { en: p.description } : p.description || {},
    image: p.image || '', banner_color: p.banner_color || '#0E9623', discount_type: p.discount_type || 'percent', discount_value: s(p.discount_value), max_discount: s(p.max_discount),
    benefit: p.is_cashback ? 'cashback' : 'instant', applies_to: p.applies_to || 'all', applies_to_ids: (p.applies_to_ids || []).map(String), min_order: s(p.min_order ?? 0),
    usage_limit_total: s(p.usage_limit_total), usage_limit_per_user: s(p.usage_limit_per_user), used_count: Number(p.used_count || 0),
    is_permanent: !!p.is_permanent, starts_at: toLocalInput(p.starts_at), ends_at: toLocalInput(p.ends_at), time_from: p.time_from || '', time_to: p.time_to || '',
    audience: p.audience || 'all', platforms: p.platforms?.length ? p.platforms : ['app', 'web'], status: p.status === 'active' || (p.status as any) === true,
    channels: p.channels?.length ? p.channels : ['quick', 'ecommerce'], country_ids: (p.country_ids || []).map(String), zone_ids: (p.zone_ids || []).map(String),
  };
}

function Sec({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: ReactNode }) {
  return <section id={`sec-${id}`} data-sec={id} className="scroll-mt-24"><Card title={title} subtitle={subtitle}>{children}</Card></section>;
}

function ChoiceCard({ on, onClick, title, desc, icon }: { on: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition', on ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
      <span className={cx('mt-0.5 w-4 h-4 shrink-0 rounded-full border-2', on ? 'border-primary bg-primary' : 'border-slate-300')} />
      {icon}
      <span><span className="block font-semibold text-navy dark:text-white text-sm">{title}</span>{desc && <span className="text-xs text-muted">{desc}</span>}</span>
    </button>
  );
}
function CheckPill({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition', on ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
      <input type="checkbox" readOnly checked={on} className="rounded text-primary focus:ring-primary pointer-events-none" />
      <span className="text-primary">{icon}</span>{label}
    </button>
  );
}

export default function PromoCodeFormPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : null;
  const router = useRouter();
  const { p, isStore, storeId, uiLang, settings } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [f, setF] = useState<FormState>(() => blank(isStore));
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [active, setActive] = useState('basic');
  const rootRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const { data: categories = [] } = useCategories();
  const { data: stores = [] } = useStores();
  const { data: zones = [] } = useZones();
  const { data: countries = [] } = useCountries();
  const products = useQuery({
    queryKey: ['promo-products'], enabled: !isStore && f.applies_to === 'products', staleTime: 5 * 60 * 1000,
    queryFn: () => fetchList<Product>('products', orderBy('created_at', 'desc'), limit(1000)),
  });

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchDoc<PromoCode>('promo_codes', id).then((d) => {
      if (!alive) return;
      if (!d) { toast('Promo code not found', 'error'); router.replace(p('/promo-codes')); return; }
      if (isStore && d.store_id && d.store_id !== storeId) { toast('This promo code does not belong to your store.', 'error'); router.replace(p('/promo-codes')); return; }
      setF(fromDoc(d)); setLoaded(true);
    }).catch((e) => { toast(errMsg(e), 'error'); setLoaded(true); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!loaded || !rootRef.current) return;
    const obs = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.sec || 'basic'); }), { rootMargin: '-15% 0px -70% 0px' });
    rootRef.current.querySelectorAll('[data-sec]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [loaded]);

  const go = (sec: string) => { document.getElementById('sec-' + sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(sec); };
  const currency = settings.currency_symbol || '₹';

  const catOpts = useMemo(() => {
    const byParent = (pid: string | null) => categories.filter((c) => (c.parent_id || null) === pid);
    const out: { value: string; label: string }[] = [];
    const walk = (pid: string | null, depth: number) => byParent(pid).forEach((c) => { out.push({ value: c.id, label: `${'— '.repeat(depth)}${tr(c.name, uiLang)}` }); if (depth < 4) walk(c.id, depth + 1); });
    walk(null, 0);
    const seen = new Set(out.map((o) => o.value));
    categories.filter((c) => !seen.has(c.id)).forEach((c) => out.push({ value: c.id, label: tr(c.name, uiLang) }));
    return out;
  }, [categories, uiLang]);
  const productOpts = useMemo(() => (products.data || []).map((x) => ({ value: x.id, label: tr(x.name, uiLang) || x.id })), [products.data, uiLang]);
  const storeOpts = useMemo(() => stores.map((s) => ({ value: s.id, label: s.name })), [stores]);
  const countryOpts = useMemo(() => countries.map((c) => ({ value: c.id, label: c.name })), [countries]);
  const zoneOpts = useMemo(() => zones.map((z) => ({ value: z.id, label: `${z.name}${countries.find((c) => c.id === z.country_id) ? ` (${countries.find((c) => c.id === z.country_id)!.name})` : ''}` })), [zones, countries]);
  const storeName = stores.find((s) => s.id === storeId)?.name || 'your store';

  const validate = async (): Promise<Record<string, string>> => {
    const e: Record<string, string> = {};
    const code = f.code.toUpperCase().replace(/\s+/g, '');
    if (!code) e.code = 'The coupon code is required.';
    else if (!/^[A-Z0-9_-]+$/.test(code)) e.code = 'Only letters, numbers, dashes and underscores are allowed.';
    else if (code.length > 40) e.code = 'Max 40 characters.';
    if (!(f.title.en || Object.values(f.title).some(Boolean))) e.title = 'The title is required.';
    if (f.discount_type !== 'free_delivery') {
      const v = Number(f.discount_value);
      if (f.discount_value === '' || isNaN(v) || v < 0) e.discount_value = 'Enter a valid discount value.';
      else if (f.discount_type === 'percent' && v > 100) e.discount_value = 'Percentage cannot exceed 100.';
    }
    if (!isStore && f.applies_to !== 'all' && !f.applies_to_ids.length) e.applies_to_ids = `Select at least one ${f.applies_to.replace(/s$/, '').replace('categorie', 'category')}.`;
    if (!f.is_permanent && f.starts_at && f.ends_at && new Date(f.ends_at) < new Date(f.starts_at)) e.ends_at = 'End must be after the start.';
    if (f.time_from && !f.time_to) e.time_to = 'Set the end of the window.';
    for (const k of ['usage_limit_total', 'usage_limit_per_user'] as const) if (f[k] !== '' && (!Number.isInteger(Number(f[k])) || Number(f[k]) < 1)) e[k] = 'Must be 1 or more (blank = unlimited).';
    if (!e.code) {
      try {
        let dupes: PromoCode[] = [];
        try { dupes = await fetchList<PromoCode>('promo_codes', where('code', '==', code), limit(3)); }
        catch { if (isStore && storeId) dupes = await fetchList<PromoCode>('promo_codes', where('store_id', '==', storeId), where('code', '==', code), limit(3)); }
        if (dupes.some((d) => d.id !== id)) e.code = 'This code is already taken.';
      } catch { /* uniqueness re-checked by rules/functions */ }
    }
    return e;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const e = await validate();
      setErrors(e);
      if (Object.keys(e).length) { toast(Object.values(e)[0], 'error'); const first = Object.keys(e)[0]; go(first === 'code' || first === 'title' ? 'basic' : first.startsWith('discount') ? 'discount' : first === 'applies_to_ids' ? 'applicability' : first.startsWith('usage') ? 'usage' : 'scheduling'); setBusy(false); return; }
      const code = f.code.toUpperCase().replace(/\s+/g, '');
      const numOrNull = (v: string) => (v === '' ? null : Number(v));
      const data: Record<string, any> = {
        code, title: f.title, description: f.description, image: f.image || null, banner_color: f.banner_color || '#0E9623',
        discount_type: f.discount_type, discount_value: f.discount_type === 'free_delivery' ? 0 : Number(f.discount_value || 0),
        max_discount: f.discount_type === 'percent' ? numOrNull(f.max_discount) : null,
        is_instant: f.benefit === 'instant', is_cashback: f.benefit === 'cashback',
        applies_to: isStore ? 'stores' : f.applies_to, applies_to_ids: isStore ? [storeId] : f.applies_to === 'all' ? [] : f.applies_to_ids,
        min_order: Number(f.min_order || 0), usage_limit_total: numOrNull(f.usage_limit_total), usage_limit_per_user: numOrNull(f.usage_limit_per_user),
        is_permanent: f.is_permanent,
        starts_at: f.is_permanent || !f.starts_at ? null : Timestamp.fromDate(new Date(f.starts_at)),
        ends_at: f.is_permanent || !f.ends_at ? null : Timestamp.fromDate(new Date(f.ends_at)),
        time_from: f.time_from || null, time_to: f.time_to || null, audience: f.audience,
        platforms: f.platforms.length ? f.platforms : ['app', 'web'], channels: f.channels.length ? f.channels : ['quick', 'ecommerce'],
        status: f.status ? 'active' : 'inactive', search_keywords: searchKeywords(code, f.title),
      };
      if (!isStore) { data.country_ids = f.country_ids; data.zone_ids = f.zone_ids; data.store_id = null; }
      else data.store_id = storeId;
      if (!id) data.used_count = 0;
      await saveDoc('promo_codes', id, data);
      invalidate('list', 'promo_codes');
      toast(id ? 'Promo code updated successfully.' : 'Promo code created successfully.');
      router.push(p('/promo-codes'));
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  if (!can(id ? 'promo_code.update' : 'promo_code.create')) return <Forbidden />;
  if (!loaded) return <Loading />;
  const saveLabel = id ? 'Update Coupon' : 'Save Coupon';
  const err = (k: string) => errors[k] ? <p className="mt-1 text-xs text-red-500">{errors[k]}</p> : null;

  return (
    <div ref={rootRef} className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-20 self-start card p-4">
        <h1 className="text-xl font-extrabold text-navy dark:text-white">{id ? 'Edit Coupon' : 'Add Coupon'}</h1>
        <p className="text-xs text-muted mt-0.5">Fill in all sections to configure your coupon promotion</p>
        <Link href={p('/promo-codes')} className="btn-outline w-full mt-4"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <p className="mt-5 mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Sections</p>
        <nav className="space-y-0.5">
          {SECTIONS.map(([sid, label], i) => (
            <button key={sid} type="button" onClick={() => go(sid)} className={cx('w-full text-left rounded-lg px-3 py-2 text-sm border-l-4 transition', active === sid ? 'bg-primary-50 border-primary text-primary font-semibold' : 'border-transparent text-bodytext hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
              {i + 1}. {label}
            </button>
          ))}
        </nav>
        <button type="button" className="btn-primary w-full mt-5" disabled={busy} onClick={submit} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : saveLabel}</button>
      </aside>

      <div className="space-y-5 min-w-0">
        <Sec id="basic" title="1. Basic Info" subtitle="Code, title and how the coupon card looks in the apps.">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2 md:max-w-md">
              <label className="label" htmlFor="f_code">Coupon Code<span className="text-red-500"> *</span></label>
              <div className="flex gap-2">
                <input id="f_code" value={f.code} maxLength={40} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))} className={cx('input uppercase font-semibold tracking-wide', errors.code && 'border-red-400')} data-testid="promo-code" />
                <button type="button" className="btn-soft shrink-0" onClick={() => set('code', randomCode())}><Shuffle className="w-4 h-4" /> Generate</button>
              </div>
              {err('code')}
            </div>
            <div className="md:col-span-2">
              <LangTabs translate>
                <TransInput label="Title" value={f.title} onChange={(v) => set('title', v)} required placeholder="e.g. Mumbai Exclusive — ₹99 Off" error={errors.title} />
                <TransInput label="Description" type="textarea" rows={3} value={f.description} onChange={(v) => set('description', v)} placeholder="Terms shown to customers" />
              </LangTabs>
            </div>
            <ImageUpload label="Image (optional)" value={f.image} onChange={(v) => set('image', v)} folder="catalog/promo-codes" />
            <div>
              <span className="label">Banner Color</span>
              <div className="flex items-center gap-3">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(f.banner_color) ? f.banner_color : '#0E9623'} onChange={(e) => set('banner_color', e.target.value)} className="h-10 w-14 rounded-lg border border-line cursor-pointer" />
                <input type="text" value={f.banner_color} onChange={(e) => set('banner_color', e.target.value)} className="input !w-32 font-mono" maxLength={20} />
              </div>
              <div className="mt-3 h-20 rounded-xl flex items-center justify-center text-white text-xl font-extrabold tracking-wider" style={{ background: f.banner_color || '#0E9623' }}>{f.code || 'CODE'}</div>
            </div>
          </div>
        </Sec>

        <Sec id="discount" title="2. Discount" subtitle="What the customer gets.">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="md:col-span-3">
              <span className="label">Discount Type<span className="text-red-500"> *</span></span>
              <div className="flex flex-wrap gap-2">
                {([['percent', 'Percentage', Percent], ['fixed', 'Fixed Amount', Banknote], ['free_delivery', 'Free Delivery', Truck]] as const).map(([v, l, Ic]) => (
                  <button key={v} type="button" className={cx('chip !py-2 !px-4', f.discount_type === v && 'chip-active')} onClick={() => set('discount_type', v)}><Ic className="w-4 h-4" /> {l}</button>
                ))}
              </div>
            </div>
            {f.discount_type !== 'free_delivery' && (
              <Input label="Discount Value" type="number" step="0.01" min={0} value={f.discount_value} onChange={(e) => set('discount_value', e.target.value)} hint="Percent (0-100) or fixed amount" error={errors.discount_value} />
            )}
            {f.discount_type === 'percent' && (
              <Input label="Max Discount" type="number" step="0.01" min={0} prefix={currency} value={f.max_discount} onChange={(e) => set('max_discount', e.target.value)} hint="Leave blank for no cap" />
            )}
            <div className="md:col-span-3">
              <span className="label">Benefit Mode</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard on={f.benefit === 'instant'} onClick={() => set('benefit', 'instant')} title="Instant Discount" desc="Deducted from the order total at checkout." />
                <ChoiceCard on={f.benefit === 'cashback'} onClick={() => set('benefit', 'cashback')} title="Cashback" desc="Credited to the wallet after delivery." />
              </div>
            </div>
          </div>
        </Sec>

        <Sec id="applicability" title="3. Applicability" subtitle="Which items the coupon can be applied to.">
          {isStore ? (
            <div className="rounded-xl bg-primary-50 border border-primary/30 p-4 text-sm text-navy flex items-center gap-3">
              <StoreIcon className="w-5 h-5 text-primary" /> This coupon applies only to orders from <b>{storeName}</b>.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {([['all', 'All products'], ['categories', 'Specific categories'], ['products', 'Specific products'], ['stores', 'Specific stores']] as const).map(([v, l]) => (
                  <button key={v} type="button" className={cx('chip !py-2 !px-4', f.applies_to === v && 'chip-active')} onClick={() => setF((s) => ({ ...s, applies_to: v, applies_to_ids: s.applies_to === v ? s.applies_to_ids : [] }))}>{l}</button>
                ))}
              </div>
              {f.applies_to === 'all' && <p className="text-sm text-muted">The coupon applies to every product in the cart.</p>}
              {f.applies_to === 'categories' && <MultiPicker label="Categories" options={catOpts} value={f.applies_to_ids} onChange={(v) => set('applies_to_ids', v)} />}
              {f.applies_to === 'products' && <MultiPicker label="Products" options={productOpts} loading={products.isLoading} value={f.applies_to_ids} onChange={(v) => set('applies_to_ids', v)} hint="Latest 1000 products are listed — search to filter." />}
              {f.applies_to === 'stores' && <MultiPicker label="Stores" options={storeOpts} value={f.applies_to_ids} onChange={(v) => set('applies_to_ids', v)} />}
              {err('applies_to_ids')}
            </>
          )}
        </Sec>

        <Sec id="cart" title="4. Cart Conditions" subtitle="Minimum cart value required to apply the coupon.">
          <div className="grid gap-5 md:grid-cols-2">
            <Input label="Minimum Order Value" type="number" step="0.01" min={0} prefix={currency} value={f.min_order} onChange={(e) => set('min_order', e.target.value)} hint="0 = no minimum" />
          </div>
        </Sec>

        <Sec id="usage" title="5. Usage Restrictions" subtitle="Limit how many times the coupon can be redeemed.">
          <div className="grid gap-5 md:grid-cols-3">
            <Input label="Total Usage Limit" type="number" min={1} value={f.usage_limit_total} onChange={(e) => set('usage_limit_total', e.target.value)} hint="Blank = unlimited" error={errors.usage_limit_total} />
            <Input label="Usage Limit Per User" type="number" min={1} value={f.usage_limit_per_user} onChange={(e) => set('usage_limit_per_user', e.target.value)} hint="Blank = unlimited" error={errors.usage_limit_per_user} />
            <div>
              <span className="label">Times Used</span>
              <input className="input bg-slate-50 dark:bg-slate-900" value={f.used_count} readOnly />
              <p className="mt-1 text-xs text-muted">Read-only</p>
            </div>
          </div>
        </Sec>

        <Sec id="scheduling" title="6. Scheduling" subtitle="When the coupon is valid.">
          <Toggle checked={f.is_permanent} onChange={(v) => set('is_permanent', v)} label="Permanent" description="Never expires — ignores start / end dates." />
          {!f.is_permanent && (
            <div className="grid gap-5 md:grid-cols-2 mt-5">
              <Input label="Starts At" type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
              <Input label="Ends At" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} error={errors.ends_at} />
            </div>
          )}
          <div className="mt-5 rounded-xl border border-dashed border-line p-4 dark:border-dark-line">
            <p className="font-semibold text-navy dark:text-white text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Happy-hour window <span className="text-xs font-normal text-muted">(optional, daily)</span></p>
            <div className="grid gap-5 md:grid-cols-2 mt-3">
              <Input label="From" type="time" value={f.time_from} onChange={(e) => set('time_from', e.target.value)} />
              <Input label="To" type="time" value={f.time_to} onChange={(e) => set('time_to', e.target.value)} error={errors.time_to} />
            </div>
          </div>
        </Sec>

        <Sec id="audience" title="7. Audience Targeting" subtitle="Who can use this coupon.">
          <div className="grid gap-3 sm:grid-cols-3">
            {([['all', 'All customers', Users], ['new', 'New customers', UserPlus], ['existing', 'Existing customers', UserCheck]] as const).map(([v, l, Ic]) => (
              <ChoiceCard key={v} on={f.audience === v} onClick={() => set('audience', v)} title={l} icon={<Ic className="w-4 h-4 text-primary mt-0.5" />} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">New = customers with no completed orders yet.</p>
        </Sec>

        <Sec id="platform" title="8. Platform & Visibility" subtitle="Where the coupon is shown and whether it is live.">
          <span className="label">Platforms</span>
          <div className="flex flex-wrap gap-3 mb-5">
            {([['app', 'Mobile App', Smartphone], ['web', 'Website', Monitor]] as const).map(([v, l, Ic]) => (
              <CheckPill key={v} on={f.platforms.includes(v)} onClick={() => set('platforms', f.platforms.includes(v) ? f.platforms.filter((x) => x !== v) : [...f.platforms, v])} icon={<Ic className="w-4 h-4" />} label={l} />
            ))}
          </div>
          <Toggle checked={f.status} onChange={(v) => set('status', v)} label="Active" description="Inactive coupons are hidden and cannot be applied." />
        </Sec>

        <Sec id="channel" title="9. Channel & Zone" subtitle="Limit by sales channel and geography.">
          <span className="label">Channels</span>
          <div className="flex flex-wrap gap-3 mb-5">
            {([['quick', 'Quick Commerce', Zap], ['ecommerce', 'eCommerce', ShoppingBag]] as const).map(([v, l, Ic]) => (
              <CheckPill key={v} on={f.channels.includes(v)} onClick={() => set('channels', f.channels.includes(v) ? f.channels.filter((x) => x !== v) : [...f.channels, v])} icon={<Ic className="w-4 h-4" />} label={l} />
            ))}
          </div>
          {isStore ? <p className="text-sm text-muted">Coupon is limited to your store&apos;s delivery zone.</p> : (
            <div className="grid gap-5 md:grid-cols-2">
              <MultiPicker label="Countries" options={countryOpts} value={f.country_ids} onChange={(v) => set('country_ids', v)} hint="None selected = all countries" maxHeight={180} />
              <MultiPicker label="Zones" options={zoneOpts} value={f.zone_ids} onChange={(v) => set('zone_ids', v)} hint="None selected = all zones" maxHeight={180} />
            </div>
          )}
        </Sec>

        <div className="flex justify-end gap-2">
          <Link href={p('/promo-codes')} className="btn-outline">Cancel</Link>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}><Save className="w-4 h-4" /> {busy ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
