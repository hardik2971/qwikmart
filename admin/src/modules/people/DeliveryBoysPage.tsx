'use client';
// Delivery Boys list — port of admin/delivery-boys/index.blade.php. Admin: all riders (header country filter);
// store panel: riders serving the store's zone (read-only). Bonus button → payEarnings({type:'bonus'}).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Gift, Plus, UserCheck } from 'lucide-react';
import { deleteUser, payEarnings } from '@/lib/callables';
import { useCountries, useZones, where } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { errMsg, money } from '@/lib/format';
import { Forbidden, Loading, PageHeader, RowActions, StatusPill, Toggle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/form/fields';
import { opts } from '@/components/ui/DataTable';
import { LocalTable, isActive, useAll } from '@/modules/locations/LocalTable';
import { loadRiders, RiderAvatar, useStoreZone, type Rider } from './shared';

export default function DeliveryBoysPage() {
  const { can } = useAuth();
  const { p, countryId, isStore } = usePanel();
  const { zoneId, loading: zLoading } = useStoreZone();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { data: countries = [] } = useCountries();
  const { data: zones = [] } = useZones();
  const scope = isStore ? (zoneId ? [where('zone_id', '==', zoneId)] : null) : countryId ? [where('country_id', '==', countryId)] : [];
  const { rows, loading, error, reload } = useAll(() => (scope ? loadRiders(...scope) : Promise.resolve([] as Rider[])), [isStore, zoneId, countryId]);
  const zName = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.name])), [zones]);
  const pending = rows.filter((r) => r.approval_status === 'pending').length;
  const [bonus, setBonus] = useState<{ boy: Rider; amount: string; credit: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can('delivery_boy.list')) return <Forbidden />;
  if (isStore && zLoading) return <Loading />;

  const del = async (b: Rider) => {
    if (!(await confirm({ title: `Delete ${b.name || 'delivery boy'}?`, message: 'The login account is removed and the rider is deactivated.', danger: true }))) return;
    try { await deleteUser({ uid: b.id }); toast('Delivery boy deleted'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const addBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonus) return;
    setBusy(true);
    try {
      await payEarnings({ delivery_boy_id: bonus.boy.id, type: 'bonus', amount: Number(bonus.amount), credit_wallet: bonus.credit } as Parameters<typeof payEarnings>[0]);
      toast('Bonus added'); setBonus(null); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Delivery Boys" subtitle={isStore ? 'Delivery partners serving your store' : undefined}>
        {!isStore && (
          <>
            <Link href={p('/delivery-boys/approvals')} className="btn-outline"><UserCheck className="w-4 h-4" /> Approvals {pending > 0 && <span className="pill bg-amber-100 text-amber-700">{pending}</span>}</Link>
            {can('delivery_boy.create') && <Link href={p('/delivery-boys/new')} className="btn-primary" data-testid="add-delivery-boy"><Plus className="w-4 h-4" /> Add Delivery Boy</Link>}
          </>
        )}
      </PageHeader>

      {isStore && !zoneId ? <div className="card p-10 text-center text-muted">Your store is not assigned to a zone yet.</div> : (
        <LocalTable<Rider>
          rows={rows} loading={loading} error={error} onRefresh={reload} search="Search" defaultSort={{ field: 'created_at', dir: 'desc' }}
          searchText={(b) => `${b.name ?? ''} ${b.email ?? ''} ${b.phone ?? ''} ${b.vehicle_number ?? ''}`}
          filters={[
            ...(!isStore && !countryId ? [{ key: 'country_id', placeholder: 'All Countries', options: opts(countries, (c) => c.name) }] : []),
            ...(!isStore ? [{ key: 'zone_id', placeholder: 'All Zones', options: opts(zones.filter((z) => !countryId || z.country_id === countryId), (z) => z.name) }] : []),
            { key: 'approval_status', placeholder: 'All', options: [{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }] },
            { key: 'online', placeholder: 'Online: All', options: [{ value: '1', label: 'Online' }, { value: '0', label: 'Offline' }], test: (b, v) => (b.is_online ? '1' : '0') === v, className: '!min-w-[120px]' },
          ]}
          columns={[
            {
              key: 'name', header: 'Name', sort: 'name', render: (b) => (
                <div className="flex items-center gap-2.5">
                  <RiderAvatar boy={b} />
                  <div className="min-w-0">
                    <Link href={p(`/delivery-boys/view/${b.id}`)} className="font-medium whitespace-nowrap hover:text-primary">{b.name || 'Deleted user'}</Link>
                    <p className="text-xs text-muted">{zName[b.zone_id || ''] ?? 'No zone'}{b.rating_count ? ` · ★ ${Number(b.rating_avg || 0).toFixed(1)}` : ''}</p>
                  </div>
                </div>
              ),
            },
            { key: 'phone', header: 'Mobile', render: (b) => <span className="whitespace-nowrap">{b.phone || '—'}</span> },
            { key: 'email', header: 'Email', render: (b) => b.email || '—' },
            { key: 'address', header: 'Address', className: 'max-w-[180px] text-xs', render: (b) => <span className="line-clamp-2">{b.address || '—'}</span> },
            ...(!isStore && can('delivery_boy.update') ? [{
              key: 'bonus', header: 'Bonus', align: 'center' as const, render: (b: Rider) => (
                <button type="button" className="icon-btn mx-auto" title="Add bonus" onClick={() => setBonus({ boy: b, amount: '', credit: true })}><Gift className="w-4 h-4" /></button>
              ),
            }] : []),
            { key: 'cash_in_hand', header: 'Cash in Hand', sort: 'cash_in_hand', render: (b) => <span className={`font-semibold ${Number(b.cash_in_hand) > 0 ? 'text-red-500' : ''}`}>{money(b.cash_in_hand)}</span> },
            ...(isStore ? [] : [{ key: 'balance', header: 'Balance', render: (b: Rider) => <span className="font-semibold text-primary">{money(b.user?.wallet_balance)}</span> }]),
            { key: 'approval_status', header: 'Approval', sort: 'approval_status', render: (b) => <StatusPill status={b.approval_status || 'pending'} /> },
            { key: 'status', header: 'Status', sort: 'status', render: (b) => <StatusPill status={isActive(b.status)} /> },
            {
              key: 'actions', header: 'Actions', align: 'right', render: (b) => (
                <RowActions view={p(`/delivery-boys/view/${b.id}`)} edit={!isStore && can('delivery_boy.update') ? p(`/delivery-boys/edit/${b.id}`) : undefined}
                  onDelete={!isStore && can('delivery_boy.delete') ? () => del(b) : undefined} />
              ),
            },
          ]}
        />
      )}

      <Modal open={!!bonus} onClose={() => setBonus(null)} title="Add Bonus" size="md">
        {bonus && (
          <form onSubmit={addBonus} className="p-5 space-y-4">
            <p className="text-sm text-muted">Add a bonus for <span className="font-semibold text-navy dark:text-white">{bonus.boy.name}</span>.</p>
            <Input label="Bonus Amount" type="number" step="0.01" min={1} required value={bonus.amount} onChange={(e) => setBonus({ ...bonus, amount: e.target.value })} />
            <Toggle checked={bonus.credit} onChange={(v) => setBonus({ ...bonus, credit: v })} label="Credit to wallet now" description="Marks the bonus as paid and credits the delivery boy's wallet." />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-outline" onClick={() => setBonus(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} data-testid="add-bonus"><Gift className="w-4 h-4" /> {busy ? 'Saving…' : 'Add Bonus'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
