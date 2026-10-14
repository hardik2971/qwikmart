'use client';
// Return request detail — port of admin/returns/show.blade.php (ReturnRequestController@show/update/assign/refund).
// All state changes go through the `processReturn` callable (action = target status). The doc is live.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BadgeCheck, Bike, Check, CircleX, ClipboardCheck, Package, PackageCheck, Save, ShoppingBag, Trash2, User, UserCheck } from 'lucide-react';
import { useDocQ, useLiveDoc, useStores } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { deleteReturn, processReturn } from '@/lib/callables';
import { fmtDate, fmtDateTime, imgUrl, money } from '@/lib/format';
import type { DeliveryBoy, Order, ReturnRequest, UserDoc } from '@/lib/types';
import { Card, Empty, Forbidden, Loading, PageHeader, StatusPill, cx } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { RETURN_STATUSES, paymentMethodLabel, useMaskPhone, useZoneRiders } from './shared';

const FLOW = ['pending', 'approved', 'pickup_assigned', 'picked_up', 'refund_completed'] as const;

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { p, storeId, country, isStore } = usePanel();
  const router = useRouter();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const mask = useMaskPhone();

  const { data: rr, loading } = useLiveDoc<ReturnRequest>('return_requests', id);
  const { data: order } = useLiveDoc<Order>('orders', rr?.order_id ?? null);
  const { data: user } = useDocQ<UserDoc>('users', rr?.user_id);
  const { data: rider } = useDocQ<DeliveryBoy>('delivery_boys', rr?.delivery_boy_id);
  const { data: riderUser } = useDocQ<UserDoc>('users', rr?.delivery_boy_id && rider && !rider.name ? rr.delivery_boy_id : null);
  const { data: stores = [] } = useStores();
  const canUpdate = can('return.update');
  const showAssign = !!rr && ['approved', 'pickup_assigned'].includes(rr.status) && canUpdate;
  const { data: riders = [], isLoading: ridersLoading } = useZoneRiders(order?.zone_id, showAssign);

  const item = order?.items?.find((i) => String(i.variant_id) === String(rr?.item_variant_id));
  const unit = item ? (item.sale_price != null && Number(item.sale_price) < Number(item.price) ? Number(item.sale_price) : Number(item.price)) : 0;
  const suggested = rr ? (Number(rr.refund_amount) > 0 ? Number(rr.refund_amount) : unit * rr.qty) : 0;

  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [remark, setRemark] = useState('');
  const [amount, setAmount] = useState('');
  const [refundAmt, setRefundAmt] = useState('');
  const [riderId, setRiderId] = useState('');
  const [method, setMethod] = useState<'wallet' | 'original'>('wallet');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!rr) return;
    setDecision(rr.status === 'rejected' ? 'rejected' : 'approved');
    setRemark(rr.admin_remark || '');
    setRiderId(rr.delivery_boy_id || '');
    setMethod(rr.refund_method === 'original' ? 'original' : 'wallet');
  }, [rr?.id, rr?.status, rr?.refund_method]);
  useEffect(() => { const v = suggested ? suggested.toFixed(2) : ''; setAmount(v); setRefundAmt(v); }, [rr?.id, rr?.status, suggested]);

  if (!can('return.list')) return <Forbidden />;
  if (loading) return <Loading />;
  if (!rr || (storeId && rr.store_id !== storeId)) return <div className="card"><Empty text="Return request not found." /></div>;

  const run = async (key: string, input: Parameters<typeof processReturn>[0], ok: string) => {
    setBusy(key);
    try { await processReturn(input); toast(ok); } catch (e: any) { toast(e?.message || 'Action failed', 'error'); }
    setBusy('');
  };
  const num = (v: string) => (v === '' || isNaN(Number(v)) ? undefined : Math.max(0, Number(v)));

  const saveDecision = async () => {
    if (decision === 'rejected' && !remark.trim()) { toast('Please add a remark for the rejection.', 'error'); return; }
    if (!(await confirm({ title: decision === 'approved' ? 'Approve this return?' : 'Reject this return?', danger: decision === 'rejected', confirmText: decision === 'approved' ? 'Approve' : 'Reject' }))) return;
    await run('decision', { return_id: rr.id, action: decision, remark: remark.trim() || undefined, refund_amount: decision === 'approved' ? num(amount) : undefined, refund_method: decision === 'approved' ? method : undefined }, `Return request ${decision}.`);
  };
  const assign = () => {
    if (!riderId) { toast('Select a delivery boy', 'error'); return; }
    return run('assign', { return_id: rr.id, action: 'pickup_assigned', delivery_boy_id: riderId }, 'Pickup delivery boy assigned.');
  };
  const pickedUp = async () => {
    if (!(await confirm({ title: 'Mark the item as picked up?', message: 'Stock will be restored for the returned quantity.', confirmText: 'Mark Picked Up' }))) return;
    await run('picked', { return_id: rr.id, action: 'picked_up' }, 'Return marked as picked up.');
  };
  const refund = async () => {
    const amt = num(refundAmt);
    if (!(await confirm({ title: 'Complete refund for this return?', message: `Refund ${money(amt ?? suggested)} via ${method === 'original' ? 'the original payment method' : 'the customer wallet'}.`, confirmText: 'Refund & Complete' }))) return;
    await run('refund', { return_id: rr.id, action: 'refund_completed', refund_amount: amt, refund_method: method }, `Refund of ${money(amt ?? suggested)} completed.`);
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this return request?', message: 'The order item becomes eligible again. This cannot be undone.', danger: true, confirmText: 'Delete' }))) return;
    setBusy('delete');
    try { await deleteReturn({ return_id: rr.id }); toast('Return request deleted.'); router.replace(p('/returns')); } catch (e: any) { toast(e?.message || 'Could not delete', 'error'); setBusy(''); }
  };
  const methodPicker = (
    <div>
      <label className="label">Refund Method</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={cx('chip justify-center', method === 'wallet' && 'chip-active')} onClick={() => setMethod('wallet')} data-testid="method-wallet">Wallet</button>
        <button type="button" className={cx('chip justify-center', method === 'original' && 'chip-active')} onClick={() => setMethod('original')} data-testid="method-original">Original payment</button>
      </div>
    </div>
  );

  const pos = FLOW.indexOf(rr.status as any);
  const store = stores.find((s) => s.id === (order?.store_id || rr.store_id));
  const riderName = rider?.name || riderUser?.name || (rr.delivery_boy_id ? 'Delivery Boy' : '');
  const riderPhone = rider?.phone || riderUser?.phone;
  const cur = country?.currency_symbol || '';

  return (
    <div>
      <PageHeader title={`Return ${rr.return_number || ''}`} subtitle={`Requested ${fmtDateTime(rr.created_at)}`} back={p('/returns')}>
        <StatusPill status={rr.status} label={RETURN_STATUSES[rr.status]} />
        {!isStore && canUpdate && ['pending', 'rejected'].includes(rr.status) && (
          <button type="button" className="btn-outline !text-red-500 !border-red-300" onClick={remove} disabled={busy === 'delete'} data-testid="delete-return"><Trash2 className="w-4 h-4" /> {busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
        )}
      </PageHeader>

      <div className="card p-5 mb-5">
        {rr.status === 'rejected' ? (
          <div className="flex items-center gap-2 text-red-600 font-semibold"><CircleX className="w-5 h-5" /> This return request was rejected.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {FLOW.map((st, i) => (
              <div key={st} className="flex items-center gap-2">
                <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold', pos >= 0 && i <= pos ? 'bg-primary text-white' : 'bg-slate-100 text-muted')}>
                  {pos >= 0 && i < pos ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                <span className={cx('text-sm', pos >= 0 && i <= pos ? 'font-semibold text-navy dark:text-white' : 'text-muted')}>{RETURN_STATUSES[st]}</span>
                {i < FLOW.length - 1 && <span className={cx('w-8 h-0.5', pos >= 0 && i < pos ? 'bg-primary' : 'bg-line')} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5 min-w-0">
          <Card title="Returned Product" icon={Package}>
            <div className="flex items-start gap-4">
              <img src={imgUrl(item?.image, item?.name || rr.item_name || 'Item')} className="w-20 h-20 rounded-xl object-cover border border-line bg-slate-50" alt="" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-navy dark:text-white">{item?.name || rr.item_name || 'Item removed'}</div>
                <div className="text-sm text-muted">{item?.variant_name}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <div><div className="text-muted text-xs">Unit Price</div><div className="font-semibold">{money(unit)}</div></div>
                  <div><div className="text-muted text-xs">Ordered Qty</div><div className="font-semibold">{item?.qty ?? '-'}</div></div>
                  <div><div className="text-muted text-xs">Return Qty</div><div className="font-semibold">{rr.qty}</div></div>
                  <div><div className="text-muted text-xs">Refund</div><div className="font-semibold text-primary">{money(rr.refund_amount)}</div></div>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <div className="label">Return Reason</div>
              <p className="text-sm bg-slate-50 dark:bg-dark-line rounded-xl p-3">{rr.reason || '-'}</p>
            </div>
            {rr.admin_remark && (
              <div className="mt-4">
                <div className="label">Admin Remark</div>
                <p className="text-sm bg-primary-50 dark:bg-dark-line rounded-xl p-3">{rr.admin_remark}</p>
              </div>
            )}
            {(rr.images ?? []).length > 0 && (
              <div className="mt-4">
                <div className="label">Images</div>
                <div className="flex flex-wrap gap-3">
                  {(rr.images ?? []).map((img, i) => (
                    <a key={i} href={imgUrl(img)} target="_blank" rel="noopener noreferrer"><img src={imgUrl(img)} className="w-24 h-24 rounded-xl object-cover border border-line hover:ring-2 hover:ring-primary" alt="" /></a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card title="Customer" icon={User}>
              <dl className="space-y-2 text-sm">
                <KVRow label="Name"><span className="font-semibold">{user?.name || order?.customer?.name || '-'}</span></KVRow>
                <KVRow label="Email">{user?.email || order?.customer?.email || '-'}</KVRow>
                <KVRow label="Mobile">{mask(user?.phone || order?.customer?.phone)}</KVRow>
                {user && <KVRow label="Wallet">{money(user.wallet_balance ?? 0)}</KVRow>}
              </dl>
            </Card>
            <Card title="Order" icon={ShoppingBag}>
              <dl className="space-y-2 text-sm">
                <KVRow label="Order No">{rr.order_id ? <Link href={p(`/orders/view/${rr.order_id}`)} className="font-semibold text-primary">{rr.order_number || order?.order_number || rr.order_id}</Link> : '-'}</KVRow>
                <KVRow label="Store">{store?.name || '-'}</KVRow>
                <KVRow label="Payment">{order ? paymentMethodLabel(order.payment_method) : '-'}</KVRow>
                <KVRow label="Delivered">{order?.delivered_at ? fmtDate(order.delivered_at) : '-'}</KVRow>
                <KVRow label="Refund Method">{rr.refund_method === 'original' ? 'Original' : 'Wallet'}</KVRow>
              </dl>
            </Card>
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          {['pending', 'approved'].includes(rr.status) && canUpdate && (
            <Card title="Review Request" icon={ClipboardCheck}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={cx('chip justify-center', decision === 'approved' && 'chip-active')} onClick={() => setDecision('approved')} data-testid="decision-approve">Approve</button>
                  <button type="button" className={cx('chip justify-center', decision === 'rejected' && 'chip-active')} onClick={() => setDecision('rejected')} data-testid="decision-reject">Reject</button>
                </div>
                {decision === 'approved' && (
                  <div>
                    <label className="label">Refund Amount</label>
                    <div className="relative">
                      {cur && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{cur}</span>}
                      <input type="number" step="0.01" min="0" className={cx('input', cur && '!pl-8')} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                  </div>
                )}
                {decision === 'approved' && methodPicker}
                <div>
                  <label className="label">Remark{decision === 'rejected' && <span className="text-red-500"> *</span>}</label>
                  <textarea className="input" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={500} />
                </div>
                <button type="button" className="btn-primary w-full justify-center" onClick={saveDecision} disabled={busy === 'decision'} data-testid="save-decision">
                  <Save className="w-4 h-4" /> {busy === 'decision' ? 'Saving…' : 'Save Decision'}
                </button>
              </div>
            </Card>
          )}

          {showAssign ? (
            <Card title="Pickup Delivery Boy" icon={Bike}>
              {rr.delivery_boy_id && <p className="text-sm mb-3">Assigned: <b>{riderName}</b> <span className="text-muted">{mask(riderPhone)}</span></p>}
              <div className="space-y-3">
                <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)} data-testid="pickup-rider-select">
                  <option value="">{ridersLoading ? 'Loading…' : 'Select delivery boy'}</option>
                  {rr.delivery_boy_id && !riders.some((r) => r.id === rr.delivery_boy_id) && <option value={rr.delivery_boy_id}>{riderName}</option>}
                  {riders.map((r) => <option key={r.id} value={r.id}>{r.name} {r.is_online ? '(Online)' : '(Offline)'}</option>)}
                </select>
                {!ridersLoading && !riders.length && <p className="text-xs text-amber-600">No approved &amp; active delivery boys in this zone.</p>}
                <button type="button" className="btn-primary w-full justify-center" onClick={assign} disabled={!riderId || busy === 'assign'} data-testid="assign-pickup">
                  <UserCheck className="w-4 h-4" /> {busy === 'assign' ? 'Assigning…' : 'Assign Pickup'}
                </button>
                {rr.status === 'pickup_assigned' && (
                  <button type="button" className="btn-soft w-full justify-center" onClick={pickedUp} disabled={busy === 'picked'} data-testid="mark-picked-up">
                    <PackageCheck className="w-4 h-4" /> {busy === 'picked' ? 'Updating…' : 'Mark Picked Up'}
                  </button>
                )}
              </div>
            </Card>
          ) : rr.delivery_boy_id ? (
            <Card title="Pickup Delivery Boy" icon={Bike}>
              <p className="text-sm"><b>{riderName}</b> <span className="text-muted">{mask(riderPhone)}</span></p>
            </Card>
          ) : null}

          {['approved', 'pickup_assigned', 'picked_up'].includes(rr.status) && canUpdate && (
            <Card title="Complete Refund" icon={BadgeCheck}>
              <div className="space-y-3">
                <div>
                  <label className="label">Amount</label>
                  <div className="relative">
                    {cur && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{cur}</span>}
                    <input type="number" step="0.01" min="0" className={cx('input', cur && '!pl-8')} value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} data-testid="refund-amount" />
                  </div>
                </div>
                {methodPicker}
                <p className="text-xs text-muted">
                  {method === 'original'
                    ? 'Refund to the original payment method must be processed in the gateway; this marks the return completed and restores stock.'
                    : "The amount will be credited to the customer's wallet, the item marked returned and stock restored."}
                </p>
                <button type="button" className="btn-primary w-full justify-center" onClick={refund} disabled={busy === 'refund'} data-testid="refund">
                  <BadgeCheck className="w-4 h-4" /> {busy === 'refund' ? 'Processing…' : 'Refund & Complete'}
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;
}
