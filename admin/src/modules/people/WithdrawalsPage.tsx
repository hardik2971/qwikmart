'use client';
// Withdrawal Requests — port of admin/withdrawals/index.blade.php. ?type=delivery_boy|customer.
// Approve / reject → processWithdrawal({id, approve, remark, receipt_image}); afterwards remark / receipt → updateWithdrawal.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Check, CheckCheck, Eye, Hourglass, MessageSquareText, Repeat, Save, Undo2, X } from 'lucide-react';
import { processWithdrawal, updateWithdrawal } from '@/lib/callables';
import { fetchDoc, where, aggregateDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { DeliveryBoy, WithdrawalRequest } from '@/lib/types';
import { errMsg, fmtDateTime, imgUrl, money } from '@/lib/format';
import { cx, Forbidden, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { ImageUpload, Textarea } from '@/components/form/fields';
import { UserCell, useUserMap } from './shared';

const agg = (type: string, status: string) =>
  aggregateDocs('withdrawal_requests', [where('user_type', '==', type), where('status', '==', status)], { sum: { s: 'amount' } })
    .then((r) => ({ s: Number(r.s || 0), n: r.count })).catch(() => ({ s: 0, n: 0 }));

export default function WithdrawalsPage() {
  const { can } = useAuth();
  const { p } = usePanel();
  const toast = useToast();
  const sp = useSearchParams();
  const type: 'customer' | 'delivery_boy' = sp.get('type') === 'customer' ? 'customer' : 'delivery_boy';
  const title = type === 'customer' ? 'Customer Withdrawal Requests' : 'Delivery Boy Withdrawal Requests';
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState({ pending: { s: 0, n: 0 }, approved: { s: 0, n: 0 }, rejected: { s: 0, n: 0 } });
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const users = useUserMap(rows.map((r) => r.user_id));
  const [sel, setSel] = useState<{ w: WithdrawalRequest; approve: boolean; remark: string; receipt: string; bank?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([agg(type, 'pending'), agg(type, 'approved'), agg(type, 'rejected')]).then(([pending, approved, rejected]) => setSummary({ pending, approved, rejected }));
  }, [type, refreshKey]);

  if (!can('withdrawal.list')) return <Forbidden />;

  const open = async (w: WithdrawalRequest) => {
    setSel({ w, approve: true, remark: w.remark || '', receipt: w.receipt_image || '' });
    if (w.user_type === 'delivery_boy') {
      const b = await fetchDoc<DeliveryBoy>('delivery_boys', w.user_id).catch(() => null);
      const bank = b?.bank ? [b.bank.name, b.bank.account, b.bank.ifsc].filter(Boolean).join(' · ') : '';
      if (bank) setSel((s) => (s && s.w.id === w.id ? { ...s, bank } : s));
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel) return;
    if (sel.w.status !== 'pending') {
      if (!can('withdrawal.update')) { setSel(null); return; }
      setBusy(true);
      try {
        await updateWithdrawal({ id: sel.w.id, remark: sel.remark.trim() || null, receipt_image: sel.receipt || null });
        toast('Withdrawal request updated.');
        setSel(null); setRefreshKey((k) => k + 1);
      } catch (err) { toast(errMsg(err), 'error'); }
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      await processWithdrawal({ id: sel.w.id, approve: sel.approve, remark: sel.remark.trim() || undefined, receipt_image: sel.receipt || undefined });
      toast(sel.approve ? 'Withdrawal approved' : 'Withdrawal rejected — amount refunded to wallet');
      setSel(null); setRefreshKey((k) => k + 1);
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };
  const userHref = (w: WithdrawalRequest) => (w.user_type === 'customer' ? p(`/customers/view/${w.user_id}`) : p(`/delivery-boys/view/${w.user_id}`));

  return (
    <div>
      <PageHeader title={title}>
        <Link href={p(`/withdrawals?type=${type === 'customer' ? 'delivery_boy' : 'customer'}`)} className="btn-outline"><Repeat className="w-4 h-4" /> {type === 'customer' ? 'Delivery boy requests' : 'Customer requests'}</Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        <StatCard label={`Pending (${summary.pending.n})`} value={money(summary.pending.s)} icon={Hourglass} color="orange" />
        <StatCard label="Approved" value={money(summary.approved.s)} icon={BadgeCheck} color="green" />
        <StatCard label="Rejected (refunded)" value={money(summary.rejected.s)} icon={Undo2} color="red" />
      </div>

      <DataTable<WithdrawalRequest>
        key={type} path="withdrawal_requests" constraints={[where('user_type', '==', type)]} deps={[type]} refreshKey={refreshKey} onRows={setRows}
        filters={[{ key: 'status', placeholder: 'Select Status', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] }]}
        columns={[
          { key: 'name', header: 'Name', render: (w) => { const u = users[w.user_id]; return <UserCell user={{ name: u?.name || w.user_name, avatar: u?.avatar }} sub={u?.email} href={userHref(w)} />; } },
          { key: 'amount', header: 'Amount', render: (w) => <span className="font-bold">{money(w.amount)}</span> },
          { key: 'message', header: 'Message', align: 'center', render: (w) => (w.message ? <span className="icon-btn mx-auto cursor-help" title={w.message}><MessageSquareText className="w-4 h-4" /></span> : '—') },
          { key: 'status', header: 'Status', render: (w) => <StatusPill status={w.status} /> },
          { key: 'remark', header: 'Remark', className: 'text-xs max-w-[180px]', render: (w) => w.remark || '—' },
          { key: 'receipt', header: 'Receipt Image', render: (w) => (w.receipt_image ? <a href={imgUrl(w.receipt_image)} target="_blank" rel="noreferrer"><img src={imgUrl(w.receipt_image)} className="w-12 h-10 rounded object-cover border border-line" alt="" /></a> : '—') },
          { key: 'created_at', header: 'Date', sort: 'created_at', render: (w) => <span className="text-xs text-muted whitespace-nowrap">{fmtDateTime(w.created_at)}{w.processed_at && <span className="block">Processed {fmtDateTime(w.processed_at)}</span>}</span> },
          {
            key: 'actions', header: 'Actions', align: 'right', render: (w) => (
              <div className="flex justify-end gap-1.5">
                <button type="button" className={cx('icon-btn', w.status === 'pending' && '!text-primary !border-primary/40')} title={w.status === 'pending' ? 'Process' : 'View'}
                  onClick={() => open(w)} data-testid={`process-${w.id}`} disabled={w.status === 'pending' && !can('withdrawal.update')}>
                  {w.status === 'pending' ? <CheckCheck className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!sel} onClose={() => setSel(null)} title="Withdrawal Request" size="lg">
        {sel && (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted">Request</span><span className="font-semibold">#{sel.w.id}</span></div>
              <div className="flex justify-between"><span className="text-muted">Name</span><span className="font-semibold">{users[sel.w.user_id]?.name || sel.w.user_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Amount</span><span className="font-extrabold text-primary">{money(sel.w.amount)}</span></div>
              {sel.bank && <div className="flex justify-between gap-4"><span className="text-muted">Bank</span><span className="font-medium text-right">{sel.bank}</span></div>}
              {sel.w.message && <div><span className="text-muted">Message:</span> {sel.w.message}</div>}
              {sel.w.status !== 'pending' && <div className="flex justify-between"><span className="text-muted">Status</span><StatusPill status={sel.w.status} /></div>}
            </div>
            {sel.w.status === 'pending' ? (
              <>
                <div>
                  <label className="label">Decision</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={cx('chip justify-center !py-2', sel.approve && 'chip-active')} onClick={() => setSel({ ...sel, approve: true })}><Check className="w-4 h-4" /> Approve</button>
                    <button type="button" className={cx('chip justify-center !py-2', !sel.approve && '!bg-red-50 !border-red-400 !text-red-600')} onClick={() => setSel({ ...sel, approve: false })}><X className="w-4 h-4" /> Reject</button>
                  </div>
                  {!sel.approve && <p className="mt-2 text-xs text-muted">The held amount will be refunded to the user's wallet.</p>}
                </div>
                <Textarea label="Remark" rows={2} placeholder="e.g. Money transferred via bank transfer" value={sel.remark} onChange={(e) => setSel({ ...sel, remark: e.target.value })} />
                <ImageUpload label="Receipt Image (optional)" folder="withdrawal_receipts" value={sel.receipt} onChange={(u) => setSel({ ...sel, receipt: u })} square={false} />
              </>
            ) : can('withdrawal.update') ? (
              <>
                <Textarea label="Remark" rows={2} value={sel.remark} onChange={(e) => setSel({ ...sel, remark: e.target.value })} />
                <ImageUpload label="Receipt Image" folder="withdrawal_receipts" value={sel.receipt} onChange={(u) => setSel({ ...sel, receipt: u })} square={false} />
              </>
            ) : (
              <>
                <div className="text-sm"><span className="text-muted">Remark:</span> {sel.w.remark || '—'}</div>
                {sel.w.receipt_image && <a href={imgUrl(sel.w.receipt_image)} target="_blank" rel="noreferrer"><img src={imgUrl(sel.w.receipt_image)} className="w-40 rounded-lg border border-line" alt="Receipt" /></a>}
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setSel(null)}>{sel.w.status === 'pending' || can('withdrawal.update') ? 'Cancel' : 'Close'}</button>
              {sel.w.status !== 'pending' && can('withdrawal.update') && <button className="btn-primary" disabled={busy} data-testid="save-update"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Update'}</button>}
              {sel.w.status === 'pending' && <button className={sel.approve ? 'btn-primary' : 'btn-danger'} disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save'}</button>}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
