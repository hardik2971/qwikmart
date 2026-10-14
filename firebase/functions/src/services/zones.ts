/** Zone/store resolution and delivery pricing (Laravel ZoneService). */
import { cached, db, IS_EMULATOR } from '../shared/firebase';
import type { Mode, Store, Zone } from '../shared/types';
import { haversineKm, inWindow, localHm, money, num, pointInPolygon } from '../shared/util';

export type ZoneRec = Zone & { id: string };
export type StoreRec = Store & { id: string; distance_km?: number | null };

const TTL = IS_EMULATOR ? 0 : 30_000;

export async function activeZones(countryId?: string | null): Promise<ZoneRec[]> {
  const all = await cached('zones/active', TTL, async () => {
    const snap = await db.collection('zones').where('status', '==', 'active').get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Zone) }));
  });
  return countryId ? all.filter((z) => z.country_id === countryId) : all;
}

export async function getZone(id: string | null | undefined): Promise<ZoneRec | null> {
  if (!id) return null;
  const snap = await db.doc(`zones/${id}`).get();
  return snap.exists ? { id: snap.id, ...(snap.data() as Zone) } : null;
}

export function supportsMode(ft: string | undefined | null, mode: Mode): boolean {
  return !ft || ft === 'both' || ft === mode;
}

/** First active zone whose polygon contains the point. */
export async function findZone(lat: number, lng: number, countryId?: string | null): Promise<ZoneRec | null> {
  return (await activeZones(countryId)).find((z) => z.polygon && pointInPolygon(lat, lng, z.polygon)) ?? null;
}

/** Active stores in a zone supporting the mode, sorted by distance (when coordinates are given). */
export async function storesFor(zoneId: string, mode?: Mode | null, lat?: number | null, lng?: number | null): Promise<StoreRec[]> {
  const snap = await db.collection('stores').where('zone_id', '==', zoneId).get();
  let stores: StoreRec[] = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Store) }))
    .filter((s) => s.status === 'active')
    .filter((s) => !mode || supportsMode(s.fulfillment_type, mode));
  if (lat != null && lng != null) {
    stores = stores
      .map((s) => ({ ...s, distance_km: s.lat != null && s.lng != null ? round2(haversineKm(lat, lng, Number(s.lat), Number(s.lng))) : null }))
      .sort((a, b) => (a.distance_km ?? Number.MAX_VALUE) - (b.distance_km ?? Number.MAX_VALUE));
  } else {
    // Prefer the zone's default store when we have no coordinates.
    const zone = await getZone(zoneId);
    if (zone?.default_store_id) stores.sort((a, b) => (a.id === zone.default_store_id ? -1 : b.id === zone.default_store_id ? 1 : 0));
  }
  return stores;
}

/** The store that fulfils orders for a zone/mode (nearest when coordinates are known). */
export async function storeFor(zoneId: string | null | undefined, mode?: Mode | null, lat?: number | null, lng?: number | null): Promise<StoreRec | null> {
  if (!zoneId) return null;
  const list = await storesFor(zoneId, mode, lat, lng);
  if (list.length) return list[0];
  const any = await storesFor(zoneId, null, lat, lng);
  return any[0] ?? null;
}

/** ETA minutes: zone ETA (+2 min per km beyond 2 km) for quick; 2 days for ecommerce. */
export function deliveryMinutes(zone: Zone | null, distanceKm: number | null, mode: Mode = 'quick'): number {
  if (mode === 'ecommerce') return 2 * 24 * 60;
  const base = num(zone?.delivery_time_minutes) || 10;
  const extra = distanceKm != null ? Math.max(0, Math.ceil((distanceKm - 2) * 2)) : 0;
  return base + extra;
}

/** Delivery charge for a distance, before the free-delivery threshold. */
export function deliveryChargeFor(zone: Zone, distanceKm: number | null): number {
  let charge = num(zone.base_charge);
  const baseKm = num(zone.base_distance_km);
  if (distanceKm != null && distanceKm > baseKm) charge += Math.ceil(distanceKm - baseKm) * num(zone.per_km_charge);
  return money(charge);
}

/** Surge amount for the local time (Asia/Kolkata by default). Slot `to` is exclusive. */
export function currentSurge(zone: Zone, at: Date = new Date(), tz = 'Asia/Kolkata'): number {
  const time = localHm(at, tz);
  let total = 0;
  for (const slot of zone.surge_slots ?? []) {
    if (!slot?.from || !slot?.to) continue;
    if (inWindow(time, slot.from.slice(0, 5), slot.to.slice(0, 5))) total += num(slot.amount);
  }
  return money(total);
}

export async function detect(lat: number, lng: number, mode: Mode = 'quick', countryId?: string | null) {
  const zone = await findZone(lat, lng, countryId);
  if (!zone) return { zone: null, store: null, distance_km: null, delivery_minutes: null, deliverable: false };
  const store = await storeFor(zone.id, mode, lat, lng);
  const distance = store && store.lat != null && store.lng != null ? round2(haversineKm(lat, lng, Number(store.lat), Number(store.lng))) : null;
  return {
    zone,
    store,
    distance_km: distance,
    delivery_minutes: deliveryMinutes(zone, distance, mode),
    deliverable: !!store && supportsMode(zone.fulfillment_type, mode),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
