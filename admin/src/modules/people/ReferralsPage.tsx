'use client';
// Referrals — port of admin/referrals/index.blade.php: summary, current settings (settings/public.referral), referral ledger.
import { useEffect, useState } from 'react';
import { countDocs, aggregateDocs, where } from '@/lib/firestore';
import Link from 'next/link';
import { BadgeCheck, Gift, Hourglass, Pencil, Settings2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Referral } from '@/lib/types';
import { fmtDate, money, num } from '@/lib/format';
import { Card, Forbidden, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { UserCell, useUserMap } from './shared';


export default function ReferralsPage() {
  const { can } = useAuth();
  const { p, settings } = usePanel();
  const [rows, setRows] = useState<(Referral & { min_order?: number })[]>([]);
  const users = useUserMap(rows.flatMap((r) => [r.referrer_id, r.referred_id]));
  const [s, setS] = useState({ total: 0, pending: 0, credited: 0, paid: 0 });

  useEffect(() => {
    Promise.all([
      countDocs('referrals').catch(() => 0),
      countDocs('referrals', [where('status', '==', 'pending')]).catch(() => 0),
      aggregateDocs('referrals', [where('status', '==', 'credited')], { sum: { r1: 'referrer_reward', r2: 'referred_reward' } })
        .then((r) => ({ n: 0, s: Number(r.r1 || 0) + Number(r.r2 || 0) })).catch(() => ({ n: 0, s: 0 })),
      countDocs('referrals', [where('status', '==', 'credited')]).catch(() => 0),
    ]).then(([total, pending, paid, credited]) => setS({ total, pending, credited, paid: paid.s }));
  }, []);

  if (!can('customer.list')) return <Forbidden />;
  const cfg = settings.referral || {};

  const person = (uid: string, fallback?: string, referrer = false) => {
    const u = users[uid];
    return <UserCell user={u || { name: fallback || uid }} sub={referrer && u?.referral_code ? `Code: ${u.referral_code}` : u?.email} href={u?.type === 'customer' ? p(`/customers/view/${uid}`) : undefined} fallback="—" />;
  };

  return (
    <div>
      <PageHeader title="Referrals" subtitle="Refer & earn program activity" />
      <div className="grid gap-4 mb-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Referrals" value={num(s.total)} icon={Users} color="blue" />
        <StatCard label="Pending" value={num(s.pending)} icon={Hourglass} color="orange" />
        <StatCard label="Credited" value={num(s.credited)} icon={BadgeCheck} color="green" />
        <StatCard label="Rewards Paid" value={money(s.paid)} icon={Gift} color="purple" />
      </div>

      <Card title="Current Referral Settings" icon={Settings2} className="mb-5" subtitle="These values apply to new referrals. Existing referrals keep the rewards captured at signup."
        actions={can('setting.update') ? <Link href={p('/settings?tab=referral')} className="btn-soft btn-sm"><Pencil className="w-3.5 h-3.5" /> Edit in Settings</Link> : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line p-4 dark:border-dark-line">
            <p className="text-xs font-semibold uppercase text-muted">Program</p>
            <p className="mt-1"><StatusPill status={!!cfg.enabled} label={cfg.enabled ? 'Enabled' : 'Disabled'} /></p>
          </div>
          {([['Referrer Reward', cfg.referrer_reward], ['New User Reward', cfg.referred_reward], ['Min. First Order', cfg.min_order]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl border border-line p-4 dark:border-dark-line">
              <p className="text-xs font-semibold uppercase text-muted">{l}</p>
              <p className="mt-1 text-lg font-extrabold text-navy dark:text-white">{money(v)}</p>
            </div>
          ))}
        </div>
      </Card>

      <DataTable<Referral & { min_order?: number }>
        path="referrals" onRows={setRows}
        filters={[{ key: 'status', placeholder: 'All Statuses', options: [{ value: 'pending', label: 'Pending' }, { value: 'credited', label: 'Credited' }] }]}
        columns={[
          { key: 'referrer', header: 'Referrer', render: (r) => person(r.referrer_id, undefined, true) },
          { key: 'referred', header: 'Referred User', render: (r) => person(r.referred_id, r.referred_name) },
          { key: 'referrer_reward', header: 'Referrer Reward', render: (r) => <span className="font-semibold">{money(r.referrer_reward)}</span> },
          { key: 'referred_reward', header: 'Referred Reward', render: (r) => <span className="font-semibold">{money(r.referred_reward)}</span> },
          { key: 'min_order', header: 'Min Order', render: (r) => money(r.min_order) },
          { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { key: 'created_at', header: 'Date', sort: 'created_at', render: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.created_at)}</span> },
        ]}
      />
    </div>
  );
}
