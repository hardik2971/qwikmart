'use client';
// Customers — port of admin/customers/index.blade.php. Admin: users where type=='customer' (search_keywords), status toggle
// (setUserStatus), delete (deleteUser). Store panel: customers who ordered from the store (derived from its orders).
import { useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { UserCheck, UserPlus, Users, Wallet } from 'lucide-react';
import { deleteUser, setUserStatus } from '@/lib/callables';
import { fetchByIds, fetchList, limit, orderBy, where, countDocs, aggregateDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Order, UserDoc } from '@/lib/types';
import { errMsg, fmtDate, money, num } from '@/lib/format';
import { cx, Forbidden, PageHeader, RowActions, StatCard, StatusPill } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { LocalTable, STATUS_OPTS, isActive, useAll } from '@/modules/locations/LocalTable';
import { isDeleted, UserCell } from './shared';

const cnt = (...c: ReturnType<typeof where>[]) => countDocs('users', [where('type', '==', 'customer'), ...c]).catch(() => null);

export default function CustomersPage() {
  const { can } = useAuth();
  const { p, isStore, storeId } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<{ total: number | null; active: number | null; new: number | null; wallet: number | null }>({ total: null, active: null, new: null, wallet: null });
  const [busy, setBusy] = useState<string | null>(null);

  // store panel: unique customers from the store's latest orders
  const store = useAll<UserDoc & { store_orders: number; store_spent: number }>(async () => {
    if (!isStore || !storeId) return [];
    const orders = await fetchList<Order>('orders', where('store_id', '==', storeId), orderBy('created_at', 'desc'), limit(1000));
    const agg: Record<string, { n: number; s: number }> = {};
    orders.forEach((o) => { if (!o.user_id) return; const a = (agg[o.user_id] ??= { n: 0, s: 0 }); a.n++; if (o.status !== 'cancelled') a.s += Number(o.totals?.grand_total ?? o.totals?.total ?? 0); });
    const users = await fetchByIds<UserDoc>('users', Object.keys(agg));
    return users.filter((u) => !isDeleted(u)).map((u) => ({ ...u, store_orders: agg[u.id]?.n || 0, store_spent: Math.round((agg[u.id]?.s || 0) * 100) / 100 }));
  }, [isStore, storeId]);

  useEffect(() => {
    if (isStore) return;
    const since = Timestamp.fromDate(new Date(Date.now() - 30 * 86400_000));
    Promise.all([
      cnt(), cnt(where('status', '==', 'active')), cnt(where('created_at', '>=', since)),
      aggregateDocs('users', [where('type', '==', 'customer')], { sum: { s: 'wallet_balance' } }).then((r) => Number(r.s || 0)).catch(() => null),
    ]).then(([total, active, n, wallet]) => setStats({ total, active, new: n, wallet }));
  }, [isStore, refreshKey]);

  if (!can('customer.list')) return <Forbidden />;

  const toggle = async (u: UserDoc) => {
    setBusy(u.id);
    try { await setUserStatus({ uid: u.id, active: !isActive(u.status) }); toast(isActive(u.status) ? 'Customer deactivated' : 'Customer activated'); setRefreshKey((k) => k + 1); }
    catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const del = async (u: UserDoc) => {
    if (!(await confirm({ title: 'Delete this customer?', message: 'Their login is removed and the account is marked deleted.', danger: true }))) return;
    try { await deleteUser({ uid: u.id }); toast('Customer deleted'); setRefreshKey((k) => k + 1); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const nameCol: Column<UserDoc> = { key: 'name', header: 'Customer', sort: 'name', render: (u) => <UserCell user={u} sub={u.email || '—'} href={p(`/customers/view/${u.id}`)} /> };
  const phoneCol: Column<UserDoc> = { key: 'phone', header: 'Phone', render: (u) => <span className="whitespace-nowrap">{u.phone || '—'}</span> };
  const joinedCol: Column<UserDoc> = { key: 'created_at', header: 'Joined', sort: 'created_at', render: (u) => <span className="whitespace-nowrap text-muted">{fmtDate(u.created_at)}</span> };

  if (isStore) {
    const rows = store.rows;
    return (
      <div>
        <PageHeader title="Customers" subtitle="Customers who have ordered from your store" />
        <div className="grid gap-4 mb-5 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Customers" value={num(rows.length)} icon={Users} color="blue" />
          <StatCard label="Active" value={num(rows.filter((r) => isActive(r.status)).length)} icon={UserCheck} color="green" />
          <StatCard label="Total Spent" value={money(rows.reduce((s, r) => s + r.store_spent, 0))} icon={Wallet} color="orange" />
        </div>
        <LocalTable
          rows={rows} loading={store.loading} error={store.error} onRefresh={store.reload} search="Search name, email, phone" defaultSort={{ field: 'store_orders', dir: 'desc' }}
          searchText={(u) => `${u.name} ${u.email ?? ''} ${u.phone ?? ''}`}
          filters={[{ key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS, test: (u, v) => (isActive(u.status) ? 'active' : 'inactive') === v }]}
          columns={[
            nameCol as Column<typeof rows[number]>, phoneCol as Column<typeof rows[number]>,
            { key: 'store_orders', header: 'Orders', sort: 'store_orders' },
            { key: 'store_spent', header: 'Total Spent', sort: 'store_spent', render: (u) => <span className="font-semibold whitespace-nowrap">{money(u.store_spent)}</span> },
            joinedCol as Column<typeof rows[number]>,
            { key: 'status', header: 'Status', render: (u) => <StatusPill status={isActive(u.status)} /> },
            { key: 'actions', header: 'Actions', align: 'right', render: (u) => <RowActions view={p(`/customers/view/${u.id}`)} /> },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Customers" />
      <div className="grid gap-4 mb-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Customers" value={stats.total == null ? '—' : num(stats.total)} icon={Users} color="blue" />
        <StatCard label="Active" value={stats.active == null ? '—' : num(stats.active)} icon={UserCheck} color="green" />
        <StatCard label="New (30 days)" value={stats.new == null ? '—' : num(stats.new)} icon={UserPlus} color="purple" />
        <StatCard label="Wallet Balance (all)" value={stats.wallet == null ? '—' : money(stats.wallet)} icon={Wallet} color="orange" />
      </div>
      <DataTable<UserDoc>
        path="users" constraints={[where('type', '==', 'customer')]} refreshKey={refreshKey} search="Search name, email, phone"
        clientFilter={(u, terms) => !isDeleted(u) && terms.slice(1).every((t) => (u.search_keywords || []).includes(t.slice(0, 15)))}
        filters={[{ key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS }]}
        columns={[
          nameCol, phoneCol,
          { key: 'orders_count', header: 'Orders', sort: 'orders_count', render: (u) => num(u.orders_count) },
          { key: 'total_spent', header: 'Total Spent', sort: 'total_spent', render: (u) => <span className="font-semibold whitespace-nowrap">{money(u.total_spent)}</span> },
          { key: 'wallet_balance', header: 'Wallet', sort: 'wallet_balance', render: (u) => <span className="whitespace-nowrap">{money(u.wallet_balance)}</span> },
          joinedCol,
          {
            key: 'status', header: 'Status', render: (u) => can('customer.update')
              ? <button type="button" className={cx('toggle', isActive(u.status) && 'toggle-on')} title="Toggle status" disabled={busy === u.id} onClick={() => toggle(u)} data-testid={`status-${u.id}`}><span className="toggle-dot" /></button>
              : <StatusPill status={isActive(u.status)} />,
          },
          { key: 'actions', header: 'Actions', align: 'right', render: (u) => <RowActions view={p(`/customers/view/${u.id}`)} onDelete={can('customer.delete') ? () => del(u) : undefined} /> },
        ]}
      />
    </div>
  );
}
