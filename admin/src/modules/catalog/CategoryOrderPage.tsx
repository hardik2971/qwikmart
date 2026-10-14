'use client';
// Category Order — port of admin/categories/order.blade.php (drag & drop top level + sub categories) → batchUpdate sort_order.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, GripVertical, Layers, ListTree, MousePointerClick, Save } from 'lucide-react';
import { batchUpdate, useCategories, useInvalidate } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { tr, imgUrl } from '@/lib/format';
import { Card, Forbidden, Loading, PageHeader, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import type { Category } from '@/lib/types';
import { buildTree, isActive, type CatNode } from './shared';
import { SortableList } from './Sortable';

export default function CategoryOrderPage() {
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: all, isLoading } = useCategories();
  const [roots, setRoots] = useState<CatNode[]>([]);
  const [children, setChildren] = useState<Record<string, CatNode[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const tree = useMemo(() => buildTree(all || [], uiLang), [all, uiLang]);
  useEffect(() => {
    if (dirty) return;
    setRoots(tree);
    setChildren(Object.fromEntries(tree.map((r) => [r.id, r.children])));
  }, [tree]);

  if (isStore || !can('category.update')) return <Forbidden />;
  if (isLoading) return <Loading />;

  const sel = roots.find((r) => r.id === selected) || null;

  const save = async () => {
    const orig = new Map((all || []).map((c: Category) => [c.id, c]));
    const updates: { path: string; id: string; data: Record<string, any> }[] = [];
    roots.forEach((r, i) => { const o = orig.get(r.id); if (o && (o.sort_order !== i + 1 || o.parent_id)) updates.push({ path: 'categories', id: r.id, data: { sort_order: i + 1, parent_id: null } }); });
    for (const [pid, list] of Object.entries(children)) {
      list.forEach((c, i) => { const o = orig.get(c.id); if (o && (o.sort_order !== i + 1 || o.parent_id !== pid)) updates.push({ path: 'categories', id: c.id, data: { sort_order: i + 1, parent_id: pid } }); });
    }
    setSaving(true);
    try {
      if (updates.length) await batchUpdate(updates);
      setDirty(false);
      await invalidate('lookup', 'categories');
      toast(updates.length ? 'Category order saved.' : 'Nothing changed.');
    } catch (e: any) { toast(e?.message || 'Could not save order', 'error'); }
    setSaving(false);
  };

  const item = (c: CatNode, handle: any, root?: boolean) => (
    <div onClick={root ? () => setSelected(c.id) : undefined}
      className={cx('flex items-center gap-3 rounded-xl border bg-white dark:bg-dark-card px-3 py-2.5 transition', root && 'cursor-pointer',
        root && selected === c.id ? 'border-primary ring-2 ring-primary/20' : 'border-line dark:border-dark-line hover:border-primary/40')}>
      <span {...handle} onClick={(e) => e.stopPropagation()} className="cursor-grab text-slate-400 hover:text-navy touch-none" title="Drag"><GripVertical className="w-4 h-4" /></span>
      <img src={imgUrl(c.image, tr(c.name, uiLang))} className="w-9 h-9 rounded-lg object-cover border border-line dark:border-dark-line" alt="" />
      <span className={cx('flex-1 text-navy dark:text-white truncate', root ? 'font-semibold' : 'font-medium')}>{tr(c.name, uiLang)}</span>
      {!isActive(c.status) && <span className="pill bg-slate-100 text-slate-500">Inactive</span>}
      {root && <span className="chip !py-0.5 text-xs">{(children[c.id] || []).length} sub</span>}
      {root && <ChevronRight className="w-4 h-4 text-slate-400" />}
    </div>
  );

  return (
    <div>
      <PageHeader title="Category Order" subtitle="Drag to reorder. Click a parent category to reorder its sub categories." back={p('/categories')}>
        <button type="button" className="btn-primary" onClick={save} disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Order'}</button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top-level Categories" icon={Layers} subtitle={`${roots.length} categories`}>
          {!roots.length && <p className="py-10 text-center text-muted">No categories yet.</p>}
          <SortableList items={roots} onReorder={(n) => { setRoots(n); setDirty(true); }} render={(c, h) => item(c, h, true)} />
        </Card>
        <Card title="Sub Categories" icon={ListTree} actions={sel ? <span className="text-sm font-semibold text-primary">{tr(sel.name, uiLang)}</span> : undefined}>
          {!sel ? (
            <div className="py-14 text-center text-muted">
              <MousePointerClick className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              Select a parent category on the left to reorder its sub categories.
            </div>
          ) : !(children[sel.id] || []).length ? (
            <p className="py-14 text-center text-muted">This category has no sub categories.</p>
          ) : (
            <SortableList items={children[sel.id]} onReorder={(n) => { setChildren((s) => ({ ...s, [sel.id]: n })); setDirty(true); }} render={(c, h) => item(c, h)} />
          )}
        </Card>
      </div>
    </div>
  );
}
