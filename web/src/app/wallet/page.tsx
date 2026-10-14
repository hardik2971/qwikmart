'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, Banknote, Plus, Wallet as WalletIcon } from 'lucide-react';
import { api, isUsingMock } from '@/lib/api';
import { payWalletRecharge, resumeWalletRecharge } from '@/lib/payments';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import { useCurrency, useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { EmptyState, Modal, Spinner, StatusPill } from '@/components/ui';
import { PAYMENT_BRANDS, PaymentLogo } from '@/components/icons';
import { useSettings } from '@/components/layout/TopBar';

const RECHARGE_GATEWAYS: PaymentMethod[] = ['razorpay', 'paystack', 'stripe', 'phonepe', 'paypal', 'cashfree'];

export default function WalletPage() {
  const authed = useIsAuthed();
  const qc = useQueryClient();
  const { fmt } = useCurrency();
  const [tab, setTab] = useState<'history' | 'withdrawals'>('history');
  const [recharge, setRecharge] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [amount, setAmount] = useState('500');
  const settings = useSettings();
  // online gateways enabled in admin settings (COD / wallet cannot fund a wallet); mock mode shows the demo list
  const enabledOnline = (settings.data?.payment_gateways || [])
    .filter((g) => g.enabled && g.key !== 'cod' && g.key !== 'wallet')
    .map((g) => g.key as PaymentMethod);
  const rechargeGateways = isUsingMock() ? RECHARGE_GATEWAYS : enabledOnline;
  const [gwPick, setGw] = useState<PaymentMethod | null>(null);
  const gw = gwPick && rechargeGateways.includes(gwPick) ? gwPick : rechargeGateways[0];
  const [wAmount, setWAmount] = useState('');
  const [wMsg, setWMsg] = useState('');

  const wallet = useQuery({ queryKey: ['wallet', 1], queryFn: () => api.wallet(1), enabled: authed });

  // back from a redirect gateway (Paystack / PayPal / PhonePe …): verify the pending recharge
  useEffect(() => {
    if (!authed || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('recharge_return')) return;
    window.history.replaceState(null, '', '/wallet');
    resumeWalletRecharge(params)
      .then((msg) => {
        if (msg) toast.success(msg);
        qc.invalidateQueries({ queryKey: ['wallet'] });
      })
      .catch((e) => toast.error(errorMessage(e)));
  }, [authed, qc]);
  const withdrawals = useQuery({ queryKey: ['withdrawals'], queryFn: api.withdrawals, enabled: authed && tab === 'withdrawals' });

  const doRecharge = useMutation({
    mutationFn: async () => {
      if (!gw) throw new Error('No online payment method is enabled for wallet recharge');
      const res = await api.rechargeWallet(Number(amount), gw);
      if (res.completed) return true; // demo mock credits instantly
      // Firebase: gateway hand-off (redirect / Razorpay / Stripe …) then verifyWalletRecharge
      return payWalletRecharge(res.payment, res.recharge_id);
    },
    onSuccess: (done) => {
      if (!done) return; // redirected to the gateway
      toast.success(`${fmt(Number(amount))} added to wallet`);
      setRecharge(false);
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const doWithdraw = useMutation({
    mutationFn: () => api.withdraw(Number(wAmount), wMsg),
    onSuccess: () => {
      toast.success('Withdrawal request submitted');
      setWithdraw(false);
      setWAmount('');
      setWMsg('');
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <AccountShell title="My Wallet">
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary to-primary-dark p-6 text-white shadow-card">
          <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 end-24 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-btn bg-white/15">
                <WalletIcon className="h-7 w-7" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/80">Available Balance</div>
                <div className="text-3xl font-extrabold">{wallet.isLoading ? '…' : fmt(wallet.data?.balance ?? 0)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWithdraw(true)} className="btn border border-white/40 text-white hover:bg-white/10">
                <Banknote className="h-4 w-4" /> Withdraw
              </button>
              <button onClick={() => setRecharge(true)} className="btn bg-white text-primary hover:bg-white/90">
                <Plus className="h-4 w-4" /> Recharge Wallet
              </button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex gap-6 border-b border-line">
            {(['history', 'withdrawals'] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={clsx('-mb-px border-b-2 pb-3 text-sm font-semibold capitalize', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted')}>
                {k === 'history' ? 'Wallet History' : 'Withdrawal Requests'}
              </button>
            ))}
          </div>

          {tab === 'history' ? (
            <>
              {wallet.isLoading && <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>}
              {wallet.data?.transactions.length === 0 && <EmptyState icon={<WalletIcon className="h-9 w-9" />} title="No transactions yet" />}
              <div className="grid gap-3 md:grid-cols-2">
                {wallet.data?.transactions.map((tx) => (
                  <div key={tx.id} className="rounded-card border border-line p-4">
                    <div className="flex items-start gap-3">
                      <PaymentLogo method={tx.payment_type} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold capitalize text-ink">{PAYMENT_BRANDS[tx.payment_type]?.name || tx.payment_type}</span>
                          <StatusPill
                            label={tx.type.toUpperCase()}
                            className={tx.type === 'credit' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}
                          />
                        </div>
                        <div className="text-xs text-muted">{tx.txn_id ? `TXN ID: ${tx.txn_id}` : tx.order_id ? `Order ID #${tx.order_id}` : ''}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <div className="text-xs">{tx.message}</div>
                        <div className="text-[11px] text-muted">{formatDate(tx.created_at)}</div>
                      </div>
                      <span className={clsx('flex items-center gap-0.5 text-base font-extrabold', tx.type === 'credit' ? 'text-primary' : 'text-danger')}>
                        {tx.type === 'credit' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        {tx.type === 'credit' ? '+' : '−'}
                        {fmt(tx.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {withdrawals.isLoading && <div className="skeleton h-20" />}
              {withdrawals.data?.length === 0 && <EmptyState icon={<Banknote className="h-9 w-9" />} title="No withdrawal requests" />}
              {withdrawals.data?.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-btn border border-line p-3">
                  <div>
                    <div className="font-semibold text-ink">{fmt(w.amount)}</div>
                    <div className="text-xs text-muted">{w.message || 'Withdrawal'} · {formatDate(w.created_at)}</div>
                  </div>
                  <StatusPill
                    label={w.status}
                    className={clsx('capitalize', w.status === 'approved' ? 'bg-green-50 text-green-700' : w.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={recharge} onClose={() => setRecharge(false)} title="Recharge Wallet" size="sm">
        <label className="label">Amount</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="input text-lg font-bold" inputMode="decimal" />
        <div className="mt-2 flex gap-2">
          {[100, 500, 1000, 2000].map((a) => (
            <button key={a} onClick={() => setAmount(String(a))} className={clsx('chip py-1 text-xs', amount === String(a) && 'chip-active')}>
              +{fmt(a)}
            </button>
          ))}
        </div>
        <label className="label mt-4">Pay with</label>
        <div className="grid grid-cols-2 gap-2">
          {rechargeGateways.length === 0 && (
            <p className="col-span-2 rounded-btn bg-soft p-3 text-xs text-muted">Online payments are not configured yet. Please try again later.</p>
          )}
          {rechargeGateways.map((g) => (
            <button key={g} onClick={() => setGw(g)} className={clsx('flex items-center gap-2 rounded-btn border p-2 text-sm font-semibold text-ink', gw === g ? 'border-primary bg-primary-50 dark:bg-primary/10' : 'border-line')}>
              <PaymentLogo method={g} size={26} /> {PAYMENT_BRANDS[g]?.name || g}
            </button>
          ))}
        </div>
        <button onClick={() => doRecharge.mutate()} disabled={!Number(amount) || !gw || doRecharge.isPending} className="btn-primary mt-5 w-full py-3">
          {doRecharge.isPending && <Spinner />} Add {fmt(Number(amount) || 0)}
        </button>
      </Modal>

      <Modal open={withdraw} onClose={() => setWithdraw(false)} title="Withdraw Money" size="sm">
        <p className="mb-3 text-sm text-muted">Available: <b className="text-ink">{fmt(wallet.data?.balance ?? 0)}</b></p>
        <label className="label">Amount</label>
        <input value={wAmount} onChange={(e) => setWAmount(e.target.value.replace(/[^\d.]/g, ''))} className="input" inputMode="decimal" />
        <label className="label mt-3">Message / bank details</label>
        <textarea value={wMsg} onChange={(e) => setWMsg(e.target.value)} rows={3} className="input" placeholder="e.g. Transfer to HDFC ****1234" />
        <button onClick={() => doWithdraw.mutate()} disabled={!Number(wAmount) || doWithdraw.isPending} className="btn-primary mt-5 w-full py-3">
          {doWithdraw.isPending && <Spinner />} Submit Request
        </button>
      </Modal>
    </AccountShell>
  );
}
