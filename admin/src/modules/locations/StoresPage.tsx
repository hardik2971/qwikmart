'use client';
// Manage Stores — port of admin/stores/index.blade.php (card grid). Respects the header country filter.
import { useMemo } from 'react';
import Link from 'next/link';
import { Eye, Layers, MapPin, Package, Pencil, Plus, Store as StoreIcon, Trash2, Zap } from 'lucide-react';
import { fetchList, removeDoc, useCountries, useInvalidate, useZones, where } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Store } from '@/lib/types';
import { errMsg, imgUrl, statusLabel } from '@/lib/format';
import { Forbidden, PageHeader, StatusPill } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { opts } from '@/components/ui/DataTable';
import { FULFILLMENT_OPTS, LocalTable, STATUS_OPTS, isActive, useAll } from './LocalTable';

export default function StoresPage() {
  const { can } = useAuth();
  const { p, countryId } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { data: countries = [] } = useCountries();
  const { data: zones = [] } = useZones();
  const { rows, loading, error, reload } = useAll(() => fetchList<Store>('stores', ...(countryId ? [where('country_id', '==', countryId)] : [])), [countryId]);
  const cName = useMemo(() => Object.fromEntries(countries.map((c) => [c.id, c.name])), [countries]);
  const zName = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.name])), [zones]);

  if (!can('store.list')) return <Forbidden />;
  const refresh = () => { reload(); invalidate('lookup', 'stores'); };

  const del = async (s: Store) => {
    if (!(await confirm({ title: `Delete store ${s.name}?`, message: 'The store document is removed. Disable its login accounts from Staff if needed.', danger: true }))) return;
    try { await removeDoc('stores', s.id); toast('Store deleted'); refresh(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div>
      <PageHeader title="Manage Stores">
        {can('store.create') && <Link href={p('/stores/new')} className="btn-primary" data-testid="add-store"><Plus className="w-4 h-4" /> Add Store</Link>}
      </PageHeader>
      <LocalTable<Store>
        rows={rows} loading={loading} error={error} onRefresh={refresh} search="Search" defaultSort={{ field: 'name', dir: 'asc' }}
        searchText={(s) => `${s.name} ${s.city ?? ''} ${s.email ?? ''} ${s.phone ?? ''} ${zName[s.zone_id] ?? ''}`}
        empty={<>No stores found. {can('store.create') && <Link href={p('/stores/new')} className="text-primary font-semibold">Add a store</Link>}</>}
        filters={[
          ...(countryId ? [] : [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name) }]),
          { key: 'zone_id', placeholder: 'All Zones', options: opts(zones.filter((z) => !countryId || z.country_id === countryId), (z) => z.name) },
          { key: 'fulfillment_type', placeholder: 'All fulfillment types', options: FULFILLMENT_OPTS },
          { key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS, test: (s, v) => (isActive(s.status) ? 'active' : 'inactive') === v },
        ]}
        columns={[]}
        renderBody={(list) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((s) => {
              const FIcon = s.fulfillment_type === 'quick' ? Zap : s.fulfillment_type === 'ecommerce' ? Package : Layers;
              return (
                <div key={s.id} className="card p-4 flex flex-col" data-testid={`store-${s.id}`}>
                  <div className="flex items-start gap-3">
                    {s.logo
                      ? <img src={imgUrl(s.logo)} className="w-10 h-10 shrink-0 rounded-xl object-cover border border-line" alt="" />
                      : <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center"><StoreIcon className="w-5 h-5" /></span>}
                    <div className="min-w-0 flex-1">
                      <Link href={p(`/stores/view/${s.id}`)} className="font-bold text-navy dark:text-white hover:text-primary truncate block">{s.name}</Link>
                      <p className="text-xs text-muted truncate">{zName[s.zone_id] ?? 'No zone'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="pill border border-line text-navy dark:text-slate-200"><FIcon className="w-3 h-3" />{statusLabel(s.fulfillment_type)}</span>
                    <div className="flex items-center gap-1.5">
                      {s.is_open === false && <span className="pill border border-slate-200 bg-slate-100 text-slate-500">Closed</span>}
                      <StatusPill status={isActive(s.status)} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted flex items-start gap-1"><MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span className="line-clamp-2">{[...new Set([s.city, s.address, cName[s.country_id]].filter(Boolean))].join(', ') || '—'}</span></p>
                  <div className="mt-auto pt-4 grid grid-cols-3 gap-2">
                    <Link href={p(`/stores/view/${s.id}`)} className="btn-outline btn-sm justify-center" title="View"><Eye className="w-3.5 h-3.5" /></Link>
                    {can('store.update') ? <Link href={p(`/stores/edit/${s.id}`)} className="btn-outline btn-sm justify-center" title="Edit"><Pencil className="w-3.5 h-3.5" /></Link> : <span />}
                    {can('store.delete') && <button type="button" onClick={() => del(s)} className="btn-outline btn-sm w-full justify-center hover:!text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}
