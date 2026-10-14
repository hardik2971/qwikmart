'use client';
// Product Approvals — port of admin/products/approvals.blade.php (admin only).
import { useState } from 'react';
import Link from 'next/link';
import { deleteField } from 'firebase/firestore';
import { Check, Eye, X } from 'lucide-react';
import { patchDoc, where, useCategories, useStores } from '@/lib/firestore';
import { errMsg, fmtDateTime, imgUrl, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Product } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Forbidden, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { priceRange, thumbOf } from './shared';

export default function ApprovalsPage() {
  const { p, isStore, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { prompt, confirm } = useConfirm();
  const { data: stores = [] } = useStores();
  const { data: categories = [] } = useCategories();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState('');

  if (isStore || !can('product.approve')) return <Forbidden />;

  const approve = async (pr: Product) => {
    if (!(await confirm({ title: 'Approve this product?', message: tr(pr.name, uiLang), confirmText: 'Approve' }))) return;
    setBusy(pr.id);
    try { await patchDoc('products', pr.id, { status: 'active', rejection_reason: deleteField() }); toast('Product approved and is now live.'); setRefreshKey((k) => k + 1); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy('');
  };
  const reject = async (pr: Product) => {
    const reason = await prompt({ title: 'Reject this product?', message: tr(pr.name, uiLang), danger: true, confirmText: 'Reject', input: { label: 'Rejection reason', required: true, multiline: true } });
    if (reason === null) return;
    setBusy(pr.id);
    try { await patchDoc('products', pr.id, { status: 'inactive', rejection_reason: reason.trim() }); toast('Product rejected.'); setRefreshKey((k) => k + 1); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy('');
  };

  const columns: Column<Product>[] = [
    {
      key: 'product', header: 'Product', render: (pr) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <img src={imgUrl(thumbOf(pr), tr(pr.name))} className="w-10 h-10 rounded-lg object-cover border border-line" alt="" />
          <Link href={p(`/products/view/${pr.id}`)} className="font-medium hover:text-primary">{tr(pr.name, uiLang)}</Link>
        </div>
      ),
    },
    { key: 'store', header: 'Store', render: (pr) => stores.find((s) => s.id === pr.store_id)?.name || '-' },
    { key: 'category', header: 'Category', render: (pr) => tr(categories.find((c) => c.id === pr.category_id)?.name, uiLang) || '-' },
    { key: 'variants', header: 'Variants', render: (pr) => pr.variants?.length ?? 0 },
    { key: 'price', header: 'Price', className: 'whitespace-nowrap', render: (pr) => priceRange(pr) },
    { key: 'created_at', header: 'Submitted', sort: 'created_at', className: 'whitespace-nowrap text-muted', render: (pr) => fmtDateTime(pr.created_at) },
    {
      key: 'actions', header: 'Actions', align: 'right', render: (pr) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link href={p(`/products/view/${pr.id}`)} className="icon-btn" title="View"><Eye className="w-4 h-4" /></Link>
          <button type="button" className="btn-primary btn-sm" disabled={busy === pr.id} onClick={() => approve(pr)} data-testid="approve"><Check className="w-3.5 h-3.5" /> Approve</button>
          <button type="button" className="btn-danger btn-sm" disabled={busy === pr.id} onClick={() => reject(pr)} data-testid="reject"><X className="w-3.5 h-3.5" /> Reject</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Product Approvals" subtitle="Products submitted by stores waiting for review" back={p('/products')} />
      <DataTable<Product>
        path="products"
        constraints={[where('status', '==', 'pending_approval')]}
        filters={[{ key: 'store_id', placeholder: 'All Stores', options: stores.map((s) => ({ value: s.id, label: s.name })) }]}
        search="Search products"
        columns={columns}
        refreshKey={refreshKey}
        empty="No products are waiting for approval."
        testId="approvals-table"
      />
    </div>
  );
}
