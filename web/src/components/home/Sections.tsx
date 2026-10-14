'use client';

import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import { ArrowRight, BadgePercent, ChevronLeft, ChevronRight, Leaf, ShieldCheck, ShoppingCart, Truck } from 'lucide-react';
import type { Banner, Brand, Category, HomeSection, Product } from '@/lib/types';
import { useT } from '@/lib/i18n';
import ProductRail from '../product/ProductRail';
import { useDragScroll } from '@/hooks/useDragScroll';

export function bannerHref(b: Pick<Banner, 'link_type' | 'link_value'>) {
  if (!b.link_value) return undefined;
  if (b.link_type === 'product') return `/product/${b.link_value}`;
  if (b.link_type === 'category') return `/category/${b.link_value}`;
  if (b.link_type === 'url') return b.link_value;
  return undefined;
}

function Wrap({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

const FEATURES = [
  { icon: Leaf, a: '100%', b: 'Fresh & Original' },
  { icon: Truck, a: 'Fast', b: 'Delivery at your door' },
  { icon: ShieldCheck, a: 'Best', b: 'Quality Assured' },
  { icon: BadgePercent, a: 'Great Offers', b: 'on Everyday Staples' },
];

function HeroSlide({ b, first }: { b: Banner; first: boolean }) {
  const t = useT();
  const [l1, l2] = (b.title || '').split('|');
  const href = bannerHref(b);
  return (
    <div className="relative overflow-hidden" style={{ background: b.bg || 'var(--header-via)' }}>
      <div className="container grid min-h-[300px] items-center gap-6 py-8 md:min-h-[420px] md:grid-cols-[1.1fr_1fr] lg:min-h-[480px]">
        <div className="relative z-[1] text-[#111827]">
          {b.tag && (
            <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow md:text-sm">
              <ShoppingCart className="h-4 w-4" /> {b.tag}
            </span>
          )}
          <h2 className="mt-4 text-3xl font-extrabold leading-[1.05] tracking-tight text-[#111827] sm:text-4xl md:text-5xl lg:text-6xl">
            {l1}
            {l2 && <span className="block text-primary">{l2}</span>}
          </h2>
          <div className="mt-4 flex items-center gap-1.5">
            <span className="h-[3px] w-24 rounded bg-primary/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
          {b.subtitle && <p className="mt-3 max-w-lg text-sm text-[#344054] md:text-lg">{b.subtitle}</p>}
          {first && (
            <div className="mt-5 hidden gap-x-5 gap-y-3 lg:grid lg:grid-cols-2 xl:grid-cols-4">
              {FEATURES.map(({ icon: Icon, a, b: bb }) => (
                <div key={a} className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="block font-bold text-primary">{a}</span>
                    <span className="block max-w-[110px] text-[#344054]">{bb}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <Wrap
            href={href}
            className="mt-6 inline-flex items-center gap-3 rounded-full bg-primary py-2 pe-2 ps-6 text-base font-bold text-white shadow-lg transition hover:bg-primary-dark"
          >
            {t('shop_now')}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary">
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </span>
          </Wrap>
        </div>
        <div className="relative hidden md:block">
          <div className="relative mx-auto aspect-[9/7] w-full max-w-[560px] overflow-hidden rounded-[28px] shadow-xl ring-8 ring-white/40">
            <Image src={b.image} alt={l1 || 'banner'} fill sizes="560px" className="object-cover" priority={first} />
          </div>
          <div className="absolute -end-2 -top-4 flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 border-dashed border-white/70 bg-[#8DBF4A] text-center font-extrabold leading-none text-[#1f4d10] shadow-lg lg:h-36 lg:w-36">
            <span className="text-xs lg:text-base">UP TO</span>
            <span className="text-3xl lg:text-5xl">40%</span>
            <span className="text-xs lg:text-base">OFF</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BannerSlider({ items }: { items: Banner[] }) {
  return (
    <section className="relative">
      <Swiper
        modules={[Autoplay, Pagination]}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        loop={items.length > 1}
        className="w-full"
      >
        {items.map((b, i) => (
          <SwiperSlide key={b.id}>
            {/* Uploaded banner art (1600x600, headline baked in) shows full-bleed; the HTML hero is the fallback for
                banners without real artwork (no image / placehold.co). */}
            {b.title && (!b.image || b.image.includes('placehold.co')) ? (
              <HeroSlide b={b} first={i === 0} />
            ) : (
              <Wrap href={bannerHref(b)} className="relative block aspect-[16/6] w-full">
                <Image src={b.image} alt={b.title || 'banner'} fill sizes="100vw" className="object-cover" priority={i === 0} />
              </Wrap>
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

export function CategoryGrid({ title, subtitle, items }: { title?: string; subtitle?: string; items: Category[] }) {
  // Always one line: on desktop up to 12 tiles share the width equally; more tiles (and phones) scroll sideways
  // with drag / swipe and arrow buttons.
  const { ref, edges, scrollBy } = useDragScroll<HTMLDivElement>();
  const fits = items.length <= 12;
  return (
    <section className="py-6">
      {title && <h2 className="section-title md:text-3xl">{title}</h2>}
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
              <span className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[#EAF6FB] transition group-hover:-translate-y-0.5 group-hover:shadow-card dark:bg-soft">
                {c.image && <Image src={c.image} alt={c.name} fill sizes="140px" draggable={false} className="pointer-events-none object-cover" />}
              </span>
              <span className="mt-2 line-clamp-2 text-xs font-medium text-ink md:text-sm">{c.name}</span>
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
  const btn = 'absolute top-[38%] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white shadow-card hover:text-primary md:flex';
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
              className="flex h-20 w-36 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-white p-2 transition hover:border-primary hover:shadow-card"
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
      <h2 className="text-2xl font-extrabold md:text-3xl">{title}</h2>
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
