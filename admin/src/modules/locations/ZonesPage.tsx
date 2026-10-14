'use client';
// Manage Zones — port of admin/zones/index.blade.php (card grid). Respects the header country filter.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bike, Clock, MapPin, MapPinned, Pencil, Plus, Route, Store as StoreIcon, Trash2, Zap } from 'lucide-react';
import { fetchList, removeDoc, useCountries, useInvalidate, useStores, where as w, countDocs, where } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Zone } from '@/lib/types';
import { money, errMsg, statusLabel } from '@/lib/format';
import { Forbidden, PageHeader, StatusPill } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { opts } from '@/components/ui/DataTable';
import { FULFILLMENT_OPTS, LocalTable, STATUS_OPTS, isActive, useAll } from './LocalTable';

function RiderCount({ zoneId }: { zoneId: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    countDocs('delivery_boys', [where('zone_id', '==', zoneId)]).then((c) => alive && setN(c)).catch(() => alive && setN(null));
    return () => { alive = false; };
  }, [zoneId]);
  return <>{n ?? '–'}</>;
}

const km = (v: any) => `${Number(Number(v || 0).toFixed(2))}km`;

export default function ZonesPage() {
  const { can } = useAuth();
  const { p, countryId } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { data: countries = [] } = useCountries();
  const { data: stores = [] } = useStores();
  const { rows, loading, error, reload } = useAll(() => fetchList<Zone>('zones', ...(countryId ? [w('country_id', '==', countryId)] : [])), [countryId]);
  const cName = useMemo(() => Object.fromEntries(countries.map((c) => [c.id, c.name])), [countries]);
  const storeCount = useMemo(() => { const m: Record<string, number> = {}; stores.forEach((s) => { m[s.zone_id] = (m[s.zone_id] || 0) + 1; }); return m; }, [stores]);

  if (!can('zone.list')) return <Forbidden />;
  const refresh = () => { reload(); invalidate('lookup', 'zones'); };

  const del = async (z: Zone) => {
    if (!(await confirm({ title: `Delete zone ${z.name}?`, message: 'Stores in this zone will be unassigned.', danger: true }))) return;
    try { await removeDoc('zones', z.id); toast('Zone deleted'); refresh(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div>
      <PageHeader title="Manage Zones">
        {can('zone.create') && <Link href={p('/zones/new')} className="btn-primary" data-testid="add-zone"><Plus className="w-4 h-4" /> Add Zone</Link>}
      </PageHeader>

      <LocalTable<Zone>
        rows={rows} loading={loading} error={error} onRefresh={refresh} search="Search" defaultSort={{ field: 'name', dir: 'asc' }} pageSize={20}
        searchText={(z) => `${z.name} ${z.city ?? ''}`}
        empty={<>No zones found. {can('zone.create') && <Link href={p('/zones/new')} className="text-primary font-semibold">Create your first zone</Link>}</>}
        filters={[
          ...(countryId ? [] : [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name) }]),
          { key: 'fulfillment_type', placeholder: 'All fulfillment types', options: FULFILLMENT_OPTS },
          { key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS, test: (z, v) => (isActive(z.status) ? 'active' : 'inactive') === v },
        ]}
        columns={[]}
        renderBody={(list) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((z) => (
              <div key={z.id} className="card p-4 flex flex-col" data-testid={`zone-${z.id}`}>
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-xl bg-primary-50 text-primary flex items-center justify-center"><MapPinned className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-navy dark:text-white truncate">{z.name}</h3>
                    <p className="text-xs text-muted flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{[z.city, cName[z.country_id]].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                  <StatusPill status={isActive(z.status)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusPill status={z.fulfillment_type} label={statusLabel(z.fulfillment_type)} />
                  <span className="pill border border-line text-muted"><Route className="w-3 h-3 mr-1" />{Number(z.per_km_charge) > 0 ? 'Distance pricing' : 'Flat pricing'}</span>
                  {(z.surge_slots?.length ?? 0) > 0 && <span className="pill border border-amber-200 bg-amber-50 text-amber-700"><Zap className="w-3 h-3 mr-1" />Surge</span>}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {([
                    ['BASE CHARGE', money(z.base_charge)], ['BASE DISTANCE', km(z.base_distance_km)], ['PER KM', money(z.per_km_charge)],
                    ['FREE ABOVE', z.free_delivery_above != null ? money(z.free_delivery_above) : '—'],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-line dark:border-dark-line px-1 py-2">
                      <div className="text-sm font-extrabold text-navy dark:text-white truncate">{v}</div>
                      <div className="text-[9px] font-semibold tracking-wide text-muted leading-tight">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{z.delivery_time_minutes ?? '—'} min</span>
                  <span className="flex items-center gap-1"><StoreIcon className="w-3.5 h-3.5" />{storeCount[z.id] || 0} stores</span>
                  <span className="flex items-center gap-1"><Bike className="w-3.5 h-3.5" /><RiderCount zoneId={z.id} /> riders</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-line dark:border-dark-line">
                  {can('zone.update') ? <Link href={p(`/zones/edit/${z.id}`)} className="btn-outline btn-sm justify-center !text-primary !border-primary/40"><Pencil className="w-3.5 h-3.5" /> Edit</Link> : <span />}
                  {can('zone.delete') && <button type="button" onClick={() => del(z)} className="btn-outline btn-sm w-full justify-center !text-red-500 !border-red-300"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
