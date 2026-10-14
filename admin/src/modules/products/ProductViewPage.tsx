'use client';
// Product Details — port of admin/products/show.blade.php.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Layers, Link2, Package, Pencil, Search, Star } from 'lucide-react';
import { fetchByIds, fetchList, orderBy, limit, where, useBrands, useCategories, useDocQ, useInvalidate, useStores, useTaxes } from '@/lib/firestore';
import { imgUrl, money, tr, statusLabel } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Product, Review, StoreStock } from '@/lib/types';
import { Card, Loading, PageHeader, StatusPill } from '@/components/ui';
import { RelationsModal, Stars, thumbOf, variantOn } from './shared';

export default function ProductViewPage() {
  const { id } = useParams<{ id: string }>();
  const { p, storeId, uiLang } = usePanel();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { data: product, isLoading } = useDocQ<Product>('products', id);
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: taxes = [] } = useTaxes();
  const { data: stores = [] } = useStores();
  const [img, setImg] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<{ cross: Product[]; up: Product[] }>({ cross: [], up: [] });
  const [storeStock, setStoreStock] = useState<Record<string, StoreStock>>({});
  const [relOpen, setRelOpen] = useState(false);

  const gallery = useMemo(() => [...new Set([product?.thumbnail, ...(product?.images ?? [])].filter(Boolean) as string[])], [product]);
  useEffect(() => { setImg(gallery[0] || ''); }, [gallery.join('|')]);

  useEffect(() => {
    if (!product) return;
    fetchList<Review>('reviews', where('product_id', '==', product.id), orderBy('created_at', 'desc'), limit(5)).then(setReviews).catch(() => setReviews([]));
    Promise.all([fetchByIds<Product>('products', product.cross_sell_ids ?? []), fetchByIds<Product>('products', product.up_sell_ids ?? [])])
      .then(([cross, up]) => setRelated({ cross, up })).catch(() => setRelated({ cross: [], up: [] }));
    if (storeId) {
      fetchByIds<StoreStock>('store_stocks', (product.variants ?? []).map((v) => `${storeId}_${v.id}`))
        .then((list) => setStoreStock(Object.fromEntries(list.map((s) => [s.variant_id, s])))).catch(() => setStoreStock({}));
    }
  }, [product?.id, product?.updated_at, storeId]);

  if (isLoading) return <Loading />;
  if (!product || (storeId && product.store_id && product.store_id !== storeId)) {
    return <div className="card p-10 text-center text-muted">Product not found. <Link href={p('/products')} className="text-primary font-semibold">Back to products</Link></div>;
  }

  const editable = can('product.update') && (!storeId || product.store_id === storeId);
  const cat = (cid?: string | null) => (cid ? tr(categories.find((c) => c.id === cid)?.name, uiLang) : '');
  const tax = taxes.find((t) => t.id === product.tax_id);
  const overview: [string, React.ReactNode][] = [
    ['Category', [cat(product.category_id) || '-', cat(product.sub_category_id)].filter(Boolean).join(' › ')],
    ['Brand', brands.find((b) => b.id === product.brand_id)?.name || product.brand_name || '-'],
    ['Type', product.product_type === 'variable' ? 'Variable' : 'Simple'],
    ['Fulfillment', statusLabel(product.fulfillment_type)],
    ['Tax', tax ? `${tax.name} (${Number(tax.percent)}%)` : product.tax_percent ? `${product.tax_percent}%` : '-'],
    ['Food Type', product.is_veg == null ? '-' : product.is_veg ? 'Veg' : 'Non-Veg'],
    ['Store', product.store_id ? stores.find((s) => s.id === product.store_id)?.name || 'Store' : 'Global catalog'],
    ['Max Qty / Order', product.max_qty_per_order ?? '-'],
    ['Returns', product.return_allowed ? `Within ${product.return_days ?? 0} days` : 'Not returnable'],
    ['Cancelable', product.cancelable ? 'Yes' : 'No'],
    ['COD', product.cod_allowed ? 'Allowed' : 'Not allowed'],
    ['Featured', product.is_featured ? 'Yes' : 'No'],
    ['Slug', product.slug],
    ['Tags', (product.tags ?? []).join(', ') || '-'],
  ];
  const short = tr(product.short_description, uiLang);
  const desc = tr(product.description, uiLang);

  return (
    <div>
      <PageHeader title="Product Details" subtitle={tr(product.name, uiLang)} back={p('/products')}>
        <button type="button" className="btn-outline" onClick={() => setRelOpen(true)}><Link2 className="w-4 h-4" /> Recommendations</button>
        {editable && <Link href={p(`/products/edit/${product.id}`)} className="btn-primary" data-testid="edit-product"><Pencil className="w-4 h-4" /> Edit</Link>}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <div className="aspect-square rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
              <img src={imgUrl(img, tr(product.name))} className="w-full h-full object-contain p-3" alt="" />
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gallery.map((g) => (
                  <button key={g} type="button" onClick={() => setImg(g)} className="w-14 h-14 rounded-lg border border-line overflow-hidden"><img src={imgUrl(g)} className="w-full h-full object-cover" alt="" /></button>
                ))}
              </div>
            )}
          </Card>
          <Card title="Rating" icon={Star}>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-navy dark:text-white">{Number(product.rating_avg || 0).toFixed(1)}</span>
              <div>
                <Stars value={Number(product.rating_avg || 0)} className="w-4 h-4" />
                <p className="text-xs text-muted">{product.rating_count ?? 0} approved ratings</p>
              </div>
            </div>
            {reviews.map((r) => (
              <div key={r.id} className="mt-3 pt-3 border-t border-line dark:border-dark-line text-sm">
                <p className="font-medium text-navy dark:text-white">{r.user_name || 'Customer'} <span className="text-amber-500">· {r.rating}★</span></p>
                <p className="text-muted text-xs">{(r.comment || '').slice(0, 120)}{(r.comment || '').length > 120 ? '…' : ''}</p>
              </div>
            ))}
            {reviews.length > 0 && <Link href={p(`/reviews?product=${product.id}`)} className="mt-3 inline-block text-xs font-semibold text-primary">All ratings →</Link>}
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Card title="Overview" icon={Package} actions={<StatusPill status={product.status} />}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
              {overview.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line dark:border-dark-line pb-2">
                  <dt className="text-muted">{k}</dt><dd className="font-medium text-navy dark:text-white text-right break-all">{v}</dd>
                </div>
              ))}
            </dl>
            {short && <p className="mt-4 text-sm text-bodytext dark:text-slate-300">{short}</p>}
            {desc && <div className="mt-3 prose prose-sm max-w-none text-sm dark:text-slate-300" dangerouslySetInnerHTML={{ __html: desc }} />}
          </Card>

          <Card title="Variants" icon={Layers} padding={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Image</th><th>Name</th><th>SKU</th><th>MRP</th><th>Sale Price</th><th>{storeId ? 'Store Stock' : 'Stock'}</th><th>Weight</th><th>Status</th></tr></thead>
                <tbody>
                  {(product.variants ?? []).length ? (product.variants ?? []).map((v) => {
                    const stock = storeId ? (storeStock[v.id]?.stock ?? v.stock ?? 0) : (v.stock ?? 0);
                    return (
                      <tr key={v.id}>
                        <td>{v.image ? <img src={imgUrl(v.image)} className="w-9 h-9 rounded-lg object-cover border border-line" alt="" /> : <img src={imgUrl(thumbOf(product), tr(product.name))} className="w-9 h-9 rounded-lg object-cover border border-line opacity-60" alt="" />}</td>
                        <td className="font-medium">{v.name}</td>
                        <td>{v.sku || '-'}</td>
                        <td>{money(v.price)}</td>
                        <td>{v.sale_price != null ? money(v.sale_price) : '-'}</td>
                        <td className={stock <= 0 ? 'text-red-500 font-semibold' : stock <= (v.low_stock_alert ?? 5) ? 'text-amber-600 font-semibold' : ''}>{stock}</td>
                        <td>{v.weight || '-'}</td>
                        <td><StatusPill status={variantOn(v)} /></td>
                      </tr>
                    );
                  }) : <tr><td colSpan={8} className="text-center text-muted !py-8">No variants.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="SEO" icon={Search}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted text-xs">Meta Title</dt><dd className="text-navy dark:text-white">{tr(product.seo?.title, uiLang) || '-'}</dd></div>
              <div><dt className="text-muted text-xs">Meta Description</dt><dd className="text-navy dark:text-white">{tr(product.seo?.description, uiLang) || '-'}</dd></div>
              <div><dt className="text-muted text-xs">Meta Keywords</dt><dd className="text-navy dark:text-white">{tr(product.seo?.keywords, uiLang) || '-'}</dd></div>
            </dl>
          </Card>

          <Card title="Recommendations" icon={Link2}>
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              {([['Cross-sell', related.cross], ['Upsell', related.up]] as const).map(([label, list]) => (
                <div key={label}>
                  <p className="font-semibold text-navy dark:text-white mb-2">{label} <span className="text-muted font-normal">({list.length})</span></p>
                  {list.length ? list.map((rp) => (
                    <Link key={rp.id} href={p(`/products/view/${rp.id}`)} className="flex items-center gap-2 py-1 hover:text-primary">
                      <img src={imgUrl(thumbOf(rp), tr(rp.name))} className="w-7 h-7 rounded object-cover border border-line" alt="" />{tr(rp.name, uiLang)}
                    </Link>
                  )) : <p className="text-xs text-muted">None</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <RelationsModal product={relOpen ? product : null} editable={editable} onClose={() => setRelOpen(false)} onSaved={() => invalidate('doc', 'products', product.id)} />
    </div>
  );
}
