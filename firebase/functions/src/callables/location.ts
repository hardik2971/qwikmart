/** detectZone, getHome (60 s in-memory cache per instance). */
import { cached, hotOpts, numIn, oneOf, open, str } from '../shared/firebase';
import type { DetectZoneResult, Mode } from '../shared/types';
import { detect } from '../services/zones';
import { resolveHome } from '../services/home';

export const detectZone = open<{ lat?: number; lng?: number; mode?: Mode; country_id?: string }>(async (data) => {
  const lat = numIn(data.lat, 'lat', { required: true, min: -90, max: 90 });
  const lng = numIn(data.lng, 'lng', { required: true, min: -180, max: 180 });
  const mode = oneOf(data.mode, 'mode', ['quick', 'ecommerce'] as const, 'quick');
  const r = await detect(lat, lng, mode, data.country_id ? String(data.country_id) : null);
  const result: DetectZoneResult = {
    deliverable: r.deliverable,
    zone: r.zone,
    store: r.store ? { id: r.store.id, name: r.store.name, lat: r.store.lat ?? null, lng: r.store.lng ?? null, is_open: r.store.is_open !== false } : null,
    distance_km: r.distance_km,
    delivery_minutes: r.delivery_minutes,
  };
  return result;
}, hotOpts);

export const getHome = open<{ zone_id?: string; mode?: Mode; category_id?: string; lang?: string }>(async (data) => {
  const mode = oneOf(data.mode, 'mode', ['quick', 'ecommerce'] as const, 'quick');
  const zoneId = str(data.zone_id, 'zone_id', { max: 128 }) || null;
  const categoryId = str(data.category_id, 'category_id', { max: 128 }) || null;
  const lang = str(data.lang, 'lang', { max: 10 }) || 'en';
  return cached(`home/${zoneId}/${mode}/${categoryId}/${lang}`, 60_000, () => resolveHome(zoneId, mode, categoryId, lang));
}, hotOpts);
