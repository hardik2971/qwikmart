'use client';

import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Banner, Brand, Category, HomeSection, Product } from '@/lib/types';
import ProductRail from '../product/ProductRail';
import { useDragScroll } from '@/hooks/useDragScroll';

export function bannerHref(b: Pick<Banner, 'link_type' | 'link_value'>) {
  if (!b.link_value) return undefined;
  if (b.link_type === 'product') return `/product/${b.link_value}`;
  if (b.link_type === 'category') return `/category/${b.link_value}`;
  if (b.link_type === 'url') return b.link_value;
  return undefined;
}

export function Wrap({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

export function CategoryGrid({ title, subtitle, items }: { title?: string; subtitle?: string; items: Category[] }) {
  // Always one line: on desktop up to 12 tiles share the width equally; more tiles (and phones) scroll sideways
  // with drag / swipe and arrow buttons.
  const { ref, edges, scrollBy } = useDragScroll<HTMLDivElement>();
  const fits = items.length <= 12;
  return (
    <section className="py-6">
      {title && <h2 className="section-title">{title}</h2>}
      {subtitle && <p className="mt-1 text-sm text-body md:text-base">{subtitle}</p>}
      <div className="relative mt-5">
        <div ref={ref} className="no-scrollbar flex cursor-grab select-none gap-3 overflow-x-auto scroll-smooth pb-1">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              draggable={false}
              className={clsx(
                'group flex w-[84px] shrink-0 flex-col items-center text-center sm:w-[104px]',
                fits ? 'lg:w-auto lg:min-w-0 lg:flex-1' : 'lg:w-[118px]',
              )}
            >
              <span className="relative aspect-square w-full overflow-hidden rounded-2xl bg-soft ring-1 ring-line transition group-hover:ring-2 group-hover:ring-primary">
                {c.image && <Image src={c.image} alt={c.name} fill sizes="140px" draggable={false} className="pointer-events-none object-cover" />}
              </span>
              <span className="mt-2 line-clamp-2 text-xs font-semibold text-ink md:text-[13.5px]">{c.name}</span>
            </Link>
          ))}
        </div>
        <ScrollArrows edges={edges} scrollBy={scrollBy} className={fits ? 'lg:hidden' : undefined} />
      </div>
    </section>
  );
}

/** Round prev/next buttons over a drag-scroll row (desktop/tablet only; phones swipe). */
function ScrollArrows({ edges, scrollBy, className }: { edges: { left: boolean; right: boolean }; scrollBy: (d: 1 | -1) => void; className?: string }) {
  const btn = 'absolute top-[38%] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-card ring-1 ring-line hover:bg-night hover:text-white md:flex';
  return (
    <div className={className}>
      {edges.left && (
        <button type="button" aria-label="Previous" onClick={() => scrollBy(-1)} className={clsx(btn, '-left-3')}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Next" onClick={() => scrollBy(1)} className={clsx(btn, '-right-3')}>
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}
    </div>
  );
}

export function TopBrands({ title, items }: { title?: string; items: Brand[] }) {
  // Drag with the mouse (or swipe on touch) to scroll; arrows appear when there is more to see.
  const { ref, edges, scrollBy } = useDragScroll<HTMLDivElement>();
  return (
    <section className="py-6">
      {title && <h2 className="section-title mb-4">{title}</h2>}
      <div className="relative">
        <div ref={ref} className="no-scrollbar flex cursor-grab select-none gap-3 overflow-x-auto scroll-smooth pb-1">
          {items.map((b) => (
            <Link
              key={b.id}
              href={`/products?brand=${b.id}`}
              draggable={false}
              className="flex h-20 w-36 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-white p-3 transition hover:border-primary"
            >
              {b.logo ? (
                <Image src={b.logo} alt={b.name} width={140} height={70} draggable={false} className="pointer-events-none h-full w-auto object-contain" />
              ) : (
                <span className="font-bold text-ink">{b.name}</span>
              )}
            </Link>
          ))}
        </div>
        <ScrollArrows edges={edges} scrollBy={scrollBy} />
      </div>
    </section>
  );
}

export function GridBanner({ items }: { items: Banner[] }) {
  // Columns follow the banner count: 1 → full width, 2 → 50% each, 3+ → three per row.
  const cols = items.length <= 1 ? '' : items.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  const sizes = items.length <= 1 ? '100vw' : items.length === 2 ? '(max-width:640px) 100vw, 50vw' : '(max-width:768px) 100vw, 33vw';
  return (
    <section className={clsx('grid gap-3 py-5', cols)}>
      {items.map((b) => (
        <Wrap key={b.id} href={bannerHref(b)} className="relative block aspect-[40/21] overflow-hidden rounded-card transition hover:shadow-card">
          <Image src={b.image} alt={b.title || 'offer'} fill sizes={sizes} className="object-cover" />
        </Wrap>
      ))}
    </section>
  );
}

export function TitleImage({ items }: { items: Banner[] }) {
  const b = items[0];
  if (!b) return null;
  return (
    <section className="py-5">
      <Wrap href={bannerHref(b)} className="relative block aspect-[16/5] overflow-hidden rounded-2xl md:aspect-[16/3.6]">
        <Image src={b.image} alt={b.title || ''} fill sizes="100vw" className="object-cover" />
      </Wrap>
    </section>
  );
}

export function HeadingText({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <section className="py-10 text-center">
      <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em] md:text-[34px]">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-muted md:text-base">{subtitle}</p>}
    </section>
  );
}

export function SectionRenderer({ section }: { section: HomeSection }) {
  switch (section.type) {
    case 'banner_slider':
      return null; // rendered full-bleed by HomeView
    case 'category_section':
      return <CategoryGrid title={section.title} subtitle={section.subtitle} items={section.items as Category[]} />;
    case 'product_slider': {
      const slug = section.settings?.category_slug as string | undefined;
      return (
        <ProductRail
          title={section.title}
          subtitle={section.subtitle}
          products={section.items as Product[]}
          seeAllHref={slug ? `/category/${slug}` : '/products'}
        />
      );
    }
    case 'top_brands':
      return <TopBrands title={section.title} items={section.items as Brand[]} />;
    case 'grid_banner':
      return <GridBanner items={section.items as Banner[]} />;
    case 'title_image':
      return <TitleImage items={section.items as Banner[]} />;
    case 'heading_text':
      return <HeadingText title={section.title} subtitle={section.subtitle} />;
    default:
      return null;
  }
}
