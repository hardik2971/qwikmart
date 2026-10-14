'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Banner, Category } from '@/lib/types';
import { useCtxKey } from '@/hooks';
import { useLocationStore, useUiStore, zoneSlug } from '@/store';
import CategoryStrip from './CategoryStrip';
import { BannerSlider, SectionRenderer } from './Sections';
import { ProductCardSkeleton } from '../product/ProductCard';

function HomeSkeleton() {
  return (
    <>
      <div className="skeleton h-[300px] w-full rounded-none md:h-[440px]" />
      <div className="container py-8">
        <div className="skeleton h-7 w-56" />
        <div className="mt-5 grid grid-cols-4 gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Syncs a `/[zone]` URL slug into the location store (e.g. shared link to /mumbai). */
function useZoneFromSlug(slug?: string) {
  useEffect(() => {
    // Read the persisted store directly: during hydration the hook returns the initial (empty) snapshot, which
    // would overwrite a detected address / distance with the bare zone on every reload of /[zone].
    if (!slug || zoneSlug(useLocationStore.getState().zone) === slug) return;
    let cancelled = false;
    (async () => {
      try {
        const [countries, zones] = await Promise.all([api.countries(), api.zones()]);
        const z = zones.find((x) => zoneSlug(x) === slug);
        const loc = useLocationStore.getState();
        if (!z || cancelled || zoneSlug(loc.zone) === slug) return;
        loc.setLocation({
          zone: z,
          country: countries.find((c) => c.id === z.country_id) || null,
          // a different zone: the previous point / store belong to the old zone
          store: null,
          lat: null,
          lng: null,
          deliveryMinutes: z.delivery_time_minutes,
          address: `${z.city || z.name}`,
          distanceKm: null,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
}

export default function HomeView({ zone }: { zone?: string }) {
  useZoneFromSlug(zone);
  const ctx = useCtxKey();
  const activeId = useUiStore((s) => s.activeCategoryId);
  const setActive = useUiStore((s) => s.setActiveCategory);

  // reset category tab when leaving home
  useEffect(() => () => setActive(null, null), [setActive]);

  const home = useQuery({ queryKey: ['home', activeId, ...ctx], queryFn: () => api.home(activeId) });
  const cats = useQuery({ queryKey: ['home', null, ...ctx], queryFn: () => api.home(null), select: (d) => d.categories });

  const onSelect = (c: Category | null) => {
    setActive(c?.id ?? null, c?.header_color ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sections = home.data?.sections || [];
  const banner = sections.find((s) => s.type === 'banner_slider');

  return (
    <div>
      <CategoryStrip categories={cats.data || []} activeId={activeId} onSelect={onSelect} loading={cats.isLoading} />
      {home.isLoading ? (
        <HomeSkeleton />
      ) : home.isError ? (
        <div className="container py-20 text-center text-muted">Unable to load the homepage. Please try again.</div>
      ) : (
        <>
          {banner && <BannerSlider items={banner.items as Banner[]} />}
          <div className="container">
            {sections
              .filter((s) => s !== banner)
              .map((s) => (
                <SectionRenderer key={s.id} section={s} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
