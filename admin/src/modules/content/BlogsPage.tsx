'use client';
// Port of admin/blogs/index.blade.php.
import { useState } from 'react';
import Link from 'next/link';
import { Folder, Plus } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { removeDoc, useListQ } from '@/lib/firestore';
import { errMsg, fmtDate, imgUrl, num, tr } from '@/lib/format';
import type { Blog, BlogCategory } from '@/lib/types';
import { PageHeader, RowActions, StatusPill, Forbidden } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

export const isOn = (s: any) => s === 'active' || s === 'published' || s === true;

export default function BlogsPage() {
  const { p, uiLang } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const cats = useListQ<BlogCategory>(['all'], 'blog_categories');
  const catName = (id?: string) => { const c = (cats.data || []).find((x) => x.id === id); return c ? tr(c.name, uiLang) : '—'; };

  const del = async (b: Blog) => {
    if (!(await confirm({ title: 'Delete this blog?', message: tr(b.title, uiLang), danger: true }))) return;
    try { await removeDoc('blogs', b.id); toast('Blog deleted.'); setRefresh((r) => r + 1); } catch (e) { toast(errMsg(e), 'error'); }
  };

  if (!can('blog.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Blogs">
        <Link href={p('/blog-categories')} className="btn-outline"><Folder className="w-4 h-4" /> Categories</Link>
        {can('blog.create') && <Link href={p('/blogs/new')} className="btn-primary" data-testid="add-blog"><Plus className="w-4 h-4" /> Add Blog</Link>}
      </PageHeader>
      <DataTable<Blog>
        path="blogs"
        refreshKey={refresh}
        search="Search blogs"
        defaultSort={{ field: 'created_at', dir: 'desc' }}
        filters={[
          { key: 'category_id', placeholder: 'All Categories', options: (cats.data || []).map((c) => ({ value: c.id, label: tr(c.name, uiLang) })) },
          { key: 'status', placeholder: 'All Statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
        ]}
        columns={[
          { key: 'image', header: 'Image', render: (b) => <img src={imgUrl(b.image, tr(b.title, uiLang) || 'B')} className="w-16 h-11 rounded-lg object-cover border border-line" alt="" /> },
          { key: 'title', header: 'Title', className: 'max-w-xs', render: (b) => <><span className="font-medium text-navy dark:text-white">{tr(b.title, uiLang)}</span><span className="block text-xs text-muted truncate">/{b.slug}</span></> },
          { key: 'category', header: 'Category', render: (b) => catName(b.category_id) },
          { key: 'read_minutes', header: 'Read Time', sort: 'read_minutes', className: 'whitespace-nowrap', render: (b) => `${b.read_minutes ?? 0} min` },
          { key: 'views', header: 'Views', sort: 'views', render: (b) => num(b.views) },
          { key: 'status', header: 'Status', sort: 'status', render: (b) => <StatusPill status={isOn(b.status)} /> },
          { key: 'created_at', header: 'Date', sort: 'created_at', className: 'whitespace-nowrap text-muted', render: (b) => fmtDate((b as any).created_at ?? b.published_at) },
          { key: 'actions', header: <span className="block text-right">Actions</span>, render: (b) => <RowActions edit={can('blog.update') ? p(`/blogs/edit/${b.id}`) : undefined} onDelete={can('blog.delete') ? () => del(b) : undefined} /> },
        ]}
      />
    </>
  );
}
