'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Clock3,
  Expand,
  Heart,
  PackageX,
  RotateCcw,
  Share2,
  ShoppingCart,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { discountPercent, effectivePrice, etaLabel, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { Id, ProductDetail, Variant } from '@/lib/types';
import { useCartLine, useCtxKey, useCurrency, useToggleFavorite } from '@/hooks';
import { Breadcrumbs, EmptyState, Modal, Stars } from '@/components/ui';
import { QtyStepper } from '@/components/product/ProductCard';
import ProductRail from '@/components/product/ProductRail';

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const src = images[idx] || images[0];
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      <div className="no-scrollbar flex gap-2 overflow-x-auto md:flex-col">
        {images.map((im, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={clsx('relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-soft', i === idx ? 'border-primary' : 'border-line')}
          >
            <Image src={im} alt="" fill sizes="64px" className="object-cover" />
          </button>
        ))}
      </div>
      <div
        className="relative aspect-square flex-1 cursor-zoom-in overflow-hidden rounded-card border border-line bg-soft"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
        onClick={() => setFull(true)}
      >
        <Image
          src={src}
          alt={name}
          fill
          priority
          sizes="(max-width:768px) 100vw, 560px"
          className="object-cover transition-transform duration-100"
          style={zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
        <span className="absolute bottom-3 start-3 rounded-full bg-surface/90 p-2 shadow">
          <Expand className="h-4 w-4" />
        </span>
      </div>
      <Modal open={full} onClose={() => setFull(false)} size="lg" title={name}>
        <div className="relative aspect-square w-full">
          <Image src={src} alt={name} fill sizes="800px" className="object-contain" />
        </div>
      </Modal>
    </div>
  );
}

function RatingSummary({ p }: { p: ProductDetail }) {
  const total = Object.values(p.rating_breakdown).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <div className="rounded-card border border-line p-5">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-extrabold text-ink">{p.rating_avg.toFixed(1)}</span>
          <Star className="mb-2 h-6 w-6 fill-amber-400 text-amber-400" />
        </div>
        <Stars value={p.rating_avg} size={16} />
        <div className="mt-1 text-sm text-muted">{p.rating_count} Ratings &amp; Reviews</div>
        <div className="mt-4 space-y-2">
          {(['5', '4', '3', '2', '1'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-ink">{k}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.rating_breakdown[k] / total) * 100}%` }} />
              </span>
              <span className="w-8 text-end text-muted">{p.rating_breakdown[k]}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Customers Feedback</h3>
        {p.reviews.length === 0 && <p className="text-sm text-muted">No reviews yet. Be the first to review after your purchase!</p>}
        <div className="divide-y divide-line">
          {p.reviews.map((r) => (
            <div key={r.id} className="flex gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary">{r.user.name[0]}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink">{r.user.name}</div>
                    <div className="text-xs text-muted">{formatDate(r.created_at)}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-white">
                    {r.rating.toFixed(1)} <Star className="h-3 w-3 fill-white" />
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{r.comment}</p>
                {r.images?.some((im) => /^https?:\/\//.test(im)) && (
                  <div className="mt-2 flex flex-wrap gap-2" data-testid="review-images">
                    {r.images
                      .filter((im) => /^https?:\/\//.test(im))
                      .slice(0, 5)
                      .map((im) => (
                        <a key={im} href={im} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line bg-soft">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={im} alt="Review photo" className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useT();
  const ctx = useCtxKey();
  const router = useRouter();
  const { fmt } = useCurrency();
  const toggleFav = useToggleFavorite();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['product', slug, ...ctx], queryFn: () => api.product(slug) });
  const [variantId, setVariantId] = useState<Id | null>(null);
  const [tab, setTab] = useState<'desc' | 'reviews'>('desc');
  const p = q.data;
  const variant: Variant | undefined = useMemo(
    () => p?.variants.find((v) => v.id === variantId) || p?.variants.find((v) => v.stock > 0) || p?.variants[0],
    [p, variantId],
  );
  const cart = useCartLine(variant?.id, p?.id);

  if (q.isLoading)
    return (
      <div className="container grid gap-8 py-8 md:grid-cols-2">
        <div className="skeleton aspect-square" />
        <div className="space-y-4">
          <div className="skeleton h-8 w-3/4" />
          <div className="skeleton h-6 w-1/3" />
          <div className="skeleton h-24" />
          <div className="skeleton h-12 w-1/2" />
        </div>
      </div>
    );
  if (!p || !variant)
    return (
      <EmptyState
        icon={<PackageX className="h-9 w-9" />}
        title="Product not found"
        subtitle="It may have been removed or is unavailable in your area."
        action={<Link href="/" className="btn-primary">Go home</Link>}
      />
    );

  const off = discountPercent(variant);
  const outOfStock = variant.stock <= 0;
  const images = variant.image && !p.images.includes(variant.image) ? [variant.image, ...p.images] : p.images;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const buyNow = async () => {
    if (!cart.qty) {
      await api.addToCart(variant.id, 1, p.id).catch(() => null);
      await qc.invalidateQueries({ queryKey: ['cart'] });
    }
    router.push('/checkout');
  };

  // group variant attributes for selectors (e.g. Color / Size)
  const attrNames = Array.from(new Set(p.variants.flatMap((v) => v.attributes?.map((a) => a.attribute) || [])));

  return (
    <div className="container py-5">
      <Breadcrumbs
        items={[
          ...(p.category ? [{ label: p.category.name, href: `/category/${p.category.slug}` }] : []),
          { label: p.name },
        ]}
      />
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <Gallery images={images} name={p.name} />
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">{p.name}</h1>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => toggleFav(p)} className="rounded-full border border-line p-2 hover:bg-soft" aria-label="Favourite">
                <Heart className={clsx('h-5 w-5', p.is_favorite ? 'fill-danger text-danger' : 'text-muted')} />
              </button>
              <button onClick={share} className="rounded-full border border-line p-2 hover:bg-soft" aria-label="Share">
                <Share2 className="h-5 w-5 text-muted" />
              </button>
            </div>
          </div>
          {p.brand && (
            <div className="mt-1 text-sm text-muted">
              Brand: <Link href={`/products?brand=${p.brand.id}`} className="font-semibold text-primary">{p.brand.name}</Link>
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-bold text-white">
              {p.rating_avg.toFixed(1)} <Star className="h-3.5 w-3.5 fill-white" />
            </span>
            <button onClick={() => setTab('reviews')} className="text-muted hover:text-primary">
              {p.rating_count} Ratings
            </button>
            <span className="inline-flex items-center gap-1 text-muted">
              <Clock3 className="h-4 w-4" /> {etaLabel(p.delivery_minutes)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-extrabold text-ink">{fmt(effectivePrice(variant))}</span>
            {off > 0 && (
              <>
                <span className="text-lg text-muted line-through">{fmt(variant.price)}</span>
                <span className="rounded-md bg-primary-50 px-2 py-0.5 text-sm font-bold text-primary">{off}% OFF</span>
              </>
            )}
          </div>
          <div className="text-xs text-muted">(Inclusive of all taxes)</div>
          {p.short_description && <p className="mt-3 text-sm">{p.short_description}</p>}

          {attrNames.length > 0 && attrNames[0] !== 'Pack Size' ? (
            attrNames.map((an) => {
              const values = Array.from(new Set(p.variants.map((v) => v.attributes?.find((a) => a.attribute === an)?.value).filter(Boolean))) as string[];
              const cur = variant.attributes?.find((a) => a.attribute === an)?.value;
              return (
                <div key={an} className="mt-5">
                  <div className="mb-2 text-sm font-semibold text-ink">
                    {an}: <span className="font-normal text-muted">{cur}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => {
                      const match =
                        p.variants.find(
                          (v) =>
                            v.attributes?.some((a) => a.attribute === an && a.value === val) &&
                            (variant.attributes || []).filter((a) => a.attribute !== an).every((o) => v.attributes?.some((a) => a.attribute === o.attribute && a.value === o.value)),
                        ) || p.variants.find((v) => v.attributes?.some((a) => a.attribute === an && a.value === val));
                      const hex = match?.attributes?.find((a) => a.attribute === an)?.color_hex;
                      return (
                        <button
                          key={val}
                          onClick={() => match && setVariantId(match.id)}
                          className={clsx('chip', cur === val && 'chip-active', match && match.stock <= 0 && 'opacity-50')}
                        >
                          {hex && <span className="h-4 w-4 rounded-full border border-line" style={{ background: hex }} />}
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : p.variants.length > 1 ? (
            <div className="mt-5">
              <div className="mb-2 text-sm font-semibold text-ink">Pack Size</div>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className={clsx('rounded-btn border px-3 py-2 text-start text-sm', v.id === variant.id ? 'border-primary bg-primary-50' : 'border-line hover:border-primary')}
                  >
                    <div className="font-semibold text-ink">{v.name}</div>
                    <div className="text-xs">
                      <span className="font-bold text-ink">{fmt(effectivePrice(v))}</span>{' '}
                      {discountPercent(v) > 0 && <span className="text-muted line-through">{fmt(v.price)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted">Pack size: <span className="font-semibold text-ink">{variant.name}</span></div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {outOfStock ? (
              <span className="btn border border-line text-muted">{t('out_of_stock')}</span>
            ) : cart.qty > 0 ? (
              <QtyStepper qty={cart.qty} onInc={cart.inc} onDec={cart.dec} size="md" busy={cart.busy} max={cart.max} />
            ) : (
              <button onClick={() => cart.add(1)} className="btn-outline h-11 min-w-[160px]">
                <ShoppingCart className="h-4 w-4" /> {t('add_to_cart')}
              </button>
            )}
            <button onClick={buyNow} disabled={outOfStock} className="btn-primary h-11 min-w-[160px]">
              {t('buy_now')}
            </button>
          </div>
          {variant.stock > 0 && variant.stock < 10 && <div className="mt-2 text-xs font-semibold text-warning">Only {variant.stock} left in stock</div>}

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { icon: BadgeCheck, label: 'Assured Quality' },
              { icon: RotateCcw, label: p.return_allowed ? `${p.return_days} days easy return` : 'Non-returnable' },
              { icon: p.cod_allowed ? Wallet : Truck, label: p.cod_allowed ? 'Pay on Delivery' : 'Fast Delivery' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 rounded-btn border border-line p-3 text-center text-xs font-medium text-ink">
                <Icon className="h-5 w-5 text-primary" /> {label}
              </div>
            ))}
          </div>

          <dl className="mt-6 space-y-1.5 text-sm">
            {p.category && (
              <div className="flex gap-2"><dt className="font-semibold text-ink">Category:</dt><dd><Link href={`/category/${p.category.slug}`} className="text-primary">{p.category.name}</Link></dd></div>
            )}
            {p.store && <div className="flex gap-2"><dt className="font-semibold text-ink">Sold by:</dt><dd>{p.store.name}</dd></div>}
            {p.manufacturer && <div className="flex gap-2"><dt className="font-semibold text-ink">Manufacturer:</dt><dd>{p.manufacturer}</dd></div>}
            {variant.sku && <div className="flex gap-2"><dt className="font-semibold text-ink">SKU:</dt><dd>{variant.sku}</dd></div>}
          </dl>
        </div>
      </div>

      <div className="card mt-10 p-5">
        <div className="mb-5 flex gap-6 border-b border-line">
          {[
            ['desc', t('description')],
            ['reviews', `${t('ratings_reviews')} (${p.rating_count})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as 'desc' | 'reviews')}
              className={clsx('-mb-px border-b-2 pb-3 text-sm font-semibold', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'desc' ? <div className="prose-sb text-sm" dangerouslySetInnerHTML={{ __html: p.description }} /> : <RatingSummary p={p} />}
      </div>

      {p.similar.length > 0 && <ProductRail title={t('similar_products')} products={p.similar} />}
      {p.cross_sell.length > 0 && <ProductRail title={t('you_may_like')} products={p.cross_sell} />}
      {p.up_sell.length > 0 && <ProductRail title="Upgrade Your Pick" products={p.up_sell} />}
    </div>
  );
}
