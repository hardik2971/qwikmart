'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Product } from '@/lib/types';
import { useT } from '@/lib/i18n';
import ProductCard, { ProductCardSkeleton } from './ProductCard';

/** Horizontal product slider (native scroll-snap + arrow buttons). */
export default function ProductRail({
  title,
  subtitle,
  products,
  seeAllHref,
  loading,
}: {
  title?: string;
  subtitle?: string;
  products: Product[];
  seeAllHref?: string;
  loading?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = document.documentElement.dir === 'rtl' ? -1 : 1;
    el.scrollBy({ left: dir * rtl * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className="py-5">
      {(title || seeAllHref) && (
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {seeAllHref && (
              <Link href={seeAllHref} className="text-sm font-semibold text-primary hover:underline">
                {t('see_all')}
              </Link>
            )}
            <button onClick={() => scroll(-1)} className="hidden rounded-full border border-line bg-surface p-1.5 hover:bg-soft md:block" aria-label="Previous">
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button onClick={() => scroll(1)} className="hidden rounded-full border border-line bg-surface p-1.5 hover:bg-soft md:block" aria-label="Next">
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}
      <div ref={ref} className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[46%] shrink-0 sm:w-[30%] md:w-[200px]">
                <ProductCardSkeleton />
              </div>
            ))
          : products.map((p) => (
              <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] md:w-[200px]">
                <ProductCard product={p} className="h-full" />
              </div>
            ))}
      </div>
    </section>
  );
}

export function ProductGrid({ products, loading, cols = 'lg:grid-cols-5' }: { products: Product[]; loading?: boolean; cols?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 ${cols}`}>
      {loading
        ? Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)
        : products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
