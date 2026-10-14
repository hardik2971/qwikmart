'use client';
// Add / Edit Banner — port of admin/banners/form.blade.php + BannerController (title/subtitle translatable, link picker, zone, mode, position).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CircleOff, Layers, LayoutGrid, Link2, Package, Save, ShoppingBag, Zap } from 'lucide-react';
import { fetchDoc, saveDoc, useCategories, useInvalidate, useZones } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { Card, Forbidden, Loading, PageHeader, Toggle, cx } from '@/components/ui';
import { ImageUpload, Input, Select } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import type { Banner, Trans } from '@/lib/types';
import { categoryOptions, isActive } from './shared';
import { EntityPicker, useBannersAll } from './pickers';

type LinkType = Banner['link_type'];
type BMode = 'quick' | 'ecommerce' | 'both';
const LINKS: [LinkType, string, typeof Zap][] = [['none', 'No link', CircleOff], ['product', 'Product', Package], ['category', 'Category', LayoutGrid], ['url', 'URL', Link2]];
const MODES: [BMode, string, typeof Zap][] = [['quick', 'Quick', Zap], ['ecommerce', 'eCom', ShoppingBag], ['both', 'Both', Layers]];

export default function BannerFormPage() {
  const params = useParams<{ id?: string }>();
  const id = (params?.id as string) || null;
  const router = useRouter();
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: zones = [] } = useZones();
  const { data: cats = [] } = useCategories();
  const { data: banners = [] } = useBannersAll();

  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState<Trans>({});
  const [subtitle, setSubtitle] = useState<Trans>({});
  const [image, setImage] = useState('');
  const [type, setType] = useState<LinkType>('none');
  const [product, setProduct] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [url, setUrl] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [mode, setMode] = useState<BMode>('both');
  const [sortOrder, setSortOrder] = useState<number | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchDoc<Banner>('banners', id).then((b) => {
      if (!alive) return;
      if (!b) { setNotFound(true); return; }
      setTitle(typeof b.title === 'string' ? { en: b.title } : b.title || {});
      setSubtitle(typeof b.subtitle === 'string' ? { en: b.subtitle } : b.subtitle || {});
      setImage(b.image || ''); setType(b.link_type || 'none');
      if (b.link_type === 'product') setProduct(b.link_value || null);
      if (b.link_type === 'category') setCategory(b.link_value || '');
      if (b.link_type === 'url') setUrl(b.link_value || '');
      setZoneId(b.zone_id || ''); setMode((b.mode as BMode) || 'both'); setSortOrder(Number(b.sort_order ?? 0)); setActive(isActive(b.status));
    }).catch((e) => toast(e?.message || 'Could not load banner', 'error')).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  // new banner: next position
  useEffect(() => {
    if (id || sortOrder !== null || !banners.length) return;
    setSortOrder(Math.max(0, ...banners.map((b) => b.sort_order ?? 0)) + 1);
  }, [banners, id]);

  const catOpts = useMemo(() => categoryOptions(cats, uiLang), [cats, uiLang]);
  const zoneOpts = useMemo(() => zones.map((z) => ({ value: z.id, label: z.name + (z.city ? ` (${z.city})` : '') })), [zones]);

  if (isStore || !can(id ? 'banner.update' : 'banner.create')) return <Forbidden />;
  if (loading) return <Loading />;
  if (notFound) return <div><PageHeader title="Edit Banner" back={p('/banners')} /><div className="card p-10 text-center text-muted">Banner not found.</div></div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = !title.en?.trim() ? 'The English title is required.'
      : !image ? 'Upload the banner image.'
        : type === 'product' && !product ? 'Choose the product this banner opens.'
          : type === 'category' && !category ? 'Choose the category this banner opens.'
            : type === 'url' && !url.trim() ? 'Enter the URL this banner opens.' : null;
    if (err) { toast(err, 'error'); return; }
    setSaving(true);
    try {
      await saveDoc('banners', id, {
        title, subtitle, image,
        link_type: type,
        link_value: type === 'product' ? product : type === 'category' ? category : type === 'url' ? url.trim() : null,
        zone_id: zoneId || null, mode,
        sort_order: Math.max(0, Number(sortOrder) || 0),
        status: active ? 'active' : 'inactive',
      });
      await invalidate('list', 'banners');
      toast(id ? 'Banner updated successfully.' : 'Banner created successfully.');
      router.push(p('/banners'));
    } catch (er: any) { toast(er?.message || 'Could not save banner', 'error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="max-w-5xl">
      <PageHeader title={id ? 'Edit Banner' : 'Add Banner'} back={p('/banners')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Banner Details">
            <LangTabs translate>
              <TransInput label="Title" value={title} onChange={setTitle} required placeholder="e.g. Fresh Fruits — up to 30% off" />
              <TransInput label="Subtitle" value={subtitle} onChange={setSubtitle} placeholder="Optional" />
            </LangTabs>
            <ImageUpload className="mt-5" label="Banner Image" value={image} onChange={setImage} folder="catalog/banners" square={false} hint="Wide image (approx. 1200×500), JPG/PNG/WEBP up to 5MB" />
          </Card>

          <Card title="Link" subtitle="What opens when a customer taps the banner.">
            <div className="flex flex-wrap gap-2 mb-5">
              {LINKS.map(([k, l, Ic]) => (
                <button key={k} type="button" className={cx('chip', type === k && 'chip-active')} onClick={() => setType(k)}><Ic className="w-3.5 h-3.5" /> {l}</button>
              ))}
            </div>
            {type === 'product' && <EntityPicker type="products" multiple={false} value={product} onChange={setProduct} label="Product" placeholder="Search products…" />}
            {type === 'category' && <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={catOpts} placeholder="Select a category" />}
            {type === 'url' && <Input label="URL" type="text" icon={<Link2 />} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/offer" />}
            {type === 'none' && <p className="text-sm text-muted">The banner is display-only.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Targeting">
            <div className="space-y-5">
              <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOpts} placeholder="All zones" hint="Leave empty to show in every zone." />
              <div>
                <span className="label">Mode</span>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map(([k, l, Ic]) => (
                    <button key={k} type="button" onClick={() => setMode(k)}
                      className={cx('flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition',
                        mode === k ? 'border-primary bg-primary-50 text-primary' : 'border-line dark:border-dark-line text-muted hover:border-primary/40')}>
                      <Ic className="w-4 h-4" /> {l}
                    </button>
                  ))}
                </div>
              </div>
              <Input type="number" label="Position" min={0} value={sortOrder ?? 0} onChange={(e) => setSortOrder(Number(e.target.value))} hint="Lower numbers show first." />
              <Toggle checked={active} onChange={setActive} label="Active" description="Inactive banners are hidden in the apps." />
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <Link href={p('/banners')} className="btn-outline">Cancel</Link>
            <button className="btn-primary" disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Banner'}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
