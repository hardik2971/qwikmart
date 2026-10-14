'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronDown, Clock3, Heart, Minus, Plus } from 'lucide-react';
import type { Id, Product } from '@/lib/types';
import { discountPercent, effectivePrice, etaLabel } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useCartLine, useCurrency, useToggleFavorite } from '@/hooks';

export function QtyStepper({
  qty,
  onInc,
  onDec,
  size = 'sm',
  busy,
  max,
}: {
  qty: number;
  onInc: () => void;
  onDec: () => void;
  size?: 'sm' | 'md';
  busy?: boolean;
  /** Upper bound (max_qty_per_order / stock); the + button is disabled at the limit. */
  max?: number;
}) {
  const atMax = max !== undefined && max > 0 && qty >= max;
  return (
    <div
      className={clsx(
        'inline-flex items-center justify-between rounded-lg bg-primary font-bold text-white',
        size === 'sm' ? 'h-8 min-w-[76px] text-sm' : 'h-11 min-w-[120px] text-base',
        busy && 'opacity-80',
      )}
    >
      <button onClick={onDec} className="flex h-full items-center px-2 hover:bg-black/10" aria-label="Decrease">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="px-1 tabular-nums">{qty}</span>
      <button
        onClick={onInc}
        disabled={atMax}
        title={atMax ? `Maximum ${max} per order` : undefined}
        className="flex h-full items-center px-2 hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AddButton({ variantId, productId, outOfStock, size = 'sm' }: { variantId: Id; productId: Id; outOfStock?: boolean; size?: 'sm' | 'md' }) {
  const t = useT();
  const { qty, inc, dec, busy, max } = useCartLine(variantId, productId);
  if (outOfStock)
    return (
      <span className={clsx('inline-flex items-center rounded-lg border border-line px-2 text-[11px] font-semibold text-muted', size === 'sm' ? 'h-8' : 'h-11')}>
        {t('out_of_stock')}
      </span>
    );
  if (qty > 0) return <QtyStepper qty={qty} onInc={inc} onDec={dec} size={size} busy={busy} max={max} />;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        inc();
      }}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg border border-primary bg-surface font-bold text-primary shadow-soft transition hover:bg-primary-50',
        size === 'sm' ? 'h-8 min-w-[76px] text-sm' : 'h-11 min-w-[120px]',
      )}
    >
      {t('add')}
    </button>
  );
}

export default function ProductCard({ product, className, layout = 'grid' }: { product: Product; className?: string; layout?: 'grid' | 'list' }) {
  const t = useT();
  const { fmt } = useCurrency();
  const toggleFav = useToggleFavorite();
  // start on the first in-stock variant (the API's default_variant), not blindly on index 0
  const [vIdx, setVIdx] = useState(() => Math.max(0, product.variants.findIndex((x) => x.stock > 0)));
  const [menu, setMenu] = useState(false);
  const v = product.variants[vIdx] || product.variants[0];
  if (!v) return null;
  const off = discountPercent(v);
  const href = `/product/${product.slug}`;

  if (layout === 'list') {
    return (
      <div className={clsx('group relative flex gap-3 overflow-hidden rounded-card border border-line bg-surface p-3 transition hover:shadow-card', className)}>
        {off > 0 && (
          <div className="pointer-events-none absolute -start-[34px] top-[14px] z-10 w-[120px] -rotate-45 bg-primary py-[3px] text-center text-[10px] font-extrabold uppercase leading-tight text-white shadow rtl:rotate-45">
            {off}% {t('off')}
          </div>
        )}
        <Link href={href} className="relative block h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-soft">
          <Image src={v.image || product.thumbnail} alt={product.name} fill sizes="112px" className="object-cover transition duration-300 group-hover:scale-105" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-1">
            <Link href={href} className="line-clamp-1 flex-1 text-[15px] font-bold leading-5 text-ink hover:text-primary">
              {product.name}
            </Link>
            <button onClick={() => toggleFav(product)} className="-me-1 -mt-1 rounded-full p-1 hover:bg-soft" aria-label="Favourite">
              <Heart className={clsx('h-4 w-4', product.is_favorite ? 'fill-danger text-danger' : 'text-muted')} />
            </button>
          </div>
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded bg-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-body">
            <Clock3 className="h-3 w-3" /> {etaLabel(product.delivery_minutes)}
          </span>
          {product.variants.length > 1 ? (
            <div className="relative mt-1">
              <button onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-ink">
                {v.name} <ChevronDown className="h-3 w-3" />
              </button>
              {menu && (
                <div className="absolute start-0 top-5 z-20 w-40 rounded-lg border border-line bg-surface p-1 shadow-pop">
                  {product.variants.map((vv, i) => (
                    <button
                      key={vv.id}
                      onClick={() => {
                        setVIdx(i);
                        setMenu(false);
                      }}
                      className={clsx('flex w-full justify-between rounded px-2 py-1.5 text-start text-xs hover:bg-soft', i === vIdx && 'bg-primary-50 text-primary')}
                    >
                      <span className="truncate">{vv.name}</span>
                      <span className="font-semibold">{fmt(effectivePrice(vv))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="mt-1 text-xs text-muted">{v.name}</span>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <div className="flex items-baseline gap-2 leading-tight">
              <span className="text-lg font-extrabold text-ink">{fmt(effectivePrice(v))}</span>
              {off > 0 && <span className="text-xs text-muted line-through">{fmt(v.price)}</span>}
            </div>
            <AddButton variantId={v.id} productId={product.id} outOfStock={v.stock <= 0} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface p-2.5 transition hover:shadow-card', className)}>
      {off > 0 && (
        <div className="pointer-events-none absolute -start-[34px] top-[14px] z-10 w-[120px] -rotate-45 bg-primary py-[3px] text-center text-[10px] font-extrabold uppercase leading-tight text-white shadow rtl:rotate-45">
          {off}% {t('off')}
        </div>
      )}
      <button
        onClick={() => toggleFav(product)}
        className="absolute end-2 top-2 z-10 rounded-full bg-surface/90 p-1.5 shadow-soft"
        aria-label="Favourite"
      >
        <Heart className={clsx('h-4 w-4', product.is_favorite ? 'fill-danger text-danger' : 'text-muted')} />
      </button>
      <Link href={href} className="relative block aspect-square overflow-hidden rounded-lg bg-soft">
        <Image
          src={v.image || product.thumbnail}
          alt={product.name}
          fill
          sizes="(max-width:768px) 50vw, 220px"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        {product.is_veg != null && (
          <span className={clsx('absolute bottom-1.5 start-1.5 flex h-4 w-4 items-center justify-center rounded-sm border-2 bg-white', product.is_veg ? 'border-green-600' : 'border-red-600')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', product.is_veg ? 'bg-green-600' : 'bg-red-600')} />
          </span>
        )}
      </Link>
      <div className="mt-2 flex flex-1 flex-col">
        <span className="inline-flex w-fit items-center gap-1 rounded bg-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-body">
          <Clock3 className="h-3 w-3" /> {etaLabel(product.delivery_minutes)}
        </span>
        <Link href={href} className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-5 text-ink hover:text-primary">
          {product.name}
        </Link>
        <div className="relative mt-0.5">
          {product.variants.length > 1 ? (
            <button onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-ink">
              {v.name} <ChevronDown className="h-3 w-3" />
            </button>
          ) : (
            <span className="text-xs text-muted">{v.name}</span>
          )}
          {menu && (
            <div className="absolute start-0 top-5 z-20 w-40 rounded-lg border border-line bg-surface p-1 shadow-pop">
              {product.variants.map((vv, i) => (
                <button
                  key={vv.id}
                  onClick={() => {
                    setVIdx(i);
                    setMenu(false);
                  }}
                  className={clsx('flex w-full justify-between rounded px-2 py-1.5 text-start text-xs hover:bg-soft', i === vIdx && 'bg-primary-50 text-primary')}
                >
                  <span className="truncate">{vv.name}</span>
                  <span className="font-semibold">{fmt(effectivePrice(vv))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-1 pt-2">
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-ink">{fmt(effectivePrice(v))}</div>
            {off > 0 && <div className="text-[11px] text-muted line-through">{fmt(v.price)}</div>}
          </div>
          <AddButton variantId={v.id} productId={product.id} outOfStock={v.stock <= 0} />
        </div>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-2.5">
      <div className="skeleton aspect-square w-full" />
      <div className="skeleton mt-3 h-3 w-12" />
      <div className="skeleton mt-2 h-4 w-full" />
      <div className="skeleton mt-1 h-4 w-2/3" />
      <div className="mt-3 flex justify-between">
        <div className="skeleton h-5 w-12" />
        <div className="skeleton h-8 w-16" />
      </div>
    </div>
  );
}
