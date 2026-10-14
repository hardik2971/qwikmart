'use client';
// Port of admin/promo-codes/index.blade.php — coupon cards grid with validity / status / channel filters.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, RefreshCw, TicketPercent, Zap, ShoppingBag, Coins, Sparkles, ShoppingCart, BadgePercent, Calendar, Clock, Users, Globe, Map, Repeat,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fetchList, patchDoc, removeDoc, where } from '@/lib/firestore';
import { fmtDate, imgUrl, money, toDate, tr, errMsg } from '@/lib/format';
import type { PromoCode } from '@/lib/types';
import { PageHeader, RowActions, StatusPill, Toggle, Spinner, Forbidden, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

type State = 'applicable' | 'expired' | 'upcoming' | 'exhausted';
const STATE_CLS: Record<State, string> = {
  applicable: 'bg-emerald-50 text-emerald-700 border-emerald-200', expired: 'bg-red-50 text-red-600 border-red-200',
  upcoming: 'bg-blue-50 text-blue-700 border-blue-200', exhausted: 'bg-amber-50 text-amber-700 border-amber-200',
};
const AUDIENCE: Record<string, string> = { all: 'All customers', new: 'New customers', existing: 'Existing customers' };

export function promoState(p: PromoCode, now = new Date()): State {
  const s = toDate(p.starts_at); const e = toDate(p.ends_at);
  if (!p.is_permanent && e && e < now) return 'expired';
  if (!p.is_permanent && s && s > now) return 'upcoming';
  if (p.usage_limit_total && Number(p.used_count || 0) >= p.usage_limit_total) return 'exhausted';
  return 'applicable';
}
export function promoLabel(p: PromoCode): string {
  if (p.discount_type === 'free_delivery') return 'FREE DELIVERY';
  if (p.discount_type === 'percent') return `${Number(p.discount_value || 0).toFixed(2)}% OFF`;
  return `${money(p.discount_value)} OFF`;
}
const isActive = (p: PromoCode) => p.status === 'active' || (p.status as any) === true;

export default function PromoCodesPage() {
  const { p, isStore, storeId, countryId, countries, uiLang } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [country, setCountry] = useState(countryId);
  const [validity, setValidity] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const size = 12;
  useEffect(() => setCountry(countryId), [countryId]);

  const list = useQuery({
    queryKey: ['list', 'promo_codes', storeId],
    enabled: !isStore || !!storeId,
    queryFn: () => fetchList<PromoCode>('promo_codes', ...(isStore ? [where('store_id', '==', storeId)] : [])),
  });

  const rows = useMemo(() => {
    const now = new Date();
    const s = q.trim().toLowerCase();
    return (list.data || [])
      .filter((x) => !s || x.code?.toLowerCase().includes(s) || tr(x.title, uiLang).toLowerCase().includes(s))
      .filter((x) => !country || !(x.country_ids?.length) || x.country_ids.map(String).includes(country))
      .filter((x) => !status || (status === 'active' ? isActive(x) : !isActive(x)))
      .filter((x) => !channel || !(x.channels?.length) || x.channels.includes(channel as any))
      .filter((x) => {
        if (!validity) return true;
        const st = toDate(x.starts_at); const en = toDate(x.ends_at);
        if (validity === 'permanent') return !!x.is_permanent;
        if (validity === 'expired') return !x.is_permanent && !!en && en < now;
        if (validity === 'upcoming') return !x.is_permanent && !!st && st > now;
        return x.is_permanent || ((!st || st <= now) && (!en || en >= now));
      })
      .sort((a, b) => (toDate((b as any).created_at)?.getTime() ?? 0) - (toDate((a as any).created_at)?.getTime() ?? 0) || b.id.localeCompare(a.id));
  }, [list.data, q, country, status, channel, validity, uiLang]);
  useEffect(() => setPage(0), [q, country, status, channel, validity]);
  const pageRows = rows.slice(page * size, page * size + size);
  const pages = Math.max(1, Math.ceil(rows.length / size));

  const toggleStatus = async (x: PromoCode, v: boolean) => {
    try { await patchDoc('promo_codes', x.id, { status: v ? 'active' : 'inactive' }); toast(v ? 'Promo code activated.' : 'Promo code deactivated.'); list.refetch(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const del = async (x: PromoCode) => {
    if (!(await confirm({ title: 'Delete this promo code?', message: x.code, danger: true }))) return;
    try {
      if (Number(x.used_count || 0) > 0) {
        await patchDoc('promo_codes', x.id, { status: 'inactive' });
        toast('Promo code has been used in orders, so it was deactivated instead of deleted.', 'warning');
      } else { await removeDoc('promo_codes', x.id); toast('Promo code deleted.'); }
      list.refetch();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  const reset = () => { setCountry(countryId); setValidity(''); setStatus(''); setChannel(''); setQ(''); list.refetch(); };

  if (!can('promo_code.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Promo Code">
        {can('promo_code.create') && <Link href={p('/promo-codes/new')} className="btn-primary" data-testid="add-promo"><Plus className="w-4 h-4" /> Add Promo Code</Link>}
      </PageHeader>

      <div className="card p-4 mb-5 flex flex-wrap items-center gap-2.5">
        {!isStore && (
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="input !w-44 !py-2">
            <option value="">All Countries</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={validity} onChange={(e) => setValidity(e.target.value)} className="input !w-40 !py-2">
          <option value="">All validity</option>
          <option value="valid">Currently valid</option><option value="upcoming">Upcoming</option><option value="expired">Expired</option><option value="permanent">Permanent</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-36 !py-2">
          <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input !w-36 !py-2">
          <option value="">All channels</option><option value="quick">Quick</option><option value="ecommerce">eCommerce</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          <button type="button" className="icon-btn !w-9 !h-9" title="Reset" onClick={reset}><RefreshCw className={cx('w-4 h-4', list.isFetching && 'animate-spin')} /></button>
        </div>
      </div>

      {list.isLoading ? <div className="card py-16 flex justify-center"><Spinner /></div>
        : list.error ? <div className="card py-16 text-center text-muted">{errMsg(list.error)}</div>
          : !rows.length ? (
            <div className="card py-16 flex flex-col items-center gap-2 text-muted"><TicketPercent className="w-10 h-10 text-slate-300" /> No promo codes found.</div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {pageRows.map((x) => {
                  const state = promoState(x);
                  const channels = x.channels?.length ? x.channels : ['quick', 'ecommerce'];
                  const mode = channels.length > 1 ? 'Both' : channels[0] === 'ecommerce' ? 'eCommerce' : 'Quick';
                  const cN = x.country_ids?.length || 0; const zN = x.zone_ids?.length || 0;
                  return (
                    <div key={x.id} className="card overflow-hidden flex flex-col" data-testid="promo-card">
                      <div className="flex items-center justify-between px-4 pt-3 pb-2">
                        <span className={cx('pill border', STATE_CLS[state])}>{state[0].toUpperCase() + state.slice(1)}</span>
                        <StatusPill status={isActive(x)} />
                      </div>
                      <div className="mx-4 h-28 rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: x.banner_color || '#0E9623' }}>
                        {x.image && <img src={imgUrl(x.image)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
                        <span className="relative text-white text-2xl font-extrabold tracking-wider drop-shadow">{x.code}</span>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-bold text-navy tracking-wide dark:bg-slate-800 dark:text-white">{x.code}</span>
                          <span className="pill bg-primary text-white">{promoLabel(x)}</span>
                        </div>
                        <h3 className="mt-2 font-bold text-navy leading-snug dark:text-white">{tr(x.title, uiLang)}</h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="pill border bg-slate-50 text-slate-600 border-slate-200">{mode === 'eCommerce' ? <ShoppingBag className="w-3 h-3" /> : <Zap className="w-3 h-3" />} {mode}</span>
                          {x.is_cashback
                            ? <span className="pill border bg-violet-50 text-violet-700 border-violet-200"><Coins className="w-3 h-3" /> Cashback</span>
                            : <span className="pill border bg-emerald-50 text-emerald-700 border-emerald-200"><Sparkles className="w-3 h-3" /> Instant Discount</span>}
                        </div>
                        <ul className="mt-3 space-y-1.5 text-xs text-muted flex-1">
                          <li className="flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" /> Min order: <b className="text-bodytext dark:text-slate-200">{money(x.min_order)}</b></li>
                          {x.discount_type === 'percent' && !!x.max_discount && <li className="flex items-center gap-2"><BadgePercent className="w-3.5 h-3.5" /> Max discount: <b className="text-bodytext dark:text-slate-200">{money(x.max_discount)}</b></li>}
                          <li className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {x.is_permanent ? 'Permanent' : `${x.starts_at ? fmtDate(x.starts_at) : 'Now'} → ${x.ends_at ? fmtDate(x.ends_at) : 'No end'}`}</li>
                          {x.time_from && x.time_to && <li className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {x.time_from.slice(0, 5)} – {x.time_to.slice(0, 5)} daily</li>}
                          <li className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Audience: <b className="text-bodytext dark:text-slate-200">{AUDIENCE[x.audience] ?? x.audience}</b></li>
                          {cN > 0 && <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> Restricted to: {cN} {cN === 1 ? 'country' : 'countries'}</li>}
                          {zN > 0 && <li className="flex items-center gap-2"><Map className="w-3.5 h-3.5" /> Restricted to: {zN} {zN === 1 ? 'zone' : 'zones'}</li>}
                          <li className="flex items-center gap-2"><Repeat className="w-3.5 h-3.5" /> Used {Number(x.used_count || 0)}{x.usage_limit_total ? ` / ${x.usage_limit_total}` : ''} times</li>
                        </ul>
                        <div className="mt-4 pt-3 border-t border-line dark:border-dark-line flex items-center justify-between">
                          <Toggle checked={isActive(x)} onChange={(v) => toggleStatus(x, v)} disabled={!can('promo_code.update')} />
                          <RowActions edit={can('promo_code.update') ? p(`/promo-codes/edit/${x.id}`) : undefined} onDelete={can('promo_code.delete') ? () => del(x) : undefined} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="card mt-5 flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted">Total Records : {rows.length}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">Page {page + 1} of {pages}</span>
                  <button type="button" className="icon-btn" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" className="icon-btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </>
          )}
    </>
  );
}
