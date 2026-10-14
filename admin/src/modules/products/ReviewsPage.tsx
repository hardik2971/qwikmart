'use client';
// Product Ratings — port of admin/reviews/index.blade.php (stats, rating/status filters, visibility toggle, delete).
// Store panel: reviews of the store's own products (product_id `in` — first 30 products, or the picked product).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { QueryConstraint } from 'firebase/firestore';
import { Eye, EyeOff, MessageSquare, Star } from 'lucide-react';
import { fetchByIds, fetchList, patchDoc, removeDoc, where, countDocs, aggregateDocs } from '@/lib/firestore';
import { errMsg, fmtDate, imgUrl, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Avatar, Loading, PageHeader, RowActions, StatCard, cx } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import type { Product, Review } from '@/lib/types';
import { Stars, thumbOf } from './shared';

const on = (r: Review) => r.status === 'active' || (r.status as any) === true;

export default function ReviewsPage() {
  const { p, storeId, uiLang } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const sp = useSearchParams();
  const [product, setProduct] = useState(sp.get('product') || '');
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [storeProducts, setStoreProducts] = useState<Product[] | null>(storeId ? null : []);
  const [stats, setStats] = useState({ total: 0, avg: 0, active: 0, hidden: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((k) => k + 1);

  // store panel: own product ids
  useEffect(() => {
    if (!storeId) return;
    fetchList<Product>('products', where('store_id', '==', storeId)).then((l) => {
      setStoreProducts(l);
      setProducts((m) => ({ ...m, ...Object.fromEntries(l.map((x) => [x.id, x])) }));
    }).catch(() => setStoreProducts([]));
  }, [storeId]);

  const scope: QueryConstraint[] | null = useMemo(() => {
    if (product) return [where('product_id', '==', product)];
    if (!storeId) return [];
    if (!storeProducts) return null;
    const ids = storeProducts.map((x) => x.id).slice(0, 30);
    return [where('product_id', 'in', ids.length ? ids : ['__none__']), where('status', '==', 'active')];
  }, [product, storeId, storeProducts]);

  useEffect(() => {
    if (!scope) return;
    let alive = true;
    (async () => {
      try {
        const [a, active] = await Promise.all([
          aggregateDocs('reviews', scope, { avg: { avg: 'rating' } }),
          countDocs('reviews', [...scope, where('status', '==', 'active')]),
        ]);
        if (!alive) return;
        const total = a.count;
        setStats({ total, avg: Number(a.avg || 0), active, hidden: total - active });
      } catch { /* stats are best-effort */ }
    })();
    return () => { alive = false; };
  }, [scope, refreshKey]);

  const loadProducts = (rows: Review[]) => {
    const missing = [...new Set(rows.map((r) => r.product_id))].filter((id) => id && !products[id]);
    if (missing.length) fetchByIds<Product>('products', missing).then((l) => setProducts((m) => ({ ...m, ...Object.fromEntries(l.map((x) => [x.id, x])) }))).catch(() => {});
  };

  const toggle = async (r: Review) => {
    try { await patchDoc('reviews', r.id, { status: on(r) ? 'inactive' : 'active' }); toast(on(r) ? 'Review hidden.' : 'Review is visible.'); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const del = async (r: Review) => {
    if (!(await confirm({ title: 'Delete this review?', danger: true }))) return;
    try { await removeDoc('reviews', r.id); toast('Review deleted.'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const columns: Column<Review>[] = [
    {
      key: 'product', header: 'Product', render: (r) => {
        const pr = products[r.product_id];
        return pr ? (
          <Link href={p(`/products/view/${pr.id}`)} className="flex items-center gap-2.5 min-w-[180px] hover:text-primary">
            <img src={imgUrl(thumbOf(pr), tr(pr.name))} className="w-9 h-9 rounded-lg object-cover border border-line" alt="" />
            <span className="font-medium line-clamp-2">{tr(pr.name, uiLang)}</span>
          </Link>
        ) : <span className="text-muted">{r.product_id ? 'Loading…' : 'Deleted product'}</span>;
      },
    },
    { key: 'customer', header: 'Customer', render: (r) => <div className="flex items-center gap-2"><Avatar src={r.user_avatar} name={r.user_name} className="w-8 h-8" /><span className="font-medium">{r.user_name || 'Customer'}</span></div> },
    { key: 'rating', header: 'Rating', sort: 'rating', render: (r) => <Stars value={Number(r.rating) || 0} /> },
    {
      key: 'review', header: 'Review', className: 'max-w-sm', render: (r) => (
        <>
          <p className="text-sm whitespace-normal">{r.comment || '—'}</p>
          {(r.images ?? []).length > 0 && (
            <div className="mt-1.5 flex gap-1.5">
              {(r.images ?? []).map((img) => <a key={img} href={imgUrl(img)} target="_blank" rel="noreferrer"><img src={imgUrl(img)} className="w-9 h-9 rounded object-cover border border-line" alt="" /></a>)}
            </div>
          )}
        </>
      ),
    },
    { key: 'date', header: 'Date', sort: 'created_at', className: 'whitespace-nowrap text-muted', render: (r) => fmtDate(r.created_at) },
    {
      key: 'status', header: 'Status', render: (r) => (
        <button type="button" className={cx('toggle', on(r) && 'toggle-on')} title={on(r) ? 'Hide review' : 'Show review'} onClick={() => toggle(r)} data-testid="toggle-review"><span className="toggle-dot" /></button>
      ),
    },
    { key: 'actions', header: 'Actions', align: 'right', render: (r) => <RowActions onDelete={() => del(r)} /> },
  ];

  return (
    <div>
      <PageHeader title="Product Ratings" subtitle="Moderate customer reviews and ratings" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <StatCard label="Total Reviews" value={stats.total} icon={MessageSquare} color="blue" />
        <StatCard label="Average Rating" value={`${stats.avg.toFixed(1)} ★`} icon={Star} color="orange" />
        <StatCard label="Visible" value={stats.active} icon={Eye} color="green" />
        <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} color="red" />
      </div>
      {!scope ? <Loading /> : (
        <DataTable<Review>
          path="reviews"
          constraints={scope}
          deps={[product, storeId, storeProducts?.length]}
          filters={[
            { key: 'rating', placeholder: 'All Ratings', options: [5, 4, 3, 2, 1].map((i) => ({ value: String(i), label: `${i} Star${i > 1 ? 's' : ''}` })), toConstraints: (v) => [where('rating', '==', Number(v))] },
            { key: 'status', placeholder: 'All Statuses', options: [{ value: 'active', label: 'Visible' }, { value: 'inactive', label: 'Hidden' }] },
          ]}
          filterExtra={(storeId || product) ? (
            <select className="input !w-auto !py-2 min-w-[180px]" value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">{storeId ? 'All my products' : 'All Products'}</option>
              {storeId ? (storeProducts ?? []).map((x) => <option key={x.id} value={x.id}>{tr(x.name, uiLang)}</option>)
                : product && <option value={product}>{tr(products[product]?.name, uiLang) || 'Selected product'}</option>}
            </select>
          ) : undefined}
          columns={columns}
          refreshKey={refreshKey}
          onRows={loadProducts}
          empty="No reviews found."
          testId="reviews-table"
        />
      )}
      {storeId && (storeProducts?.length ?? 0) > 30 && !product && (
        <p className="mt-2 text-xs text-muted">Showing reviews for your first 30 products — pick a product to see the rest.</p>
      )}
    </div>
  );
}
