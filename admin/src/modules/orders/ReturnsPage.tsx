'use client';
// Return Requests list — port of admin/returns/index.blade.php (ReturnRequestController@index). Store panel scoped by store_id.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { QueryConstraint } from 'firebase/firestore';
import { fetchByIds, useStores, useZones, where } from '@/lib/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fmtDate, money } from '@/lib/format';
import type { ReturnRequest, UserDoc } from '@/lib/types';
import { DataTable, opts, type FilterDef } from '@/components/ui/DataTable';
import { Forbidden, PageHeader, RowActions, StatusPill } from '@/components/ui';
import { RETURN_STATUSES } from './shared';
import { toDate } from '@/lib/format';

export default function ReturnsPage() {
  const { p, storeId, isStore, countryId } = usePanel();
  const { can } = useAuth();
  const { data: zones = [] } = useZones();
  const { data: stores = [] } = useStores();
  const [names, setNames] = useState<Record<string, string>>({});

  const countryZones = useMemo(() => (countryId ? zones.filter((z) => z.country_id === countryId).map((z) => z.id) : []), [zones, countryId]);
  const constraints = useMemo<QueryConstraint[]>(() => {
    const cs: QueryConstraint[] = [];
    if (storeId) cs.push(where('store_id', '==', storeId));
    // admin header country → zones of that country (Firestore `in` supports up to 30 values)
    if (!isStore && countryId && zones.length) cs.push(where('zone_id', 'in', countryZones.length ? countryZones.slice(0, 30) : ['__none__']));
    return cs;
  }, [storeId, isStore, countryId, countryZones, zones.length]);

  if (!can('return.list')) return <Forbidden />;
  if (isStore && !storeId) return null;

  const loadNames = (rows: ReturnRequest[]) => {
    const missing = [...new Set(rows.map((r) => r.user_id).filter((u) => u && !(u in names)))];
    if (!missing.length) return;
    fetchByIds<UserDoc>('users', missing)
      .then((us) => setNames((m) => ({ ...m, ...Object.fromEntries(missing.map((id) => [id, us.find((u) => u.id === id)?.name || ''])) })))
      .catch(() => setNames((m) => ({ ...m, ...Object.fromEntries(missing.map((id) => [id, ''])) })));
  };

  const scopedStores = countryId ? stores.filter((s) => s.country_id === countryId) : stores;
  const filters: FilterDef[] = [
    ...(!isStore ? [{ key: 'store_id', placeholder: 'All Stores', options: opts(scopedStores, (s) => s.name), className: '!w-40 !min-w-0' }] : []),
    { key: 'status', placeholder: 'All Statuses', options: Object.entries(RETURN_STATUSES).map(([value, label]) => ({ value, label })), className: '!w-44 !min-w-0' },
  ];

  return (
    <div>
      <PageHeader title="Return Requests" />
      <DataTable<ReturnRequest>
        path="return_requests"
        constraints={constraints}
        deps={[storeId, countryId, countryZones.join(',')]}
        filters={filters}
        search="Search"
        defaultSort={{ field: 'created_at', dir: 'desc' }}
        onRows={loadNames}
        testId="returns-table"
        columns={[
          { key: 'return_number', header: 'ID', sort: 'created_at', render: (r) => <span className="font-semibold text-navy dark:text-white whitespace-nowrap">{r.return_number || r.id}</span> },
          {
            key: 'order', header: 'Order Number',
            render: (r) => (r.order_id ? <Link href={p(`/orders/view/${r.order_id}`)} className="hover:text-primary whitespace-nowrap">{r.order_number || r.order_id}</Link> : '-'),
          },
          { key: 'name', header: 'Name', render: (r) => names[r.user_id] || '-' },
          { key: 'item_name', header: 'Product Name', render: (r) => <div className="max-w-[200px] truncate" title={r.item_name}>{r.item_name || '-'}</div> },
          { key: 'qty', header: 'Quantity', sort: 'qty', render: (r) => r.qty },
          { key: 'refund_amount', header: 'Total', sort: 'refund_amount', render: (r) => <span className="whitespace-nowrap font-medium">{money(r.refund_amount)}</span> },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusPill status={r.status} label={RETURN_STATUSES[r.status]} /> },
          { key: 'reason', header: 'Return Reason', render: (r) => <div className="max-w-[200px] truncate" title={r.reason}>{r.reason || '-'}</div> },
          {
            key: 'created_at', header: 'Date',
            render: (r) => {
              const d = toDate(r.created_at);
              return <div className="whitespace-nowrap text-sm">{fmtDate(r.created_at)}<div className="text-xs text-muted">{d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</div></div>;
            },
          },
          { key: 'actions', header: 'Actions', align: 'right', render: (r) => <RowActions view={p(`/returns/view/${r.id}`)} /> },
        ]}
      />
    </div>
  );
}
