'use client';
// Wallet Transactions — port of admin/wallet-transactions/index.blade.php. collectionGroup('wallet_transactions'); user = parent users/{uid}.
// ?user=<uid> scopes to one user. "Add Transaction" → walletAdjust.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { ArrowDownLeft, ArrowUpRight, MinusCircle, Plus, PlusCircle, Scale, X } from 'lucide-react';
import { walletAdjust } from '@/lib/callables';
import { fetchList, limit, where, aggregateDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { UserDoc, WalletTxn } from '@/lib/types';
import { errMsg, fmtDateTime, money, statusLabel } from '@/lib/format';
import { cx, Forbidden, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { Input, SearchBox, Textarea } from '@/components/form/fields';
import { isDeleted, parentUid, UserCell, useUserMap } from './shared';

const PAYMENT_TYPES = ['admin', 'order', 'refund', 'cashback', 'referral', 'recharge', 'withdrawal', 'stripe', 'razorpay', 'paystack', 'paypal'];
type Txn = WalletTxn & { _path?: string };
const sumType = (type: string) => aggregateDocs('wallet_transactions', [where('type', '==', type)], { sum: { s: 'amount' } }, { group: true }).then((r) => Number(r.s || 0)).catch(() => 0);

/** Customer picker (search_keywords prefix search). */
function CustomerPicker({ value, onChange }: { value: UserDoc | null; onChange: (u: UserDoc | null) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<UserDoc[]>([]);
  useEffect(() => {
    const t = q.trim().toLowerCase().split(/\s+/)[0] || '';
    if (t.length < 2) { setRes([]); return; }
    const h = setTimeout(() => {
      fetchList<UserDoc>('users', where('search_keywords', 'array-contains', t.slice(0, 15)), limit(20))
        .then((r) => setRes(r.filter((u) => u.type === 'customer' && !isDeleted(u)).slice(0, 8))).catch(() => setRes([]));
    }, 300);
    return () => clearTimeout(h);
  }, [q]);
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-line dark:border-dark-line p-3">
        <UserCell user={value} sub={value.email || value.phone} />
        <button type="button" className="text-red-400 hover:text-red-600" onClick={() => onChange(null)}><X className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <SearchBox value={q} onChange={setQ} placeholder="Search customer name, email, phone" className="w-full" />
      {res.length > 0 && (
        <div className="absolute z-10 mt-1 w-full card max-h-64 overflow-y-auto shadow-lg">
          {res.map((u) => (
            <button key={u.id} type="button" className="block w-full text-left px-3 py-2 hover:bg-primary-50 border-b border-line last:border-0 dark:border-dark-line" onClick={() => { onChange(u); setQ(''); }}>
              <UserCell user={u} sub={u.email || u.phone} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WalletTransactionsPage() {
  const { can } = useAuth();
  const { p } = usePanel();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const userFilter = sp.get('user') || '';
  const [refreshKey, setRefreshKey] = useState(0);
  const [rows, setRows] = useState<Txn[]>([]);
  const users = useUserMap(rows.map((r) => parentUid(r._path)));
  const [totals, setTotals] = useState({ credit: 0, debit: 0 });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modal, setModal] = useState<{ user: UserDoc | null; type: 'credit' | 'debit'; amount: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { Promise.all([sumType('credit'), sumType('debit')]).then(([credit, debit]) => setTotals({ credit, debit })); }, [refreshKey]);
  if (!can('wallet.list')) return <Forbidden />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal?.user) { toast('Select a customer', 'error'); return; }
    const amount = Number(modal.amount);
    if (!(amount > 0)) { toast('Enter a valid amount', 'error'); return; }
    setBusy(true);
    try { await walletAdjust({ uid: modal.user.id, type: modal.type, amount, message: modal.message.trim() }); toast('Transaction added'); setModal(null); setRefreshKey((k) => k + 1); }
    catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Wallet Transactions">
        {userFilter && <button type="button" className="btn-outline" onClick={() => router.replace(p('/wallet-transactions'))}><X className="w-4 h-4" /> Clear user filter</button>}
        {can('wallet.update') && <button type="button" className="btn-primary" data-testid="add-transaction" onClick={() => setModal({ user: null, type: 'credit', amount: '', message: '' })}><Plus className="w-4 h-4" /> Add Transaction</button>}
      </PageHeader>
      <div className="grid gap-4 mb-5 sm:grid-cols-3">
        <StatCard label="Total Credited" value={money(totals.credit)} icon={ArrowDownLeft} color="green" />
        <StatCard label="Total Debited" value={money(totals.debit)} icon={ArrowUpRight} color="red" />
        <StatCard label="Net" value={money(totals.credit - totals.debit)} icon={Scale} color="blue" />
      </div>

      <DataTable<Txn>
        key={userFilter || 'all'} path={userFilter ? `users/${userFilter}/wallet_transactions` : 'wallet_transactions'} group={!userFilter}
        refreshKey={refreshKey} onRows={setRows} deps={[userFilter, from, to]}
        constraints={[
          ...(from ? [where('created_at', '>=', Timestamp.fromDate(new Date(from + 'T00:00:00')))] : []),
          ...(to ? [where('created_at', '<=', Timestamp.fromDate(new Date(to + 'T23:59:59')))] : []),
        ]}
        filters={[
          { key: 'type', placeholder: 'All Types', options: [{ value: 'credit', label: 'Credit' }, { value: 'debit', label: 'Debit' }] },
          { key: 'payment_type', placeholder: 'All Payment Types', options: PAYMENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) })) },
        ]}
        filterExtra={<>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-40 !py-2" title="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-40 !py-2" title="To" />
        </>}
        columns={[
          {
            key: 'user', header: 'User', render: (t) => {
              const uid = userFilter || parentUid(t._path); const u = users[uid];
              return u?.type === 'customer' ? <UserCell user={u} sub={uid} href={p(`/customers/view/${uid}`)} />
                : u?.type === 'delivery_boy' ? <UserCell user={u} sub="Delivery boy" href={p(`/delivery-boys/view/${uid}`)} />
                  : <UserCell user={u || { name: uid }} sub={u ? statusLabel(u.type) : undefined} />;
            },
          },
          { key: 'type', header: 'Type', render: (t) => <StatusPill status={t.type} /> },
          { key: 'payment_type', header: 'Payment Type', render: (t) => statusLabel(t.payment_type || '—') },
          { key: 'txn_id', header: 'Txn. ID', render: (t) => <span className="text-xs font-mono">{t.txn_id || '—'}</span> },
          { key: 'amount', header: 'Amount', render: (t) => <span className={cx('font-semibold whitespace-nowrap', t.type === 'credit' ? 'text-emerald-600' : 'text-red-500')}>{money(t.amount)}</span> },
          { key: 'order', header: 'Order', render: (t) => (t.order_id ? <Link href={p(`/orders/view/${t.order_id}`)} className="text-primary font-semibold">#{t.order_id}</Link> : '—') },
          { key: 'message', header: 'Message', className: 'max-w-[220px] text-xs', render: (t) => t.message || '—' },
          { key: 'created_at', header: 'Transaction Date', sort: 'created_at', render: (t) => <span className="whitespace-nowrap text-muted">{fmtDateTime(t.created_at)}</span> },
        ]}
      />

      <Modal open={!!modal} onClose={() => setModal(null)} title="Add Transaction" size="lg">
        {modal && (
          <form onSubmit={save} className="p-5 space-y-4">
            <div><span className="label">Customer <span className="text-red-500">*</span></span><CustomerPicker value={modal.user} onChange={(u) => setModal({ ...modal, user: u })} /></div>
            {modal.user && <p className="text-sm text-muted">Current balance: <b className="text-navy dark:text-white">{money(modal.user.wallet_balance)}</b></p>}
            <div>
              <span className="label">Type <span className="text-red-500">*</span></span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={cx('chip justify-center !py-2', modal.type === 'credit' && 'chip-active')} onClick={() => setModal({ ...modal, type: 'credit' })}><PlusCircle className="w-4 h-4" /> Credit</button>
                <button type="button" className={cx('chip justify-center !py-2', modal.type === 'debit' && '!bg-red-50 !border-red-400 !text-red-600')} onClick={() => setModal({ ...modal, type: 'debit' })}><MinusCircle className="w-4 h-4" /> Debit</button>
              </div>
            </div>
            <Input label="Amount" type="number" step="0.01" min={0.01} required value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
            <Textarea label="Message" rows={2} placeholder="Reason shown to the customer" value={modal.message} onChange={(e) => setModal({ ...modal, message: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-gray" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} data-testid="save">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
