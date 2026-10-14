'use client';
// Customer detail — port of admin/customers/show.blade.php: profile, addresses, stats, orders, wallet transactions (+ adjust → walletAdjust),
// referrals. Store panel: profile, addresses and orders placed with the store only.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Calendar, Gift, IndianRupee, LogIn, Mail, MapPin, MinusCircle, PackageCheck, PackageX, Phone, PlusCircle, ShoppingBag, ShoppingCart, UserCheck, UserX, Wallet } from 'lucide-react';
import { setUserStatus, walletAdjust } from '@/lib/callables';
import { fetchDoc, fetchList, limit, orderBy, useCountries, where, countDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Address, Order, Referral, UserDoc, WalletTxn } from '@/lib/types';
import { errMsg, fmtDate, fmtDateTime, money, statusLabel, timeAgo } from '@/lib/format';
import { cx, Avatar, Card, Empty, Forbidden, Loading, PageHeader, RowActions, StatCard, StatusPill } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/form/fields';
import { isActive } from '@/modules/locations/LocalTable';
import { isDeleted, useUserMap } from './shared';

const cnt = (...c: ReturnType<typeof where>[]) => countDocs('orders', c).catch(() => 0);

export default function CustomerViewPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { can } = useAuth();
  const { p, isStore, storeId } = usePanel();
  const toast = useToast();
  const { data: countries = [] } = useCountries();
  const [user, setUser] = useState<UserDoc | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [txns, setTxns] = useState<WalletTxn[] | null>(null);
  const [made, setMade] = useState<Referral[]>([]);
  const [self, setSelf] = useState<Referral | null>(null);
  const [stats, setStats] = useState({ orders: 0, delivered: 0, cancelled: 0 });
  const [tick, setTick] = useState(0);
  const [adjust, setAdjust] = useState<{ type: 'credit' | 'debit'; amount: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refMap = useUserMap([user?.referred_by, ...made.map((r) => r.referred_id)]);

  useEffect(() => {
    if (!id) return;
    if (!isStore) {
      fetchDoc<UserDoc>('users', id).then(setUser).catch(() => setUser(null));
      fetchList<Address>(`users/${id}/addresses`).then(setAddresses).catch(() => setAddresses([]));
    } else setAddresses([]);
    const scope = isStore && storeId ? [where('store_id', '==', storeId)] : [];
    Promise.all([cnt(where('user_id', '==', id), ...scope), cnt(where('user_id', '==', id), ...scope, where('status', '==', 'delivered')), cnt(where('user_id', '==', id), ...scope, where('status', '==', 'cancelled'))])
      .then(([o, d, c]) => setStats({ orders: o, delivered: d, cancelled: c }));
    fetchList<Order>('orders', where('user_id', '==', id), ...(isStore && storeId ? [where('store_id', '==', storeId)] : []), orderBy('created_at', 'desc'), limit(20))
      .then((list) => {
        setOrders(list);
        // store panel: customer profiles (users/{uid}) are not readable by stores — use the snapshot on their latest order here
        if (isStore) setUser(list.length ? ({ id, type: 'customer', status: 'active', name: list[0].customer?.name || 'Customer', email: list[0].customer?.email, phone: list[0].customer?.phone } as UserDoc) : null);
      })
      .catch(() => { setOrders([]); if (isStore) setUser(null); });
    if (!isStore) {
      fetchList<WalletTxn>(`users/${id}/wallet_transactions`, orderBy('created_at', 'desc'), limit(10)).then(setTxns).catch(() => setTxns([]));
      fetchList<Referral>('referrals', where('referrer_id', '==', id)).then(setMade).catch(() => setMade([]));
      fetchList<Referral>('referrals', where('referred_id', '==', id), limit(1)).then((r) => setSelf(r[0] || null)).catch(() => setSelf(null));
    }
  }, [id, tick, isStore, storeId]);

  if (!can('customer.list')) return <Forbidden />;
  if (user === undefined) return <Loading />;
  if (!user) return <Empty text="Customer not found." />;
  const refresh = () => setTick((t) => t + 1);
  const spent = isStore ? (orders || []).filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.totals?.grand_total ?? o.totals?.total ?? 0), 0) : user.total_spent;

  const toggleStatus = async () => {
    setBusy(true);
    try { await setUserStatus({ uid: user.id, active: !isActive(user.status) }); toast(isActive(user.status) ? 'Customer deactivated' : 'Customer activated'); refresh(); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const saveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjust) return;
    const amount = Number(adjust.amount);
    if (!(amount > 0)) { toast('Enter a valid amount', 'error'); return; }
    if (adjust.type === 'debit' && amount > Number(user.wallet_balance || 0)) { toast(`Insufficient wallet balance (${money(user.wallet_balance || 0)}).`, 'error'); return; }
    setBusy(true);
    try {
      const r = await walletAdjust({ uid: user.id, type: adjust.type, amount, message: adjust.message.trim() });
      toast(r?.balance != null ? `Wallet updated — balance ${money(r.balance)}` : 'Wallet updated'); setAdjust(null); refresh();
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title={user.name || 'Customer'} subtitle="Customer details" back={p('/customers')}>
        {!isStore && can('wallet.update') && (
          <button type="button" className="btn-primary" data-testid="wallet-adjust" onClick={() => setAdjust({ type: 'credit', amount: '', message: '' })}><Wallet className="w-4 h-4" /> Add Wallet Credit / Debit</button>
        )}
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex flex-col items-center text-center">
              <Avatar src={user.avatar} name={user.name} className="w-20 h-20 border-4 border-primary-50" />
              <h2 className="mt-3 text-lg font-extrabold text-navy dark:text-white">{user.name}</h2>
              <p className="text-sm text-muted">Customer #{user.id}</p>
              <div className="mt-2"><StatusPill status={isDeleted(user) ? 'deleted' : isActive(user.status)} /></div>
            </div>
            <dl className="mt-5 space-y-3 text-sm border-t border-line pt-4 dark:border-dark-line">
              <div className="flex items-center gap-3"><Mail className="w-4 h-4 text-muted" /><span className="truncate">{user.email || '—'}</span></div>
              <div className="flex items-center gap-3"><Phone className="w-4 h-4 text-muted" /><span>{user.phone || '—'}</span></div>
              <div className="flex items-center gap-3"><Calendar className="w-4 h-4 text-muted" /><span>Joined {fmtDate(user.created_at)}</span></div>
              <div className="flex items-center gap-3"><LogIn className="w-4 h-4 text-muted" /><span>Last login {user.last_login_at ? timeAgo(user.last_login_at) : 'never'}</span></div>
              {!isStore && <div className="flex items-center gap-3"><Gift className="w-4 h-4 text-muted" /><span>Referral code <b className="text-navy dark:text-white">{user.referral_code || '—'}</b></span></div>}
            </dl>
            {!isStore && (
              <>
                <div className="mt-5 rounded-xl bg-primary-50 p-4 flex items-center justify-between">
                  <div><p className="text-xs font-semibold uppercase text-primary">Wallet Balance</p><p className="text-2xl font-extrabold text-navy">{money(user.wallet_balance)}</p></div>
                  <Wallet className="w-8 h-8 text-primary" />
                </div>
                {can('customer.update') && !isDeleted(user) && (
                  <button type="button" className={cx(isActive(user.status) ? 'btn-outline' : 'btn-primary', 'w-full mt-4 justify-center')} disabled={busy} onClick={toggleStatus} data-testid="toggle-status">
                    {isActive(user.status) ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />} {isActive(user.status) ? 'Deactivate Customer' : 'Activate Customer'}
                  </button>
                )}
              </>
            )}
          </div>

          <Card title="Addresses" icon={MapPin}>
            {!addresses.length ? <p className="text-sm text-muted">No saved addresses.</p> : addresses.map((a, i) => (
              <div key={a.id} className={cx('py-3', i > 0 && 'border-t border-line dark:border-dark-line')}>
                <div className="flex items-center gap-2">
                  <span className="pill bg-slate-100 text-slate-600">{statusLabel(a.label || 'Address')}</span>
                  {a.is_default && <span className="pill bg-emerald-50 text-emerald-700">Default</span>}
                </div>
                <p className="mt-1.5 text-sm font-medium text-navy dark:text-white">{[a.name, a.phone].filter(Boolean).join(' · ')}</p>
                <p className="text-sm text-muted">{[a.address_line, a.landmark, a.city, a.state, a.pincode, countries.find((c) => c.id === a.country_id)?.name].filter(Boolean).join(', ')}</p>
              </div>
            ))}
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Orders" value={stats.orders} icon={ShoppingBag} color="blue" />
            <StatCard label="Total Spent" value={money(spent)} icon={IndianRupee} color="green" />
            <StatCard label="Delivered" value={stats.delivered} icon={PackageCheck} color="cyan" />
            <StatCard label="Cancelled" value={stats.cancelled} icon={PackageX} color="red" />
          </div>

          <Card title="Orders" icon={ShoppingCart} padding={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Order #</th><th>Date</th><th>Payment</th><th>Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {orders == null ? <tr><td colSpan={6}><Loading /></td></tr> : !orders.length ? <tr><td colSpan={6} className="!py-10 text-center text-muted">No orders yet.</td></tr>
                    : orders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-semibold text-navy dark:text-white">{o.order_number}</td>
                        <td className="whitespace-nowrap text-muted">{fmtDateTime(o.created_at)}</td>
                        <td className="uppercase text-xs">{o.payment_method}</td>
                        <td className="font-semibold whitespace-nowrap">{money(o.totals?.grand_total ?? o.totals?.total)}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td><RowActions view={p(`/orders/view/${o.id}`)} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!isStore && (
            <>
              <Card title="Wallet Transactions" icon={Wallet} padding={false} actions={<Link href={p(`/wallet-transactions?user=${user.id}`)} className="text-sm font-semibold text-primary">View all</Link>}>
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>Type</th><th>Payment Type</th><th>Amount</th><th>Balance</th><th>Message</th><th>Date</th></tr></thead>
                    <tbody>
                      {txns == null ? <tr><td colSpan={6}><Loading /></td></tr> : !txns.length ? <tr><td colSpan={6} className="!py-10 text-center text-muted">No wallet transactions.</td></tr>
                        : txns.map((t) => (
                          <tr key={t.id}>
                            <td><StatusPill status={t.type} /></td>
                            <td>{statusLabel(t.payment_type || '—')}</td>
                            <td className={cx('font-semibold whitespace-nowrap', t.type === 'credit' ? 'text-emerald-600' : 'text-red-500')}>{t.type === 'credit' ? '+' : '−'}{money(t.amount)}</td>
                            <td className="whitespace-nowrap">{money(t.balance_after)}</td>
                            <td className="max-w-xs">{t.message}</td>
                            <td className="whitespace-nowrap text-muted">{fmtDateTime(t.created_at)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Referral" icon={Gift}>
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <div className="rounded-xl border border-line p-4 dark:border-dark-line">
                    <p className="text-xs uppercase font-semibold text-muted">Referred by</p>
                    <p className="mt-1 font-semibold text-navy dark:text-white">
                      {user.referred_by ? <Link href={p(`/customers/view/${user.referred_by}`)} className="hover:text-primary">{refMap[user.referred_by]?.name || user.referred_by}</Link> : '—'}
                    </p>
                    {self && <StatusPill className="mt-2" status={self.status} />}
                  </div>
                  <div className="rounded-xl border border-line p-4 dark:border-dark-line">
                    <p className="text-xs uppercase font-semibold text-muted">Friends referred</p>
                    <p className="mt-1 text-xl font-extrabold text-navy dark:text-white">{made.length}</p>
                  </div>
                  <div className="rounded-xl border border-line p-4 dark:border-dark-line">
                    <p className="text-xs uppercase font-semibold text-muted">Rewards earned</p>
                    <p className="mt-1 text-xl font-extrabold text-primary">{money(made.filter((r) => r.status === 'credited').reduce((s, r) => s + Number(r.referrer_reward || 0), 0))}</p>
                  </div>
                </div>
                {made.length > 0 && (
                  <table className="tbl mt-4">
                    <thead><tr><th>Referred User</th><th>Reward</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {made.map((r) => (
                        <tr key={r.id}>
                          <td><Link href={p(`/customers/view/${r.referred_id}`)} className="hover:text-primary">{refMap[r.referred_id]?.name || r.referred_name || '—'}</Link></td>
                          <td>{money(r.referrer_reward)}</td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="text-muted">{fmtDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Add Wallet Credit / Debit" size="lg">
        {adjust && (
          <form onSubmit={saveAdjust} className="p-5 space-y-4">
            <p className="text-sm text-muted">Current balance: <b className="text-navy dark:text-white">{money(user.wallet_balance)}</b></p>
            <div>
              <span className="label">Type <span className="text-red-500">*</span></span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={cx('chip justify-center !py-2', adjust.type === 'credit' && 'chip-active')} onClick={() => setAdjust({ ...adjust, type: 'credit' })}><PlusCircle className="w-4 h-4" /> Credit</button>
                <button type="button" className={cx('chip justify-center !py-2', adjust.type === 'debit' && '!bg-red-50 !border-red-400 !text-red-600')} onClick={() => setAdjust({ ...adjust, type: 'debit' })}><MinusCircle className="w-4 h-4" /> Debit</button>
              </div>
            </div>
            <Input label="Amount" type="number" step="0.01" min={0.01} required value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
            <Input label="Message" placeholder="e.g. Goodwill credit for delayed order" value={adjust.message} onChange={(e) => setAdjust({ ...adjust, message: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-gray" onClick={() => setAdjust(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} data-testid="save">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
