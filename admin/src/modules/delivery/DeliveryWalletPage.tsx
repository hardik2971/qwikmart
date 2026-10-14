'use client';
// Wallet & Withdrawals — port of delivery/wallet/index.blade.php.
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ArrowUpRight, BadgeCheck, Hourglass, Inbox, Send, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { q, useLiveQuery, where, orderBy, limit } from '@/lib/firestore';
import { walletWithdraw } from '@/lib/callables';
import { errMsg, fmtDate, fmtDateTime, imgUrl, money, statusLabel } from '@/lib/format';
import type { DeliveryBoy, WalletTxn, WithdrawalRequest } from '@/lib/types';
import { Card, Loading, PageHeader, StatCard, cx } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { RiderGate } from './shared';

export default function DeliveryWalletPage() {
  return <RiderGate>{(r) => <WalletView uid={r.uid} boy={r.boy} />}</RiderGate>;
}

function WalletView({ uid, boy }: { uid: string; boy: DeliveryBoy }) {
  const { profile } = useAuth();
  const { p, settings } = usePanel();
  const toast = useToast();
  const balance = Number(profile?.wallet_balance || 0);
  const minWithdraw = Number(settings?.wallet?.min_withdraw || 0);
  const wd = useLiveQuery<WithdrawalRequest>(q('withdrawal_requests', where('user_id', '==', uid), orderBy('created_at', 'desc'), limit(100)), [uid]);
  const tx = useLiveQuery<WalletTxn>(q(`users/${uid}/wallet_transactions`, orderBy('created_at', 'desc'), limit(100)), [uid]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const pending = wd.data.filter((w) => w.status === 'pending').reduce((s, w) => s + Number(w.amount || 0), 0);
  const withdrawn = wd.data.filter((w) => w.status === 'approved').reduce((s, w) => s + Number(w.amount || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
    if (minWithdraw && amt < minWithdraw) { toast(`Minimum withdrawal is ${money(minWithdraw)}`, 'error'); return; }
    if (amt > balance) { toast('Amount exceeds your wallet balance', 'error'); return; }
    setBusy(true);
    try {
      await walletWithdraw({ amount: amt, message: message.trim() || undefined });
      toast('Withdrawal request submitted');
      setOpen(false); setAmount(''); setMessage('');
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  const acct = boy.bank?.account || '';
  return (
    <div>
      <PageHeader title="Wallet & Withdrawals" subtitle="Your wallet balance, payout requests and transactions" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="card p-5 flex flex-wrap items-center gap-4">
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-primary text-white flex items-center justify-center"><Wallet className="w-7 h-7" /></span>
          <div className="flex-1 min-w-[8rem]">
            <p className="text-sm text-muted">Available Balance</p>
            <p className="text-3xl font-extrabold text-navy dark:text-white leading-tight">{money(balance)}</p>
          </div>
          <button type="button" className="btn rounded-full bg-navy text-white hover:bg-navy/90 px-5 py-2.5 text-sm font-semibold dark:bg-white dark:text-navy" onClick={() => setOpen(true)} data-testid="withdraw">
            <ArrowUpRight className="w-4 h-4" /> Withdraw
          </button>
        </div>
        <StatCard label="Pending Withdrawals" value={money(pending)} icon={Hourglass} color="orange" />
        <StatCard label="Total Withdrawn" value={money(withdrawn)} icon={BadgeCheck} color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Card title="Withdrawal Requests" icon={Send} className="xl:col-span-2" padding={false}>
          {wd.loading ? <Loading /> : (
            <div className="divide-y divide-line dark:divide-dark-line">
              {wd.data.map((w) => (
                <div key={w.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted">Request ID #{w.id.slice(0, 8)}</p>
                    <p className="text-lg font-extrabold text-navy dark:text-white leading-tight">{money(w.amount)}</p>
                    <p className={cx('text-xs font-semibold', w.status === 'approved' ? 'text-primary' : w.status === 'rejected' ? 'text-red-500' : 'text-amber-600')}>{statusLabel(w.status)}</p>
                    {w.remark && <p className="text-xs text-muted mt-0.5">Remark: {w.remark}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">{fmtDate(w.created_at)}</p>
                    {w.receipt_image && <a href={imgUrl(w.receipt_image)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">View receipt</a>}
                  </div>
                </div>
              ))}
              {!wd.data.length && <div className="py-12 text-center text-muted text-sm flex flex-col items-center gap-2"><Inbox className="w-8 h-8 text-slate-300" />{wd.error ? 'Could not load withdrawal requests.' : 'No withdrawal requests yet.'}</div>}
            </div>
          )}
        </Card>

        <Card title="Wallet Transactions" icon={ArrowLeftRight} className="xl:col-span-3" padding={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Txn</th><th>Details</th><th>Amount</th><th>Balance</th><th>Date</th></tr></thead>
              <tbody>
                {tx.data.map((t) => (
                  <tr key={t.id}>
                    <td className="text-xs text-muted whitespace-nowrap">{t.txn_id || t.id.slice(0, 8)}</td>
                    <td>
                      <p className="font-medium text-navy dark:text-white">{t.message || statusLabel(t.payment_type)}</p>
                      {t.order_id && <p className="text-xs text-muted">{t.order_id}</p>}
                    </td>
                    <td className={cx('font-bold whitespace-nowrap', t.type === 'credit' ? 'text-primary' : 'text-red-500')}>{t.type === 'credit' ? '+' : '-'}{money(t.amount)}</td>
                    <td className="whitespace-nowrap">{t.balance_after != null ? money(t.balance_after) : '-'}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(t.created_at)}</td>
                  </tr>
                ))}
                {!tx.data.length && <tr><td colSpan={5} className="!py-12 text-center text-muted">{tx.loading ? 'Loading…' : tx.error ? 'Could not load transactions.' : 'No wallet transactions yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Withdraw Money" size="md">
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="rounded-xl bg-primary-50 border border-primary/30 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-primary-dark">Available balance</span>
            <span className="font-extrabold text-primary-dark">{money(balance)}</span>
          </div>
          <Input label="Amount" type="number" step="0.01" min={minWithdraw || 1} max={balance || undefined} prefix={money(0).replace(/[\d.,\s]/g, '')} required
            value={amount} onChange={(e) => setAmount(e.target.value)}
            hint={`Minimum withdrawal ${money(minWithdraw)}. The amount is held until the admin processes your request.`} data-testid="withdraw-amount" />
          <Textarea label="Message (optional)" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-muted">
            {acct ? <>Payout to <b className="text-navy dark:text-white">{boy.bank?.name || 'Bank'}</b> · A/C ****{acct.slice(-4)} · {boy.bank?.ifsc || ''}</>
              : <>No bank account on your profile. <Link href={p('/profile')} className="text-primary font-semibold">Add bank details</Link></>}
          </div>
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy || balance <= 0} data-testid="request-withdrawal"><Send className="w-4 h-4" /> Request Withdrawal</button>
        </form>
      </Modal>
    </div>
  );
}
