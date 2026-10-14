'use client';
// Manage Categories — port of admin/categories/index.blade.php + _row.blade.php (tree table with expandable children).
// All categories are loaded once (small collection) and filtered / nested client-side; no composite indexes needed.
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronRight, ChevronsUpDown, CornerDownRight, Plus, RefreshCw, ShoppingBag, Zap } from 'lucide-react';
import { useCategories, useInvalidate, patchDoc, removeDoc, batchUpdate } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { tr, imgUrl } from '@/lib/format';
import { PageHeader, RowActions, Empty, Spinner, Toggle, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import type { Category } from '@/lib/types';
import { buildTree, isActive, type CatNode } from './shared';

export default function CategoriesPage() {
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { data: all = [], isLoading, isFetching, error, refetch } = useCategories();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [parent, setParent] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const readOnly = isStore;
  const canEdit = !readOnly && can('category.update');
  const canDelete = !readOnly && can('category.delete');
  const canCreate = !readOnly && can('category.create');

  const tree = useMemo(() => buildTree(all, uiLang), [all, uiLang]);
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const flat = !!q.trim() || !!parent;

  const match = (c: Category) => {
    if (status && (isActive(c.status) ? 'active' : 'inactive') !== status) return false;
    if (mode === 'quick' && c.show_in_quick === false) return false;
    if (mode === 'ecommerce' && c.show_in_ecommerce === false) return false;
    return true;
  };

  const rows: CatNode[] = useMemo(() => {
    if (!flat) return tree.filter(match);
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const nodes: CatNode[] = [];
    const walk = (arr: CatNode[]) => arr.forEach((n) => { nodes.push(n); walk(n.children); });
    walk(tree);
    return nodes.filter((c) => {
      if (parent === 'root' && c.parent_id) return false;
      if (parent && parent !== 'root' && c.parent_id !== parent) return false;
      if (terms.length) {
        const hay = `${Object.values(c.name || {}).join(' ')} ${c.slug}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return match(c);
    });
  }, [tree, flat, q, parent, status, mode]);

  const reload = () => invalidate('lookup', 'categories');

  const toggleField = async (c: Category, field: 'status' | 'show_in_quick' | 'show_in_ecommerce') => {
    if (!canEdit) return;
    setBusy(c.id + field);
    try {
      const val = field === 'status' ? (isActive(c.status) ? 'inactive' : 'active') : !(c[field] !== false);
      await patchDoc('categories', c.id, { [field]: val });
      toast('Category updated.');
      await reload();
    } catch (e: any) { toast(e?.message || 'Could not update category', 'error'); }
    setBusy(null);
  };

  const remove = async (c: Category) => {
    if (!(await confirm({ title: 'Delete category?', message: 'Delete this category? Its sub categories will move up one level.', danger: true }))) return;
    try {
      const kids = all.filter((x) => x.parent_id === c.id);
      if (kids.length) await batchUpdate(kids.map((k) => ({ path: 'categories', id: k.id, data: { parent_id: c.parent_id ?? null } })));
      await removeDoc('categories', c.id);
      toast('Category deleted.');
      await reload();
    } catch (e: any) { toast(e?.message || 'Could not delete category', 'error'); }
  };

  const expandAll = () => {
    const o: Record<string, boolean> = {};
    const walk = (arr: CatNode[]) => arr.forEach((n) => { if (n.children.length) { o[n.id] = true; walk(n.children); } });
    walk(tree);
    setOpen(o);
  };

  const cols = readOnly ? 7 : 8;

  const renderRow = (c: CatNode, level: number, visible: boolean): React.ReactNode => {
    const hasKids = !flat && c.children.length > 0;
    const parentCat = c.parent_id ? byId.get(c.parent_id) : null;
    return (
      <Fragment key={c.id}>
        {visible && (
          <tr className={level > 0 ? 'bg-slate-50/60 dark:bg-white/[.02]' : ''} data-testid="category-row">
            <td className="font-semibold text-navy dark:text-white font-mono text-xs" title={c.id}>{c.id.slice(0, 6)}</td>
            <td>
              <div className="flex items-center gap-3" style={{ paddingLeft: level * 28 }}>
                {hasKids ? (
                  <button type="button" className="icon-btn !w-7 !h-7 shrink-0" onClick={() => setOpen((s) => ({ ...s, [c.id]: !s[c.id] }))} title={open[c.id] ? 'Collapse' : 'Expand'}>
                    <ChevronRight className={cx('w-4 h-4 transition-transform', open[c.id] && 'rotate-90')} />
                  </button>
                ) : level > 0 ? (
                  <span className="w-7 shrink-0 text-center text-slate-300"><CornerDownRight className="w-4 h-4 inline" /></span>
                ) : <span className="w-7 shrink-0" />}
                <img src={imgUrl(c.image, tr(c.name, uiLang))} className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-line dark:border-dark-line shrink-0" alt="" />
                <div className="min-w-0">
                  <div className="font-semibold text-navy dark:text-white truncate">{tr(c.name, uiLang) || '—'}</div>
                  {flat && parentCat ? <div className="text-xs text-muted">in {tr(parentCat.name, uiLang)}</div>
                    : hasKids ? <div className="text-xs text-muted">{c.children.length} sub {c.children.length === 1 ? 'category' : 'categories'}</div> : null}
                </div>
              </div>
            </td>
            <td className="text-muted text-xs font-mono">{c.slug}</td>
            <td>
              {c.header_color
                ? <span className="inline-flex items-center gap-2 text-xs font-mono"><span className="w-5 h-5 rounded-md border border-line dark:border-dark-line" style={{ background: c.header_color }} />{c.header_color}</span>
                : <span className="text-muted">—</span>}
            </td>
            <td>
              <div className="flex flex-wrap gap-1">
                <button type="button" disabled={!canEdit || busy === c.id + 'show_in_quick'} onClick={() => toggleField(c, 'show_in_quick')} title={canEdit ? 'Toggle Quick visibility' : undefined}
                  className={cx('pill', c.show_in_quick !== false ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400 line-through', canEdit ? 'cursor-pointer' : 'cursor-default')}>
                  <Zap className="w-3 h-3" /> Quick
                </button>
                <button type="button" disabled={!canEdit || busy === c.id + 'show_in_ecommerce'} onClick={() => toggleField(c, 'show_in_ecommerce')} title={canEdit ? 'Toggle eCommerce visibility' : undefined}
                  className={cx('pill', c.show_in_ecommerce !== false ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400 line-through', canEdit ? 'cursor-pointer' : 'cursor-default')}>
                  <ShoppingBag className="w-3 h-3" /> eCommerce
                </button>
              </div>
            </td>
            <td><span className="font-semibold">{c.product_count ?? 0}</span></td>
            <td>
              {canEdit
                ? <Toggle checked={isActive(c.status)} disabled={busy === c.id + 'status'} onChange={() => toggleField(c, 'status')} />
                : <span className={cx('pill border', isActive(c.status) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200')}>{isActive(c.status) ? 'Active' : 'Inactive'}</span>}
            </td>
            {!readOnly && (
              <td>
                <RowActions edit={canEdit ? p(`/categories/edit/${c.id}`) : undefined} onDelete={canDelete ? () => remove(c) : undefined}>
                  {canCreate && level < 2 && !flat && (
                    <Link href={p(`/categories/new?parent_id=${c.id}`)} className="icon-btn" title="Add sub category"><Plus className="w-4 h-4" /></Link>
                  )}
                </RowActions>
              </td>
            )}
          </tr>
        )}
        {hasKids && c.children.map((k) => renderRow(k, level + 1, visible && !!open[c.id]))}
      </Fragment>
    );
  };

  return (
    <div>
      <PageHeader title="Categories" subtitle={isStore ? 'Categories are managed by the admin. Read-only view.' : 'Organise products into categories and sub categories.'}>
        {!readOnly && (
          <>
            {canEdit && <Link href={p('/categories/order')} className="btn-outline"><ArrowUpDown className="w-4 h-4" /> Category Order</Link>}
            {canCreate && <Link href={p('/categories/new')} className="btn-primary" data-testid="add-category"><Plus className="w-4 h-4" /> Add Category</Link>}
          </>
        )}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-36 !py-2">
            <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="input !w-40 !py-2">
            <option value="">All Modes</option><option value="quick">Quick Commerce</option><option value="ecommerce">eCommerce</option>
          </select>
          <select value={parent} onChange={(e) => setParent(e.target.value)} className="input !w-48 !py-2">
            <option value="">All Parents</option>
            <option value="root">Top level only</option>
            {tree.map((c) => <option key={c.id} value={c.id}>{tr(c.name, uiLang)}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            {!flat && <button type="button" className="btn-soft btn-sm" onClick={expandAll}><ChevronsUpDown className="w-3.5 h-3.5" /> Expand all</button>}
            <SearchBox value={q} onChange={setQ} placeholder="Search categories" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Reset / Refresh" onClick={() => { setQ(''); setStatus(''); setMode(''); setParent(''); refetch(); }}>
              <RefreshCw className={cx('w-4 h-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>Category</th><th>Slug</th><th>Header Color</th><th>Visible In</th><th>Products</th><th>Status</th>
                {!readOnly && <th className="!text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={cols} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : error ? <tr><td colSpan={cols}><Empty text={(error as any)?.message || 'Failed to load categories'} /></td></tr>
                  : !rows.length ? <tr><td colSpan={cols}><Empty text="No categories found." /></td></tr>
                    : rows.map((c) => renderRow(c, 0, true))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-dark-line text-sm text-muted">Total Records : {rows.length}{!flat && ` top-level · ${all.length} categories`}</div>
      </div>
    </div>
  );
}
