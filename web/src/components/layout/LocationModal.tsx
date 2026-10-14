'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Crosshair, LocateFixed, MapPin, Search } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import type { Country, Zone } from '@/lib/types';
import { useDebounced, useMounted } from '@/hooks';
import { useLocationStore, useUiStore, zoneSlug } from '@/store';
import { Logo, Modal, Spinner } from '../ui';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

/** Country flag: image path/URL from the API, else a flagcdn image by ISO code (emoji flags don't render on Windows). */
export function Flag({ flag, iso2, className }: { flag?: string; iso2?: string; className?: string }) {
  const src =
    flag && (flag.startsWith('http') || flag.startsWith('/'))
      ? flag
      : iso2
        ? `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`
        : null;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={clsx('h-3.5 w-5 rounded-[2px] object-cover', className)} />;
  return flag ? <span className={className}>{flag}</span> : null;
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`, {
      headers: { Accept: 'application/json' },
    });
    const j = (await r.json()) as { display_name?: string };
    return j.display_name || '';
  } catch {
    return '';
  }
}

export default function LocationModal() {
  const t = useT();
  const mounted = useMounted();
  const router = useRouter();
  const pathname = usePathname();
  const open = useUiStore((s) => s.locationModalOpen);
  const setOpen = useUiStore((s) => s.openLocationModal);
  const loc = useLocationStore();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [country, setCountry] = useState<Country | null>(null);
  const [notServiceable, setNotServiceable] = useState(false);
  const dq = useDebounced(query.trim(), 400);

  // auto-open on first visit
  useEffect(() => {
    if (mounted && !loc.chosen) setOpen(true);
  }, [mounted, loc.chosen, setOpen]);

  const show = mounted && (open || !loc.chosen);

  const countries = useQuery({ queryKey: ['countries'], queryFn: api.countries, enabled: show, staleTime: 600_000 });
  useEffect(() => {
    if (!country && countries.data?.length) {
      setCountry(loc.country || countries.data.find((c) => c.is_default) || countries.data[0]);
    }
  }, [countries.data, country, loc.country]);

  const zones = useQuery({
    queryKey: ['zones', country?.id],
    queryFn: () => api.zones(country!.id),
    enabled: show && !!country,
    staleTime: 600_000,
  });

  const places = useQuery({
    queryKey: ['nominatim', dq],
    enabled: show && dq.length > 2,
    staleTime: 600_000,
    queryFn: async () => {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(dq)}`,
        { headers: { Accept: 'application/json' } },
      );
      return (await r.json()) as NominatimResult[];
    },
  });

  // previous zone slug (captured at render, before setLocation): /<old zone> must follow the new zone
  const prevSlug = zoneSlug(loc.zone);
  const finish = (zone: Zone) => {
    setOpen(false);
    setQuery('');
    const onZoneHome = pathname === '/' || (!!prevSlug && pathname === `/${prevSlug}`) || zones.data?.some((z) => `/${zoneSlug(z)}` === pathname);
    if (onZoneHome && pathname !== `/${zoneSlug(zone)}`) router.push(`/${zoneSlug(zone)}`);
  };

  const detectAt = async (lat: number, lng: number, label?: string) => {
    setBusy(true);
    setNotServiceable(false);
    try {
      const res = await api.detectZone(lat, lng);
      if (!res.deliverable || !res.zone) {
        setNotServiceable(true);
        toast.error('Sorry, we do not deliver to this location yet.');
        return;
      }
      const address = label || (await reverseGeocode(lat, lng)) || `${res.zone.name}`;
      const all = countries.data || (await api.countries());
      loc.setLocation({
        zone: res.zone,
        store: res.store,
        lat,
        lng,
        address,
        distanceKm: res.distance_km,
        deliveryMinutes: res.delivery_minutes,
        country: all.find((c) => c.id === res.zone!.country_id) || loc.country,
      });
      toast.success(`Delivering to ${res.zone.name}`);
      finish(res.zone);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const useCurrent = () => {
    if (!navigator.geolocation) return toast.error('Geolocation is not supported by your browser');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => detectAt(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setBusy(false);
        toast.error(err.code === 1 ? 'Location permission denied. Pick a zone below.' : 'Unable to get your location');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const pickZone = (z: Zone) => {
    loc.setLocation({
      zone: z,
      store: null,
      lat: null,
      lng: null,
      distanceKm: null,
      deliveryMinutes: z.delivery_time_minutes,
      address: `${z.city || z.name}, ${country?.name ?? ''}`,
      country,
    });
    toast.success(`Delivering to ${z.name}`);
    finish(z);
  };

  return (
    <Modal
      open={show}
      onClose={() => setOpen(false)}
      hideClose={!loc.chosen}
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-primary">
            <LocateFixed className="h-4 w-4" />
          </span>
          {t('set_location')}
        </span>
      }
    >
      <div className="flex flex-col items-center text-center">
        <Logo className="h-12 w-auto" />
        <h3 className="mt-4 text-base font-bold">{t('select_your_location')}</h3>
        <p className="text-xs text-muted">{t('search_location')}</p>
      </div>

      <button onClick={useCurrent} disabled={busy} className="btn-primary mt-5 w-full rounded-btn py-3 ring-1 ring-black/40">
        {busy ? <Spinner /> : <Crosshair className="h-4 w-4" />} {t('use_current_location')}
      </button>

      <div className="relative mt-3">
        <div className="flex items-center gap-2 rounded-btn border border-line bg-soft px-3 py-1.5">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_location')}
            className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <button onClick={useCurrent} className="rounded-lg bg-primary-50 p-2 text-primary" aria-label="Detect">
            <LocateFixed className="h-4 w-4" />
          </button>
        </div>
        {dq.length > 2 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-btn border border-line">
            {places.isFetching && <div className="p-3 text-sm text-muted">Searching…</div>}
            {places.data?.length === 0 && !places.isFetching && <div className="p-3 text-sm text-muted">No places found</div>}
            {places.data?.map((p) => (
              <button
                key={p.place_id}
                onClick={() => detectAt(Number(p.lat), Number(p.lon), p.display_name)}
                className="flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-start text-sm last:border-0 hover:bg-soft"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="line-clamp-2 text-ink">{p.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
        <span className="h-px flex-1 bg-line" /> {t('or')} <span className="h-px flex-1 bg-line" />
      </div>

      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft text-primary">
          <MapPin className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">{t('pick_zone')}</div>
          <div className="text-xs text-muted">
            {t('pick_zone_sub', { count: zones.data?.length ?? 0, country: country?.name ?? '' })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        {t('delivering_to')}
        <div className="relative">
          <button onClick={() => setCountryOpen((o) => !o)} className="chip py-1 font-semibold">
            <Flag flag={country?.flag} iso2={country?.iso2} /> {country?.name || '—'} <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {countryOpen && (
            <div className="absolute start-0 top-10 z-10 max-h-60 w-56 overflow-y-auto rounded-btn border border-line bg-surface p-1 shadow-pop">
              {countries.data?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCountry(c);
                    setCountryOpen(false);
                  }}
                  className={clsx('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-ink hover:bg-soft', c.id === country?.id && 'bg-primary-50')}
                >
                  <Flag flag={c.flag} iso2={c.iso2} /> {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {zones.isLoading && [0, 1].map((i) => <div key={i} className="skeleton h-10 w-24" />)}
        {zones.data?.map((z) => (
          <button
            key={z.id}
            onClick={() => pickZone(z)}
            className={clsx('chip rounded-btn px-3 py-2', loc.zone?.id === z.id && 'chip-active')}
          >
            {z.name}
          </button>
        ))}
        {zones.data?.length === 0 && <span className="text-sm text-muted">No zones in this country yet.</span>}
      </div>

      <div
        className={clsx(
          'mt-5 flex items-center gap-3 rounded-btn bg-primary-50 p-3 dark:bg-primary/10',
          notServiceable && 'ring-2 ring-primary',
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
          <MapPin className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{t('dont_see_area')}</div>
          <div className="text-xs text-muted">{t('expanding')}</div>
        </div>
        <svg viewBox="0 0 48 40" className="h-10 w-12 text-primary" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 36 L14 22 M14 22 L20 36 M20 36 L44 18" strokeDasharray="3 3" />
          <path d="M30 4a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7z" fill="currentColor" stroke="none" />
          <circle cx="30" cy="11" r="2.5" fill="white" stroke="none" />
        </svg>
      </div>
    </Modal>
  );
}
