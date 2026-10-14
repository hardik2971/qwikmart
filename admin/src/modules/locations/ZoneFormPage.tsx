'use client';
// Add / Edit Zone — port of admin/zones/form.blade.php: polygon boundary (PolygonDrawer), pricing, surge slots, additional charges.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BadgePercent, Clock, Eraser, Info, ListPlus, Map as MapIcon, MousePointerClick, Plus, Receipt, Route, Ruler, Save, Trash2, Zap } from 'lucide-react';
import { fetchDoc, saveDoc, useCountries, useInvalidate, useStores } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { AdditionalCharge, Fulfillment, LatLng, SurgeSlot, Zone } from '@/lib/types';
import { errMsg, slugify } from '@/lib/format';
import { Card, Forbidden, Loading, PageHeader, Toggle } from '@/components/ui';
import { Input, Select } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import { PolygonDrawer } from '@/components/map';
import { useToast } from '@/components/ui/toast';
import { opts } from '@/components/ui/DataTable';
import { FULFILLMENT_OPTS, isActive } from './LocalTable';
import { PlaceSearch, polygonCentroid } from './PlaceSearch';

type NumStr = string | number;
interface Form {
  country_id: string; name: string; slug: string; city: string; fulfillment_type: Fulfillment; delivery_time_minutes: NumStr; status: boolean;
  polygon: LatLng[]; base_charge: NumStr; base_distance_km: NumStr; per_km_charge: NumStr; free_delivery_above: NumStr; min_order: NumStr;
  surge_slots: { from: string; to: string; amount: NumStr }[]; additional_charges: { name: AdditionalCharge['name']; amount: NumStr; refundable: boolean }[];
  default_store_id: string;
}
const blank = (country = ''): Form => ({
  country_id: country, name: '', slug: '', city: '', fulfillment_type: 'both', delivery_time_minutes: 10, status: true, polygon: [],
  base_charge: 0, base_distance_km: 0, per_km_charge: 0, free_delivery_above: '', min_order: 0, surge_slots: [], additional_charges: [], default_store_id: '',
});
const n = (v: NumStr) => Math.round(Number(v || 0) * 100) / 100;

export default function ZoneFormPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : null;
  const router = useRouter();
  const { can } = useAuth();
  const { p, countryId, settings, country } = usePanel();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: countries = [] } = useCountries();
  const { data: stores = [] } = useStores();
  const [form, setForm] = useState<Form | null>(id ? null : blank(countryId || settings.default_country_id || ''));
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const sym = countries.find((c) => c.id === form?.country_id)?.currency_symbol || country?.currency_symbol || '₹';

  useEffect(() => {
    if (!id) return;
    fetchDoc<Zone>('zones', id).then((z) => {
      if (!z) { toast('Zone not found', 'error'); router.push(p('/zones')); return; }
      setForm({
        country_id: z.country_id || '', name: z.name || '', slug: z.slug || '', city: z.city || '', fulfillment_type: z.fulfillment_type || 'both',
        delivery_time_minutes: z.delivery_time_minutes ?? 10, status: isActive(z.status), polygon: z.polygon || [],
        base_charge: z.base_charge ?? 0, base_distance_km: z.base_distance_km ?? 0, per_km_charge: z.per_km_charge ?? 0,
        free_delivery_above: z.free_delivery_above ?? '', min_order: z.min_order ?? 0,
        surge_slots: (z.surge_slots || []).map((s) => ({ ...s })),
        additional_charges: (z.additional_charges || []).map((c) => ({ name: typeof c.name === 'string' ? { en: c.name } : c.name || {}, amount: c.amount ?? 0, refundable: !!c.refundable })),
        default_store_id: z.default_store_id || '',
      });
    }).catch((e) => toast(errMsg(e), 'error'));
  }, [id]);

  const zoneStores = useMemo(() => (id ? stores.filter((s) => s.zone_id === id) : []), [stores, id]);

  if (!can(id ? 'zone.update' : 'zone.create')) return <Forbidden />;
  if (!form) return <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setSurge = (i: number, patch: Partial<Form['surge_slots'][number]>) => set('surge_slots', form.surge_slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setExtra = (i: number, patch: Partial<Form['additional_charges'][number]>) => set('additional_charges', form.additional_charges.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.polygon.length < 3) { toast('Please draw the zone boundary on the map.', 'error'); return; }
    if (!form.country_id || !form.name.trim()) { toast('Country and zone name are required', 'error'); return; }
    setBusy(true);
    try {
      const surge: SurgeSlot[] = form.surge_slots.filter((s) => s.from && s.to && s.amount !== '').map((s) => ({ from: s.from, to: s.to, amount: n(s.amount) }));
      const extras: AdditionalCharge[] = form.additional_charges.filter((c) => (c.name?.en || Object.values(c.name || {}).find(Boolean)) && c.amount !== '')
        .map((c) => ({ name: c.name, amount: n(c.amount), refundable: !!c.refundable }));
      const data: Omit<Zone, 'id'> = {
        country_id: form.country_id, name: form.name.trim(), slug: form.slug || slugify(form.name), city: form.city.trim(),
        polygon: form.polygon, center: polygonCentroid(form.polygon) ?? undefined, fulfillment_type: form.fulfillment_type,
        base_charge: n(form.base_charge), base_distance_km: n(form.base_distance_km), per_km_charge: n(form.per_km_charge),
        free_delivery_above: form.free_delivery_above === '' || form.free_delivery_above == null ? null : n(form.free_delivery_above),
        min_order: n(form.min_order), surge_slots: surge, additional_charges: extras,
        delivery_time_minutes: Math.max(1, parseInt(String(form.delivery_time_minutes), 10) || 1),
        default_store_id: form.default_store_id || null, status: form.status ? 'active' : 'inactive',
      };
      await saveDoc('zones', id, data);
      invalidate('lookup', 'zones');
      toast(id ? 'Zone updated' : 'Zone created');
      router.push(p('/zones'));
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <PageHeader title={id ? 'Edit Zone' : 'Add Zone'} subtitle="Draw the delivery boundary and configure delivery pricing for this zone." back={p('/zones')} />

      <Card title="Basic Information" icon={Info}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Select label="Country" required placeholder="Select country" options={opts(countries, (c) => c.name)} value={form.country_id} onChange={(e) => set('country_id', e.target.value)} />
          <Input label="Zone Name" required placeholder="e.g. Mumbai Central" value={form.name} onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />
          <Input label="Slug" value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} placeholder="mumbai-central" />
          <Input label="City" placeholder="Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Select label="Fulfillment Type" required options={FULFILLMENT_OPTS} value={form.fulfillment_type} onChange={(e) => set('fulfillment_type', e.target.value as Fulfillment)}
            hint="Quick = 10-minute delivery, eCommerce = scheduled shipping, Both = all orders." />
          <Input label="Delivery Time (minutes)" type="number" min={1} required icon={<Clock />} value={form.delivery_time_minutes} onChange={(e) => set('delivery_time_minutes', e.target.value)} />
          <Select label="Default Store" placeholder={id ? (zoneStores.length ? 'Select store' : 'No stores in this zone') : 'Save the zone first, then assign stores'} disabled={!id}
            options={opts(zoneStores, (s) => s.name)} value={form.default_store_id} onChange={(e) => set('default_store_id', e.target.value)}
            hint="Quick-commerce orders in this zone are served from this store." />
          <div className="flex items-end pb-2">
            <Toggle checked={form.status} onChange={(v) => set('status', v)} label="Active" description="Inactive zones are not served by the apps." />
          </div>
        </div>
      </Card>

      <Card title="Polygon Boundary" icon={MapIcon} subtitle="Draw the area your store can serve. Only addresses inside this polygon can place orders."
        actions={<button type="button" className="btn-outline btn-sm" onClick={() => { set('polygon', []); setMapKey((k) => k + 1); }}><Eraser className="w-3.5 h-3.5" /> Clear</button>}>
        <PlaceSearch onPick={(pl) => { setMapCenter({ lat: pl.lat, lng: pl.lng }); setMapKey((k) => k + 1); }} />
        <PolygonDrawer key={mapKey} value={form.polygon} onChange={(v) => set('polygon', v)} center={mapCenter} height={460} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-muted"><MousePointerClick className="w-3.5 h-3.5 inline" /> Use the polygon tool (top-right) to draw. Use edit/delete tools to adjust. One polygon per zone.</p>
          <p className={form.polygon.length >= 3 ? 'text-primary font-semibold' : 'text-red-500 font-semibold'}>{form.polygon.length >= 3 ? `${form.polygon.length} boundary points` : 'No boundary drawn yet'}</p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Distance calculation" icon={Ruler} subtitle="Distance is derived from store → customer coordinates (Haversine).">
          <Select label="Distance unit" options={[{ value: 'km', label: 'Kilometers (KM)' }]} value="km" disabled onChange={() => {}} />
          <p className="mt-2 text-xs text-muted">Base distance and per-unit charge use this unit.</p>
        </Card>
        <Card title="Basic charges" icon={Receipt} subtitle="If distance is within the base distance, only the base delivery fee applies.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={`Base delivery charge (${sym})`} type="number" step="0.01" min={0} prefix={sym} value={form.base_charge} onChange={(e) => set('base_charge', e.target.value)} />
            <Input label="Base distance (km)" type="number" step="0.01" min={0} value={form.base_distance_km} onChange={(e) => set('base_distance_km', e.target.value)} />
          </div>
        </Card>
        <Card title="Distance-based charges" icon={Route} subtitle="Charged for every km beyond the base distance.">
          <Input label={`Charge per km (${sym})`} type="number" step="0.01" min={0} prefix={sym} value={form.per_km_charge} onChange={(e) => set('per_km_charge', e.target.value)} />
        </Card>
        <Card title="Order thresholds" icon={BadgePercent} subtitle="Free delivery and minimum order value for this zone.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={`Free delivery above (${sym})`} type="number" step="0.01" min={0} prefix={sym} value={form.free_delivery_above} onChange={(e) => set('free_delivery_above', e.target.value)} hint="Leave empty to disable." />
            <Input label={`Minimum order (${sym})`} type="number" step="0.01" min={0} prefix={sym} value={form.min_order} onChange={(e) => set('min_order', e.target.value)} />
          </div>
        </Card>
      </div>

      <div className="card p-5">
        <LangTabs translate>
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><Zap className="w-4 h-4" /></span>
              <h3 className="card-title">Surge pricing</h3><span className="pill bg-slate-100 text-slate-500">Optional</span>
            </div>
            <p className="text-xs text-muted mb-3">Extra charge added to the delivery fee for orders placed within these time windows (e.g. late night, peak hours).</p>
            <div className="space-y-2">
              {form.surge_slots.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                  <div><label className="label">From</label><input type="time" className="input" required value={s.from} onChange={(e) => setSurge(i, { from: e.target.value })} /></div>
                  <div><label className="label">To</label><input type="time" className="input" required value={s.to} onChange={(e) => setSurge(i, { to: e.target.value })} /></div>
                  <div><label className="label">Amount ({sym})</label><input type="number" step="0.01" min={0} className="input" required value={s.amount} onChange={(e) => setSurge(i, { amount: e.target.value })} /></div>
                  <button type="button" className="icon-btn mb-0.5 hover:!text-red-500" title="Remove" onClick={() => set('surge_slots', form.surge_slots.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary btn-sm mt-3" data-testid="add-surge" onClick={() => set('surge_slots', [...form.surge_slots, { from: '22:00', to: '06:00', amount: '' }])}><Plus className="w-3.5 h-3.5" /> Add surge slot</button>
          </div>

          <div className="border-t border-line dark:border-dark-line pt-5">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><ListPlus className="w-4 h-4" /></span>
              <h3 className="card-title">Additional Charges</h3><span className="pill bg-slate-100 text-slate-500">Optional</span>
            </div>
            <p className="text-xs text-muted mb-3">Extra fees added at checkout for this zone (e.g. packaging, handling). If Refundable is ON, this charge will be refunded to the customer if the order is cancelled.</p>
            <div className="space-y-3">
              {form.additional_charges.map((c, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_auto_auto] gap-3 items-end">
                  <TransInput label="Name" value={c.name} onChange={(v) => setExtra(i, { name: v })} placeholder="Packaging fee" required />
                  <div><label className="label">Amount ({sym})</label><input type="number" step="0.01" min={0} className="input" required value={c.amount} onChange={(e) => setExtra(i, { amount: e.target.value })} /></div>
                  <div className="pb-2"><Toggle checked={c.refundable} onChange={(v) => setExtra(i, { refundable: v })} label="Refundable" /></div>
                  <button type="button" className="icon-btn mb-0.5 hover:!text-red-500" title="Remove" onClick={() => set('additional_charges', form.additional_charges.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary btn-sm mt-3" data-testid="add-charge" onClick={() => set('additional_charges', [...form.additional_charges, { name: {}, amount: '', refundable: false }])}><Plus className="w-3.5 h-3.5" /> Add additional charge</button>
          </div>
        </LangTabs>
      </div>

      <div className="card p-4 flex justify-end gap-2 sticky bottom-3 z-10">
        <button type="button" className="btn-outline" onClick={() => router.push(p('/zones'))}>Cancel</button>
        <button className="btn-primary" disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Zone'}</button>
      </div>
    </form>
  );
}
