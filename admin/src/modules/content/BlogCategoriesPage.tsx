'use client';
// Port of admin/blog-categories/index.blade.php — modal CRUD.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { removeDoc, saveDoc, useListQ, countDocs, where } from '@/lib/firestore';
import { errMsg, slugify, tr } from '@/lib/format';
import type { BlogCategory, Trans } from '@/lib/types';
import { PageHeader, Spinner, Forbidden } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { Modal } from '@/components/ui/Modal';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

export default function BlogCategoriesPage() {
  const { p, uiLang } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const list = useListQ<BlogCategory>(['all'], 'blog_categories');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: string | null; name: Trans } | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = (list.data || []).map((c) => c.id);
  const counts = useQuery({
    queryKey: ['blog-cat-counts', ids.join(',')], enabled: ids.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(ids.map(async (id) => { try { out[id] = await countDocs('blogs', [where('category_id', '==', id)]); } catch { out[id] = 0; } }));
      return out;
    },
  });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || []).filter((c) => !s || tr(c.name, uiLang).toLowerCase().includes(s) || c.slug?.includes(s)).sort((a, b) => tr(a.name, uiLang).localeCompare(tr(b.name, uiLang)));
  }, [list.data, q, uiLang]);

  const save = async () => {
    if (!edit) return;
    const en = edit.name.en || Object.values(edit.name).find(Boolean);
    if (!en) { toast('The name is required.', 'error'); return; }
    setBusy(true);
    try {
      let slug = slugify(String(edit.name.en || en)) || `category-${Date.now()}`;
      if ((list.data || []).some((c) => c.slug === slug && c.id !== edit.id)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      await saveDoc('blog_categories', edit.id, { name: edit.name, slug, status: 'active' });
      toast(edit.id ? 'Category updated.' : 'Category created.');
      setEdit(null); list.refetch();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const del = async (c: BlogCategory) => {
    if (!(await confirm({ title: 'Delete this category?', message: 'Its blogs will become uncategorised.', danger: true }))) return;
    try { await removeDoc('blog_categories', c.id); toast('Category deleted.'); list.refetch(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  if (!can('blog.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Blog Categories">
        <Link href={p('/blogs')} className="btn-outline"><Newspaper className="w-4 h-4" /> Blogs</Link>
        {can('blog.create') && <button type="button" className="btn-primary" onClick={() => setEdit({ id: null, name: {} })} data-testid="add-category"><Plus className="w-4 h-4" /> Add Category</button>}
      </PageHeader>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-line dark:border-dark-line"><div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Search categories" /></div></div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Slug</th><th>Blogs</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {list.isLoading ? <tr><td colSpan={4} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : list.error ? <tr><td colSpan={4} className="!py-14 text-center text-muted">{errMsg(list.error)}</td></tr>
                  : !rows.length ? <tr><td colSpan={4} className="!py-14 text-center text-muted">No records found.</td></tr>
                    : rows.map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium">{tr(c.name, uiLang)}</td>
                        <td className="font-mono text-xs text-muted">{c.slug}</td>
                        <td>{counts.data?.[c.id] ?? '…'}</td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            {can('blog.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => setEdit({ id: c.id, name: typeof c.name === 'string' ? { en: c.name } : c.name || {} })}><Pencil className="w-4 h-4" /></button>}
                            {can('blog.delete') && <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(c)}><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-dark-line text-sm text-muted">Total Records : {rows.length}</div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit Blog Category' : 'Add Blog Category'} size="xl">
        {edit && (
          <div className="p-5">
            <LangTabs translate>
              <TransInput label="Name" required value={edit.name} onChange={(v) => setEdit((s) => (s ? { ...s, name: v } : s))} />
            </LangTabs>
            <div className="flex justify-end gap-2 pt-5">
              <button type="button" className="btn-gray" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : edit.id ? 'Update' : 'Save'}</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
