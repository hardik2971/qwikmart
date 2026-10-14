'use client';

import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Copy, Gift, Share2, ShoppingBag, UserPlus, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useCurrency, useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { FacebookIcon, WhatsappIcon, XIcon } from '@/components/icons';
import { StatusPill } from '@/components/ui';

export default function ReferEarnPage() {
  const authed = useIsAuthed();
  const { fmt } = useCurrency();
  const q = useQuery({ queryKey: ['referral'], queryFn: api.referral, enabled: authed });
  const r = q.data;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/login?ref=${r?.code ?? ''}` : '';
  const msg = `Join me on QwikMart and get ${fmt(r?.referred_reward ?? 50)} in your wallet! Use my code ${r?.code} — ${link}`;

  const copy = async () => {
    await navigator.clipboard.writeText(r?.code || '').catch(() => null);
    toast.success('Referral code copied');
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'QwikMart', text: msg }).catch(() => null);
    else copy();
  };

  return (
    <AccountShell title="Refer & Earn">
      {q.isLoading || !r ? (
        <div className="skeleton h-[480px]" />
      ) : (
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary to-primary-dark p-6 text-white md:p-8">
            <div className="absolute -end-6 -top-6 text-[120px] leading-none opacity-20">🎁</div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <Gift className="h-3.5 w-3.5" /> Refer &amp; Earn
            </span>
            <h1 className="mt-3 text-2xl font-extrabold text-white md:text-3xl">Invite Friends &amp; Earn Rewards</h1>
            <p className="mt-1 max-w-md text-sm text-white/85">
              Share your code and earn {fmt(r.referrer_reward)} for every successful referral. Your friend gets {fmt(r.referred_reward)} too!
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/15 px-3 py-1">Share</span>
              <span className="rounded-full bg-white/15 px-3 py-1">They order</span>
              <span className="rounded-full bg-white/15 px-3 py-1">You both earn</span>
            </div>
          </div>

          <div className="card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Your Referral Code</div>
            <div className="mt-2 flex gap-2">
              <div className="flex flex-1 items-center justify-center rounded-btn border-2 border-dashed border-primary bg-primary-50 py-3 text-2xl font-extrabold tracking-[0.3em] text-primary dark:bg-primary/10">
                {r.code}
              </div>
              <button onClick={copy} className="btn-primary px-5">
                <Copy className="h-4 w-4" /> Copy Code
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">Reward is credited after your friend&apos;s first order above {fmt(r.min_order)}.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Min Order', value: fmt(r.min_order), bg: 'bg-primary-50 text-primary dark:bg-primary/10' },
              { label: 'You Earn', value: fmt(r.referrer_reward), bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10' },
              { label: 'Friend Earns', value: fmt(r.referred_reward), bg: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10' },
            ].map((c) => (
              <div key={c.label} className={`rounded-card p-4 text-center ${c.bg}`}>
                <div className="text-xl font-extrabold">{c.value}</div>
                <div className="text-xs font-medium">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-bold">How it works</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Share2, t: 'Share Your Code', d: 'Send your referral code or link to friends.' },
                { icon: ShoppingBag, t: 'Friend Places Order', d: `They sign up and order above ${fmt(r.min_order)}.` },
                { icon: Wallet, t: 'You Both Earn', d: 'Rewards land in both wallets instantly.' },
              ].map(({ icon: Icon, t, d }, i) => (
                <div key={t} className="flex flex-col items-center text-center">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                    <Icon className="h-5 w-5" />
                    <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-primary ring-2 ring-primary">{i + 1}</span>
                  </span>
                  <div className="mt-2 text-sm font-semibold text-ink">{t}</div>
                  <div className="text-xs text-muted">{d}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center text-xs font-semibold uppercase tracking-wide text-muted">Share via social apps</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                <FacebookIcon className="h-4 w-4 text-[#1877F2]" /> Facebook
              </a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                <XIcon className="h-4 w-4" /> Twitter
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                <WhatsappIcon className="h-4 w-4 text-[#25D366]" /> WhatsApp
              </a>
            </div>
            <button onClick={share} className="btn-soft mt-2 w-full">
              <Share2 className="h-4 w-4" /> More options
            </button>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Your Referrals</h2>
              <span className="text-sm font-semibold text-primary">Total earned {fmt(r.total_earned)}</span>
            </div>
            {r.referrals.length === 0 && <p className="text-sm text-muted">No referrals yet — start sharing!</p>}
            <div className="divide-y divide-line">
              {r.referrals.map((f, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary">
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">{f.name}</div>
                    <div className="text-xs text-muted">{formatDate(f.created_at, false)}</div>
                  </div>
                  <StatusPill label={f.status === 'credited' ? `+${fmt(f.reward)}` : 'Pending'} className={f.status === 'credited' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AccountShell>
  );
}
