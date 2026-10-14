'use client';
// Delivery Boy Approvals — port of admin/delivery-boys/approvals.blade.php. approveDeliveryBoy({uid, approve, remark}).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Eye, UserCheck, X } from 'lucide-react';
import { approveDeliveryBoy } from '@/lib/callables';
import { useCountries, useZones, where, countDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { cx, Avatar, Empty, Forbidden, PageHeader, Spinner, StatusPill } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { SearchBox, Textarea } from '@/components/form/fields';
import { errMsg, fmtDate, statusLabel } from '@/lib/format';
import { useAll } from '@/modules/locations/LocalTable';
import { loadRiders, RiderDocuments, type Rider } from './shared';

type St = 'pending' | 'rejected' | 'approved';
const TABS: { key: St; label: string }[] = [{ key: 'pending', label: 'Pending' }, { key: 'rejected', label: 'Rejected' }, { key: 'approved', label: 'Approved' }];

export default function DeliveryBoyApprovalsPage() {
  const { can } = useAuth();
  const { p } = usePanel();
  const toast = useToast();
  const { data: zones = [] } = useZones();
  const { data: countries = [] } = useCountries();
  const [status, setStatus] = useState<St>('pending');
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const { rows, loading, error, reload } = useAll(() => loadRiders(where('approval_status', '==', status)), [status, tick]);
  const [reject, setReject] = useState<{ boy: Rider; remark: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all(TABS.map((t) => countDocs('delivery_boys', [where('approval_status', '==', t.key)]).then((c) => [t.key, c] as const).catch(() => [t.key, 0] as const)))
      .then((r) => setCounts(Object.fromEntries(r)));
  }, [tick]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((b) => `${b.name} ${b.email} ${b.phone}`.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  if (!can('delivery_boy.list')) return <Forbidden />;
  const zName = (id?: string) => zones.find((z) => z.id === id)?.name || '—';
  const cName = (id?: string) => countries.find((c) => c.id === id)?.name || '—';

  const decide = async (boy: Rider, approve: boolean, remark?: string) => {
    setBusy(boy.id);
    try {
      await approveDeliveryBoy({ uid: boy.id, approve, remark: remark || undefined });
      toast(approve ? `${boy.name || 'Delivery boy'} approved` : 'Application rejected');
      setReject(null); setTick((t) => t + 1); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };

  return (
    <div>
      <PageHeader title="Delivery Boy Approvals" subtitle="Review new delivery partner registrations and their documents." back={p('/delivery-boys')} />
      <div className="card mb-5">
        <div className="flex flex-wrap items-center gap-2 p-4">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={cx('tab', status === t.key && 'tab-active')} onClick={() => setStatus(t.key)}>
              {t.label} <span className={cx('pill', status === t.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500')}>{counts[t.key] ?? 0}</span>
            </button>
          ))}
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Search name, email, phone" className="w-64" /></div>
        </div>
      </div>

      {loading ? <div className="py-14 flex justify-center"><Spinner /></div> : error ? <Empty text={error} /> : !list.length ? (
        <div className="card p-14 text-center text-muted"><UserCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />No {status} delivery boys.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {list.map((b) => (
            <div key={b.id} className="card p-4 flex flex-col" data-testid={`approval-${b.id}`}>
              <div className="flex items-start gap-3">
                <Avatar src={b.avatar} name={b.name} className="w-12 h-12" />
                <div className="min-w-0 flex-1">
                  <Link href={p(`/delivery-boys/view/${b.id}`)} className="font-bold text-navy dark:text-white hover:text-primary">{b.name || '—'}</Link>
                  <p className="text-xs text-muted truncate">{b.email}</p>
                  <p className="text-xs text-muted">{b.phone}</p>
                </div>
                <StatusPill status={b.approval_status || 'pending'} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted">Zone:</span> <span className="font-medium">{zName(b.zone_id)}</span></div>
                <div><span className="text-muted">Country:</span> <span className="font-medium">{cName(b.country_id)}</span></div>
                <div><span className="text-muted">Vehicle:</span> <span className="font-medium">{[b.vehicle_type ? statusLabel(b.vehicle_type) : '', b.vehicle_number].filter(Boolean).join(' ') || '—'}</span></div>
                <div><span className="text-muted">Applied:</span> <span className="font-medium">{fmtDate(b.created_at)}</span></div>
              </div>
              <div className="mt-3"><RiderDocuments boy={b} /></div>
              <div className="mt-4 pt-3 border-t border-line dark:border-dark-line flex flex-wrap justify-end gap-2">
                <Link href={p(`/delivery-boys/view/${b.id}`)} className="btn-outline btn-sm"><Eye className="w-3.5 h-3.5" /> View</Link>
                {can('delivery_boy.update') && b.approval_status !== 'rejected' && (
                  <button type="button" className="btn-outline btn-sm !text-red-500 !border-red-300" onClick={() => setReject({ boy: b, remark: '' })}><X className="w-3.5 h-3.5" /> Reject</button>
                )}
                {can('delivery_boy.update') && b.approval_status !== 'approved' && (
                  <button type="button" className="btn-primary btn-sm" disabled={busy === b.id} onClick={() => decide(b, true)} data-testid="approve"><Check className="w-3.5 h-3.5" /> {busy === b.id ? 'Approving…' : 'Approve'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject Delivery Boy" size="md">
        {reject && (
          <form onSubmit={(e) => { e.preventDefault(); decide(reject.boy, false, reject.remark); }} className="p-5 space-y-4">
            <p className="text-sm text-muted">Reject the application of <span className="font-semibold text-navy dark:text-white">{reject.boy.name}</span>? They will be notified.</p>
            <Textarea label="Reason (sent to the delivery boy)" rows={3} value={reject.remark} onChange={(e) => setReject({ ...reject, remark: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setReject(null)}>Cancel</button>
              <button className="btn-danger" disabled={busy === reject.boy.id} data-testid="reject"><X className="w-4 h-4" /> Reject</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
