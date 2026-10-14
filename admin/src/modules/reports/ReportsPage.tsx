'use client';
// Port of admin/reports/show.blade.php (+ partials/modes) — /reports/[type] with presets, filters, summary cards, chart, table, CSV export.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Download, Filter, RotateCcw, Calendar, ChartColumn, Zap, Package, TrendingUp, PieChart, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { useStores, useTaxes, useZones } from '@/lib/firestore';
import { exportReport } from '@/lib/callables';
import { errMsg, fmtDate, imgUrl, money, ymd } from '@/lib/format';
import { Card, MetricCard, PageHeader, Spinner, Forbidden, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { Chart } from '@/components/ui/Chart';
import { useToast } from '@/components/ui/toast';
import { REPORT_TYPES, PRESETS, buildCtx, buildReport, fmtCell, type ModeStats, type Report } from './reportData';

const EXPORTABLE: Record<string, 'sales' | 'products'> = { sales: 'sales', products: 'products' };

function ModesPartial({ modes, donut }: { modes: NonNullable<Report['modes']>; donut: NonNullable<Report['donut']> }) {
  const metrics: [string, keyof ModeStats, 'int' | 'money' | 'minutes'][] = [
    ['Orders', 'orders', 'int'], ['Revenue', 'revenue', 'money'], ['Avg Order Value', 'aov', 'money'], ['Delivered', 'delivered', 'int'],
    ['Cancelled', 'cancelled', 'int'], ['Customers', 'customers', 'int'], ['Avg Delivery Time', 'avg_minutes', 'minutes'],
  ];
  const fmt = (v: any, f: string) => f === 'money' ? money(v) : f === 'minutes' ? (v == null ? '-' : v >= 120 ? `${(v / 60).toFixed(1)} hrs` : `${Math.round(v)} min`) : Number(v || 0).toLocaleString('en-IN');
  return (
    <div className="grid gap-5 lg:grid-cols-3 mb-5">
      {(['quick', 'ecommerce'] as const).map((key) => {
        const m = modes[key]; const other = modes[key === 'quick' ? 'ecommerce' : 'quick'];
        const Icon = key === 'quick' ? Zap : Package;
        return (
          <div key={key} className={cx('card p-5 border-t-4', key === 'quick' ? 'border-t-primary' : 'border-t-amber-500')}>
            <div className="flex items-center gap-3 mb-4">
              <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center', key === 'quick' ? 'bg-primary-50 text-primary' : 'bg-amber-50 text-amber-600')}><Icon className="w-5 h-5" /></span>
              <div>
                <h3 className="font-bold text-navy dark:text-white">{m.label}</h3>
                <p className="text-xs text-muted">{key === 'quick' ? 'Instant delivery from dark stores' : 'Scheduled / shipped deliveries'}</p>
              </div>
            </div>
            <dl className="divide-y divide-line dark:divide-dark-line">
              {metrics.map(([label, field, f]) => {
                const a = m[field] as number | null; const b = other[field] as number | null;
                const better = field === 'cancelled' || field === 'avg_minutes' ? a != null && b != null && a < b : (a ?? 0) > (b ?? 0);
                return (
                  <div key={field} className="flex items-center justify-between py-2 text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-semibold text-navy dark:text-white flex items-center gap-1.5">{fmt(a, f)}{better && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
      <Card title="Revenue Share" icon={PieChart}>
        <Chart type="donut" height={300} series={donut.series} options={{
          labels: donut.labels, colors: ['#0E9623', '#F59E0B'], legend: { position: 'bottom' }, tooltip: { y: { formatter: (v: number) => money(v) } },
          plotOptions: { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Revenue', formatter: (w: any) => money(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)) } } } } },
        }} />
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  const params = useParams<{ type: string }>();
  const type = String(params?.type || 'sales');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { p, isStore, storeId, countryId: panelCountry, countries } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { data: stores = [] } = useStores();
  const { data: zones = [] } = useZones();
  const { data: taxes = [] } = useTaxes();

  const types = useMemo(() => Object.entries(REPORT_TYPES).filter(([k]) => !(isStore && k === 'stores')), [isStore]);
  const valid = types.some(([k]) => k === type);
  const ctx = useMemo(() => buildCtx(sp, { storeId: isStore ? storeId : null, countryId: panelCountry }), [sp, isStore, storeId, panelCountry]);
  const [draft, setDraft] = useState({ from: ymd(ctx.from), to: ymd(ctx.to) });
  useEffect(() => setDraft({ from: ymd(ctx.from), to: ymd(ctx.to) }), [ctx.from.getTime(), ctx.to.getTime()]);

  const report = useQuery({
    queryKey: ['report', type, ctx.from.getTime(), ctx.to.getTime(), ctx.mode, ctx.countryId, ctx.zoneId, ctx.storeId, stores.length, zones.length, taxes.length],
    enabled: valid && (!isStore || !!storeId),
    queryFn: () => buildReport(type, ctx, { stores, zones, taxes }),
    staleTime: 60 * 1000,
  });

  // table state
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setQ(''); setSort(null); setPage(0); }, [type]);
  useEffect(() => setPage(0), [q, sort, size, report.data]);
  const r = report.data;
  const rows = useMemo(() => {
    if (!r) return [];
    let list = r.rows;
    const s = q.trim().toLowerCase();
    if (s && r.search) list = list.filter((x) => `${x.name || ''} ${x.phone || ''}`.toLowerCase().includes(s));
    if (sort) list = [...list].sort((a, b) => ((a[sort.key] ?? 0) > (b[sort.key] ?? 0) ? 1 : (a[sort.key] ?? 0) < (b[sort.key] ?? 0) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
    return list;
  }, [r, q, sort]);
  const pageRows = rows.slice(page * size, page * size + size);
  const lastPage = Math.max(1, Math.ceil(rows.length / size));

  const qs = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') u.delete(k); else u.set(k, v); }
    const s = u.toString();
    return s ? `?${s}` : '';
  };
  const nav = (patch: Record<string, string | null>) => router.replace(`${pathname}${qs(patch)}`);
  const filterOnly = () => { const u = new URLSearchParams(); ['range', 'from', 'to', 'country_id', 'zone_id', 'store_id', 'mode'].forEach((k) => { const v = sp.get(k); if (v) u.set(k, v); }); const s = u.toString(); return s ? `?${s}` : ''; };

  const zoneOpts = zones.filter((z) => !ctx.countryId || z.country_id === ctx.countryId);
  const storeOpts = stores.filter((s) => (!ctx.countryId || s.country_id === ctx.countryId) && (!ctx.zoneId || s.zone_id === ctx.zoneId));

  const downloadCsv = () => {
    if (!r) return;
    const data = rows.map((row) => r.columns.map((c) => (c.format === 'money' || c.format === 'percent' || c.format === 'decimal' ? Math.round(Number(row[c.key] || 0) * 100) / 100 : c.format === 'int' ? Number(row[c.key] || 0) : row[c.key] ?? '')));
    const csv = Papa.unparse({ fields: r.columns.map((c) => c.label), data });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${type}-${ymd(ctx.from).replace(/-/g, '')}-${ymd(ctx.to).replace(/-/g, '')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doExport = async () => {
    if (!r) return;
    setExporting(true);
    const serverType = EXPORTABLE[type];
    if (serverType) {
      try {
        const res = await exportReport({ type: serverType, from: ymd(ctx.from), to: ymd(ctx.to), filters: { country_id: ctx.countryId || undefined, zone_id: ctx.zoneId || undefined, store_id: ctx.storeId || undefined, mode: ctx.mode || undefined } });
        if (res?.url) { window.open(res.url, '_blank', 'noopener'); toast('Export ready.'); setExporting(false); return; }
      } catch { /* fall back to client CSV */ }
    }
    try { downloadCsv(); toast('CSV downloaded.'); } catch (e) { toast(errMsg(e), 'error'); }
    setExporting(false);
  };

  if (!can('report.view')) return <Forbidden />;
  if (!valid) return <div className="card p-10 text-center"><h2 className="text-lg font-bold text-navy dark:text-white">Report not found</h2><Link href={p('/reports/sales')} className="btn-primary mt-4 inline-flex">Sales Report</Link></div>;
  const [title, subtitle] = REPORT_TYPES[type];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        <button type="button" className="btn-outline" onClick={doExport} disabled={!r || exporting} data-testid="export-csv"><Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {types.map(([k, [label]]) => <Link key={k} href={`${p(`/reports/${k}`)}${filterOnly()}`} className={k === type ? 'chip chip-active' : 'chip'}>{label}</Link>)}
      </div>

      <div className="card mb-5 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-muted mr-1">Period</span>
          {Object.entries(PRESETS).map(([k, label]) => (
            <button key={k} type="button" onClick={() => nav({ range: k, from: null, to: null })} className={ctx.preset === k ? 'chip chip-active' : 'chip'}>{label}</button>
          ))}
          <span className="ml-auto text-xs text-muted flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {fmtDate(ctx.from)} – {fmtDate(ctx.to)} · {ctx.monthly ? 'monthly' : 'daily'}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label">From</label><input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="input !py-2 !w-40" /></div>
          <div><label className="label">To</label><input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="input !py-2 !w-40" /></div>
          {!isStore && (
            <>
              <div>
                <label className="label">Country</label>
                <select value={ctx.countryId} onChange={(e) => nav({ country_id: e.target.value || 'all', zone_id: null, store_id: null })} className="input !py-2 !w-44">
                  <option value="">All Countries</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Zone</label>
                <select value={ctx.zoneId} onChange={(e) => nav({ zone_id: e.target.value, store_id: null })} className="input !py-2 !w-44">
                  <option value="">All Zones</option>
                  {zoneOpts.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Store</label>
                <select value={ctx.storeId} onChange={(e) => nav({ store_id: e.target.value })} className="input !py-2 !w-48">
                  <option value="">All Stores</option>
                  {storeOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </>
          )}
          {!(r?.hideMode || type === 'modes') && (
            <div>
              <label className="label">Mode</label>
              <select value={ctx.mode} onChange={(e) => nav({ mode: e.target.value })} className="input !py-2 !w-40">
                <option value="">All Modes</option><option value="quick">Quick</option><option value="ecommerce">eCommerce</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => nav({ range: null, from: draft.from, to: draft.to })} data-testid="apply"><Filter className="w-4 h-4" /> Apply</button>
            <button type="button" className="btn-outline" title="Reset" onClick={() => router.replace(pathname)}><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {report.isLoading ? <div className="card py-20 flex justify-center"><Spinner className="w-6 h-6" /></div>
        : report.error ? (
          <div className="card p-10 text-center text-muted">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            {(report.error as any)?.code === 'failed-precondition' ? 'This report needs a Firestore composite index (see README).' : (report.error as any)?.code === 'permission-denied' ? 'You do not have permission to read this report data.' : errMsg(report.error)}
          </div>
        ) : r && (
          <>
            {r.truncated && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Only the latest 10,000 orders in this range were analysed — narrow the date range for exact figures.</div>}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 mb-5">
              {r.cards.map((c) => <MetricCard key={c.label} label={c.label.toUpperCase()} value={c.value} icon={c.icon} color={c.color} growth={c.growth ?? null} />)}
            </div>

            {r.modes && r.donut && <ModesPartial modes={r.modes} donut={r.donut} />}

            <Card title={r.chart.title} icon={ChartColumn} className="mb-5" subtitle={`Source: ${r.source}`}>
              <div className="min-h-[300px]">
                <Chart key={`${type}-${r.chart.series.length}`} type={r.chart.type} height={r.chart.height} series={r.chart.series} options={r.chart.options} />
              </div>
            </Card>

            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
                <div className="ml-auto">{r.search && <SearchBox value={q} onChange={setQ} placeholder={r.search} />}</div>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="tbl">
                  <thead>
                    <tr>
                      {r.columns.map((c) => (
                        <th key={c.key} className={c.format ? '!text-right' : ''}>
                          {c.sort ? (
                            <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-primary" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}>
                              {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!pageRows.length ? <tr><td colSpan={r.columns.length} className="!py-14 text-center text-muted">No records found.</td></tr>
                      : pageRows.map((row) => (
                        <tr key={row._key}>
                          {r.columns.map((c) => (
                            <td key={c.key} className={cx(c.format && 'text-right tabular-nums', c.bold && 'font-semibold text-navy dark:text-white')}>
                              {c.image ? (
                                <div className="flex items-center gap-2.5">
                                  <img src={imgUrl(row[c.image], String(row[c.key] || 'P'))} className="w-9 h-9 rounded-lg object-cover bg-slate-50 border border-line" alt="" />
                                  <span>{fmtCell(row[c.key], c.format)}</span>
                                </div>
                              ) : fmtCell(row[c.key], c.format)}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line dark:border-dark-line text-sm">
                <div className="flex items-center gap-2 text-muted">
                  <span>Per page</span>
                  <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="input !w-20 !py-1.5">{[10, 20, 50, 100].map((x) => <option key={x} value={x}>{x}</option>)}</select>
                  <span className="hidden sm:inline">Total Records : {rows.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">Page {page + 1} of {lastPage}</span>
                  <button type="button" className="icon-btn" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" className="icon-btn" disabled={page + 1 >= lastPage} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </>
        )}
    </>
  );
}
