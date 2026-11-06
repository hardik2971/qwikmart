'use client';

import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import { ArrowRight } from 'lucide-react';
import type { Banner } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { bannerHref, Wrap } from './Sections';

/** HTML slide for banners without real artwork: the title "Line one|Line two" becomes the headline. */
function TextSlide({ b, first }: { b: Banner; first: boolean }) {
  const t = useT();
  const [l1, l2] = (b.title || '').split('|');
  return (
    <div className="relative grid min-h-[260px] items-center gap-6 overflow-hidden bg-primary-50 px-6 py-8 md:min-h-[340px] md:grid-cols-[1.1fr_1fr] md:px-12" style={b.bg ? { background: b.bg } : undefined}>
      <div className="relative z-[1] text-night">
        {b.tag && <span className="inline-flex rounded-full bg-accent-ink px-3 py-1 text-xs font-bold text-white">{b.tag}</span>}
        <h2 className="mt-3 max-w-[16ch] font-display text-3xl font-extrabold leading-[1.05] text-night md:text-5xl">
          {l1}
          {l2 && <span className="block">{l2}</span>}
        </h2>
        {b.subtitle && <p className="mt-3 max-w-md text-sm text-night/75 md:text-base">{b.subtitle}</p>}
        <Wrap href={bannerHref(b)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-night px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-night-2">
          {t('shop_now')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Wrap>
      </div>
      {b.image && (
        <div className="relative hidden aspect-[9/7] w-full max-w-[460px] justify-self-end overflow-hidden rounded-2xl md:block">
          <Image src={b.image} alt={l1 || 'banner'} fill sizes="460px" className="object-cover" priority={first} />
        </div>
      )}
    </div>
  );
}

export default function BannerSlider({ items }: { items: Banner[] }) {
  return (
    <section className="container mt-6">
      <div className="overflow-hidden rounded-hero">
        <Swiper
          modules={[Autoplay, Pagination]}
          autoplay={{ delay: 5000, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          loop={items.length > 1}
          className="w-full"
        >
          {items.map((b, i) => (
            <SwiperSlide key={b.id}>
              {/* Uploaded banner art (1600x600, headline baked in) shows edge to edge; the HTML slide is the fallback
                  for banners without real artwork (no image / placehold.co). */}
              {b.title && (!b.image || b.image.includes('placehold.co')) ? (
                <TextSlide b={b} first={i === 0} />
              ) : (
                <Wrap href={bannerHref(b)} className="relative block aspect-[16/6] w-full bg-primary-50">
                  <Image src={b.image} alt={b.title || 'banner'} fill sizes="(max-width:1320px) 100vw, 1290px" className="object-cover" priority={i === 0} />
                </Wrap>
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
