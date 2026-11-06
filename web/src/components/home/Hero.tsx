'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, MapPin } from 'lucide-react';
import type { Category } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useMounted } from '@/hooks';
import { useLocationStore, useUiStore } from '@/store';
import SearchBar from '../layout/SearchBar';
import { SpeedLines } from '../ui';

/** Tilted mosaic of the store's own category photography (desktop/tablet only). */
function Mosaic({ categories }: { categories: Category[] }) {
  const tiles = categories.filter((c) => c.image).slice(0, 9);
  if (tiles.length < 3) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 hidden w-[46%] md:block">
      <div className="absolute -end-10 -top-16 grid w-[560px] rotate-[-8deg] grid-cols-3 gap-3 lg:-end-4">
        {tiles.map((c, i) => (
          <div
            key={c.id}
            className="relative aspect-square overflow-hidden rounded-2xl bg-night-2 ring-1 ring-white/10"
            style={{ transform: i % 3 === 1 ? 'translateY(36px)' : undefined }}
          >
            <Image src={c.image!} alt="" fill sizes="180px" className="object-cover" />
          </div>
        ))}
      </div>
      {/* fade the mosaic into the panel so the headline column stays calm */}
      <div className="absolute inset-0 bg-gradient-to-r from-night via-night/40 to-transparent rtl:bg-gradient-to-l" />
    </div>
  );
}

export default function Hero({ categories }: { categories: Category[] }) {
  const t = useT();
  const mounted = useMounted();
  const loc = useLocationStore();
  const mode = useUiStore((s) => s.mode);
  const openLocation = useUiStore((s) => s.openLocationModal);
  const chosen = mounted && loc.chosen;
  const mins = loc.deliveryMinutes || loc.zone?.delivery_time_minutes || null;
  const ecom = mounted && mode === 'ecommerce';
  const place = loc.zone?.city || loc.zone?.name || loc.address;

  // The headline is identical on the server and in the browser (it is the page's largest paint); the visitor's own
  // ETA lives in the location chip above it.
  const title = ecom ? t('hero_ecom_title') : t('hero_quick_title_any');
  const chip = !chosen || !place ? t('hero_set_location') : !ecom && mins ? t('hero_eta_to', { mins, place }) : t('hero_delivering_to', { place });

  return (
    <section className="container pt-4 md:pt-6">
      <div className="relative isolate overflow-hidden rounded-hero bg-night text-white">
        <Mosaic categories={categories} />
        <div className="relative px-5 pb-6 pt-6 sm:px-8 md:max-w-[62%] md:px-10 md:pb-12 md:pt-10 lg:px-14 lg:pb-14 lg:pt-12">
          <button
            onClick={() => openLocation(true)}
            className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-white/10 py-1.5 pe-3 ps-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{chip}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          </button>

          <div className="mt-5 flex items-start gap-3 md:mt-7">
            <SpeedLines className="mt-3 hidden sm:inline-flex md:mt-5" />
            <h1 className="max-w-[17ch] font-display text-[30px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white sm:text-[40px] lg:text-[54px]">
              {title}
            </h1>
          </div>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/75 sm:ms-9 md:mt-4 md:text-base">
            {ecom ? t('hero_ecom_sub') : t('hero_quick_sub')}
          </p>

          <div className="mt-5 max-w-xl sm:ms-9 md:mt-7">
            <SearchBar size="lg" />
          </div>
          <Link
            href="/categories"
            className="mt-4 inline-block text-sm font-semibold text-white/80 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-accent sm:ms-9"
          >
            {t('hero_browse')}
          </Link>
        </div>
      </div>
    </section>
  );
}
