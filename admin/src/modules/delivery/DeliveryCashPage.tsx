'use client';
// Cash Collection — port of delivery/cash/index.blade.php.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, HandCoins, Send, WalletCards } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { q, useLiveQuery, where, orderBy, limit } from '@/lib/firestore';
import { fmtDateTime, money, toDate } from '@/lib/format';
import type { CashCollection, Order } from '@/lib/types';
import { Loading, PageHeader, StatCard, StatusPill } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { fetchReadable, RiderGate } from './shared';

const PAGE = 20;

export default function DeliveryCashPage() {
  return <RiderGate>{(r) => <Cash uid={r.uid} cashInHand={Number(r.boy.cash_in_hand || 0)} />}</RiderGate>;
}

function Cash({ uid, cashInHand }: { uid: string; cashInHand: number }) {
  const { p } = usePanel();
  const { data, loading, error } = useLiveQuery<CashCollection>(q('cash_collections', where('delivery_boy_id', '==', uid), orderBy('created_at', 'desc'), limit(500)), [uid]);
  const [type, setType] = useState('');
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const ids = [...new Set(data.map((c) => c.order_id).filter(Boolean))].sort().join(',');
  useEffect(() => { if (ids) fetchReadable<Order>('orders', ids.split(',')).then(setOrders); }, [ids]);

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const collected = data.filter((c) => c.type === 'collected_from_customer');
  const totals = {
    collected: collected.reduce((s, c) => s + Number(c.amount || 0), 0),
    today: collected.filter((c) => (toDate(c.created_at)?.getTime() ?? 0) >= today0.getTime()).reduce((s, c) => s + Number(c.amount || 0), 0),
    submitted: data.filter((c) => c.type === 'submitted_to_admin').reduce((s, c) => s + Number(c.amount || 0), 0),
  };
  const t = term.trim().toLowerCase();
  const rows = data.filter((c) => (!type || c.type === type) && (!t || (orders[c.order_id || '']?.order_number || c.order_id || '').toLowerCase().includes(t) || (c.message || '').toLowerCase().includes(t)));

  return (
    <div>
      <PageHeader title="Cash Collection" subtitle="Cash on Delivery amounts you collected and settled" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="card p-5 flex items-center gap-4">
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-primary text-white flex items-center justify-center"><HandCoins className="w-7 h-7" /></span>
          <div>
            <p className="text-sm text-muted">Cash in Hand</p>
            <p className="text-3xl font-extrabold text-navy dark:text-white leading-tight">{money(cashInHand)}</p>
            <p className="text-xs text-muted mt-0.5">To be submitted to the store / admin</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-primary text-white flex items-center justify-center"><WalletCards className="w-7 h-7" /></span>
          <div>
            <p className="text-sm text-muted">Cash Collected</p>
            <p className="text-3xl font-extrabold text-navy dark:text-white leading-tight">{money(totals.collected)}</p>
            <p className="text-xs text-muted mt-0.5">Lifetime COD collected from customers</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <StatCard label="Collected Today" value={money(totals.today)} icon={CalendarCheck} color="blue" />
        <StatCard label="Submitted to Admin" value={money(totals.submitted)} icon={Send} color="purple" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line dark:border-dark-line">
          <select value={type} onChange={(e) => { setType(e.target.value); setShown(PAGE); }} className="input !w-52 !py-2">
            <option value="">All Transactions</option>
            <option value="collected_from_customer">Collected from customer</option>
            <option value="submitted_to_admin">Submitted to admin</option>
          </select>
          <SearchBox value={term} onChange={setTerm} placeholder="Search order #" className="w-56 ml-auto" />
        </div>
        {loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Order</th><th>Type</th><th>Message</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((c) => {
                  const col = c.type === 'collected_from_customer';
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold text-navy dark:text-white">#{c.id.slice(0, 8)}</td>
                      <td>{c.order_id ? <Link href={p(`/orders/view/${c.order_id}`)} className="font-medium text-primary hover:underline">{orders[c.order_id]?.order_number || c.order_id}</Link> : '-'}</td>
                      <td><StatusPill status={c.type} label={col ? 'Collected' : 'Submitted'} /></td>
                      <td className="text-muted max-w-xs truncate">{c.message || '-'}</td>
                      <td className={`font-bold ${col ? 'text-primary' : 'text-red-500'}`}>{col ? '+' : '-'}{money(c.amount)}</td>
                      <td className="whitespace-nowrap text-muted">{fmtDateTime(c.created_at)}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={6} className="!py-12 text-center text-muted">{error ? 'Could not load cash collections.' : 'No cash collections yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && <div className="p-4 text-center border-t border-line dark:border-dark-line"><button type="button" className="btn-soft btn-sm" onClick={() => setShown(shown + PAGE)}>Load more</button></div>}
      </div>
    </div>
  );
}
