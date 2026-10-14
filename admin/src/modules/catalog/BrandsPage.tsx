'use client';
// Brands — port of admin/brands/{index,form}.blade.php: list + create/edit modal. Store panel: read-only list.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { removeDoc, saveDoc, useBrands, useInvalidate, patchDoc, countDocs, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { imgUrl, searchKeywords, slugify } from '@/lib/format';
import { Empty, PageHeader, RowActions, Spinner, StatusPill, Toggle, cx } from '@/components/ui';
import { ImageUpload, Input, SearchBox } from '@/components/form/fields';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import type { Brand } from '@/lib/types';
import { isActive, uniqueSlug } from './shared';

type SortKey = 'name' | 'sort_order' | 'products';

export default function BrandsPage() {
  const { isStore } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { data: brands = [], isLoading, isFetching, error, refetch } = useBrands();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'sort_order', dir: 1 });
  const [edit, setEdit] = useState<Partial<Brand> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canCreate = !isStore && can('brand.create');
  const canEdit = !isStore && can('brand.update');
  const canDelete = !isStore && can('brand.delete');

  const ids = brands.map((b) => b.id);
  const canListProducts = can('product.list');
  const { data: counts = {} } = useQuery({
    queryKey: ['brand-product-counts', ids.join(','), canListProducts],
    enabled: ids.length > 0 && !isStore,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(ids.map(async (id) => {
        // without product.list the rules only allow reading active products
        try { out[id] = await countDocs('products', [where('brand_id', '==', id), ...(canListProducts ? [] : [where('status', '==', 'active')])]); } catch { /* rules / offline */ }
      }));
      return out;
    },
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = brands.filter((b) => (!status || (isActive(b.status) ? 'active' : 'inactive') === status) && (!t || `${b.name} ${b.slug}`.toLowerCase().includes(t)));
    const val = (b: Brand) => (sort.key === 'products' ? counts[b.id] ?? 0 : sort.key === 'sort_order' ? b.sort_order ?? 0 : (b.name || '').toLowerCase());
    return [...list].sort((a, b) => { const x = val(a); const y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [brands, q, status, sort, counts]);

  const reload = () => invalidate('lookup', 'brands');
  const th = (key: SortKey, label: string) => (
    <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-primary" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key && <span className="opacity-60">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </button>
  );

  const toggleStatus = async (b: Brand) => {
    setBusy(b.id);
    try { await patchDoc('brands', b.id, { status: isActive(b.status) ? 'inactive' : 'active' }); toast('Brand updated.'); await reload(); }
    catch (e: any) { toast(e?.message || 'Could not update brand', 'error'); }
    setBusy(null);
  };
  const remove = async (b: Brand) => {
    if (!(await confirm({ title: 'Delete brand?', message: `Delete "${b.name}"? Products keep their brand name but lose the link.`, danger: true }))) return;
    try { await removeDoc('brands', b.id); toast('Brand deleted.'); await reload(); }
    catch (e: any) { toast(e?.message || 'Could not delete brand', 'error'); }
  };

  return (
    <div>
      <PageHeader title="Brands" subtitle={isStore ? 'Brands are managed by the admin. Read-only view.' : undefined}>
        {canCreate && <button type="button" className="btn-primary" data-testid="add-brand" onClick={() => setEdit({ status: 'active', sort_order: (Math.max(0, ...brands.map((b) => b.sort_order ?? 0)) || 0) + 1 })}><Plus className="w-4 h-4" /> Add Brand</button>}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40 !py-2">
            <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search brands" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setQ(''); setStatus(''); refetch(); }}><RefreshCw className={cx('w-4 h-4', isFetching && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="tbl">
            <thead>
              <tr>
                <th>{th('sort_order', '#')}</th><th>Logo</th><th>{th('name', 'Name')}</th><th>Slug</th><th>{th('products', 'Products')}</th><th>Status</th>
                {(canEdit || canDelete) && <th className="!text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : error ? <tr><td colSpan={7}><Empty text={(error as any)?.message || 'Failed to load brands'} /></td></tr>
                  : !rows.length ? <tr><td colSpan={7}><Empty text="No brands found." /></td></tr>
                    : rows.map((b) => (
                      <tr key={b.id}>
                        <td className="font-semibold text-navy dark:text-white">{b.sort_order ?? 0}</td>
                        <td><img src={imgUrl(b.logo, b.name)} className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-line" alt="" /></td>
                        <td className="font-medium">{b.name}</td>
                        <td className="text-muted text-xs font-mono">{b.slug}</td>
                        <td>{counts[b.id] ?? '—'}</td>
                        <td>{canEdit ? <Toggle checked={isActive(b.status)} disabled={busy === b.id} onChange={() => toggleStatus(b)} /> : <StatusPill status={isActive(b.status) ? 'active' : 'inactive'} />}</td>
                        {(canEdit || canDelete) && <td><RowActions onDelete={canDelete ? () => remove(b) : undefined}>
                          {canEdit && <button type="button" className="icon-btn" title="Edit" onClick={() => setEdit(b)}><Pencil className="w-4 h-4" /></button>}
                        </RowActions></td>}
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-dark-line text-sm text-muted">Total Records : {rows.length}</div>
      </div>

      {edit && <BrandModal brand={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </div>
  );
}

function BrandModal({ brand, onClose, onSaved }: { brand: Partial<Brand>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(brand.name || '');
  const [slug, setSlug] = useState(brand.slug || '');
  const [slugTouched, setSlugTouched] = useState(!!brand.id);
  const [logo, setLogo] = useState(brand.logo || '');
  const [sortOrder, setSortOrder] = useState<number>(Number(brand.sort_order ?? 0));
  const [active, setActive] = useState(brand.status ? isActive(brand.status) : true);
  const [saving, setSaving] = useState(false);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) { toast('The brand name is required.', 'error'); return; }
    setSaving(true);
    try {
      const finalSlug = await uniqueSlug('brands', slug || name, brand.id);
      await saveDoc('brands', brand.id || null, {
        name: name.trim(), slug: finalSlug, logo: logo || null, sort_order: Math.max(0, Number(sortOrder) || 0),
        status: active ? 'active' : 'inactive', search_keywords: searchKeywords(name, finalSlug),
      });
      toast(brand.id ? 'Brand updated successfully.' : 'Brand created successfully.');
      onSaved();
    } catch (err: any) { toast(err?.message || 'Could not save brand', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={brand.id ? 'Edit Brand' : 'Add Brand'} size="2xl"
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => save()} disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Brand'}</button>
      </>}>
      <form onSubmit={save} className="p-5">
        <p className="text-xs text-muted mb-4">Brands appear in filters, product pages and the Top Brands home section.</p>
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Brand Name" required value={name} wrapClass="md:col-span-2" autoFocus
            onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
          <Input label="Slug" className="font-mono text-sm" value={slug} placeholder="auto-generated-from-name" onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
          <Input label="Sort Order" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
          <ImageUpload label="Logo" value={logo} onChange={setLogo} folder="catalog/brands" />
          <div className="flex items-end pb-3">
            <Toggle checked={active} onChange={setActive} label="Active" description="Inactive brands are hidden in the apps." />
          </div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
