'use client';
// Add / Edit Category — port of admin/categories/form.blade.php + CategoryController@store/update.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, X } from 'lucide-react';
import { fetchDoc, saveDoc, useCategories, useInvalidate } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { searchKeywords, slugify } from '@/lib/format';
import { Card, Forbidden, Loading, PageHeader, Toggle } from '@/components/ui';
import { ImageUpload, Input, Select } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import type { Category, Trans } from '@/lib/types';
import { categoryOptions, descendantIds, isActive, uniqueSlug } from './shared';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FOLDER = 'catalog/categories';

export default function CategoryFormPage() {
  const params = useParams<{ id?: string }>();
  const id = (params?.id as string) || null;
  const sp = useSearchParams();
  const router = useRouter();
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: all = [] } = useCategories();

  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState<Trans>({});
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState<string>(sp?.get('parent_id') || '');
  const [image, setImage] = useState('');
  const [icon, setIcon] = useState('');
  const [banner, setBanner] = useState('');
  const [color, setColor] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [quick, setQuick] = useState(true);
  const [ecom, setEcom] = useState(true);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const c = await fetchDoc<Category>('categories', id);
        if (!alive) return;
        if (!c) { setNotFound(true); return; }
        setName(c.name || {}); setSlug(c.slug || ''); setSlugTouched(true); setParentId(c.parent_id || '');
        setImage(c.image || ''); setIcon(c.icon || ''); setBanner(c.banner || ''); setColor(c.header_color || '');
        setSortOrder(Number(c.sort_order ?? 0)); setQuick(c.show_in_quick !== false); setEcom(c.show_in_ecommerce !== false); setActive(isActive(c.status));
      } catch (e: any) { toast(e?.message || 'Could not load category', 'error'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id]);

  const parentOptions = useMemo(() => {
    const blocked = id ? new Set(descendantIds(all, id)) : new Set<string>();
    return categoryOptions(all.filter((c) => !blocked.has(c.id)), uiLang);
  }, [all, id, uiLang]);

  if (isStore || !can(id ? 'category.update' : 'category.create')) return <Forbidden />;
  if (loading) return <Loading />;
  if (notFound) return <div><PageHeader title="Edit Category" back={p('/categories')} /><div className="card p-10 text-center text-muted">Category not found.</div></div>;

  const onName = (v: Trans) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v.en || ''));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.en?.trim()) errs.name = 'The English name is required.';
    if (color && !HEX.test(color)) errs.header_color = 'Use a hex colour like #0E9623.';
    if (id && parentId === id) errs.parent_id = 'A category cannot be its own parent.';
    setErrors(errs);
    if (Object.keys(errs).length) { toast(Object.values(errs)[0], 'error'); return; }
    setSaving(true);
    try {
      const finalSlug = await uniqueSlug('categories', slug || name.en || '', id);
      await saveDoc('categories', id, {
        parent_id: parentId || null,
        name, slug: finalSlug,
        image: image || null, icon: icon || null, banner: banner || null,
        header_color: color || null,
        sort_order: Math.max(0, Number(sortOrder) || 0),
        show_in_quick: quick, show_in_ecommerce: ecom,
        status: active ? 'active' : 'inactive',
        search_keywords: searchKeywords(name, finalSlug),
      });
      await invalidate('lookup', 'categories');
      toast(id ? 'Category updated successfully.' : 'Category created successfully.');
      router.push(p('/categories'));
    } catch (err: any) {
      toast(err?.message || 'Could not save category', 'error');
    }
    setSaving(false);
  };

  const swatch = HEX.test(color) && color.length === 7 ? color : '#0E9623';

  return (
    <form onSubmit={submit}>
      <PageHeader title={id ? 'Edit Category' : 'Add Category'} back={p('/categories')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Category Details" subtitle="Name is translatable — use Translate to fill other languages.">
            <LangTabs translate>
              <TransInput label="Category Name" value={name} onChange={onName} required error={errors.name} />
            </LangTabs>
            <div className="grid gap-5 md:grid-cols-2 mt-5">
              <Input label="Slug" className="font-mono text-sm" value={slug} placeholder="auto-generated-from-name"
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} hint="Leave empty to generate from the English name." />
              <Select label="Parent Category" value={parentId} onChange={(e) => setParentId(e.target.value)} options={parentOptions}
                placeholder="— None (top-level) —" hint="Choose a top-level or second-level category." error={errors.parent_id} />
            </div>
          </Card>

          <Card title="Media" subtitle="Image is shown in category grids, icon in compact lists, banner on the category page.">
            <div className="grid gap-5 md:grid-cols-2">
              <ImageUpload label="Image" value={image} onChange={setImage} folder={FOLDER} />
              <ImageUpload label="Icon" value={icon} onChange={setIcon} folder={FOLDER} hint="Square PNG/SVG-like icon, up to 5MB" />
              <ImageUpload label="Banner" value={banner} onChange={setBanner} folder={FOLDER} square={false} hint="Wide image, up to 5MB" className="md:col-span-2" />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Appearance">
            <label className="label" htmlFor="f_header_color">Header Color</label>
            <div className="flex items-center gap-2">
              <input type="color" className="h-10 w-12 rounded-lg border border-line dark:border-dark-line cursor-pointer p-0.5 bg-white dark:bg-dark-card"
                value={swatch} onChange={(e) => setColor(e.target.value.toUpperCase())} />
              <input id="f_header_color" type="text" value={color} maxLength={9} placeholder="#0E9623" className="input font-mono" onChange={(e) => setColor(e.target.value)} />
              <button type="button" className="icon-btn shrink-0" title="Clear" onClick={() => setColor('')}><X className="w-4 h-4" /></button>
            </div>
            <p className="mt-1 text-xs text-muted">Tints the app header when this category is open.</p>
            {errors.header_color && <p className="mt-1 text-xs text-red-500">{errors.header_color}</p>}
            <div className="mt-4 rounded-xl h-14 flex items-center px-4 text-white font-bold text-sm transition-colors" style={{ background: color || '#0E9623' }}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Preview
            </div>
            <Input type="number" label="Sort Order" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} wrapClass="mt-5" />
          </Card>

          <Card title="Visibility">
            <div className="space-y-4">
              <Toggle checked={quick} onChange={setQuick} label="Show in Quick Commerce" description="Visible in the 10-minute delivery mode." />
              <Toggle checked={ecom} onChange={setEcom} label="Show in eCommerce" description="Visible in the standard shopping mode." />
              <Toggle checked={active} onChange={setActive} label="Active" description="Inactive categories are hidden in the apps." />
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Link href={p('/categories')} className="btn-outline">Cancel</Link>
            <button className="btn-primary" disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Category'}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
