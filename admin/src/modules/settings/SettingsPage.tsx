'use client';
// Port of admin/settings/index.blade.php (+ partials field/payment/sms) — vertical tab nav (?tab=).
// Public tabs write settings/public (setDoc merge); secret tabs write settings/private_{payment|sms|smtp|ai}
// (firestore.rules: private_* is readable/writable by role admin only; for anyone else the fields are shown as locked).
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  Save, ShieldAlert, FlaskConical, Lock, KeyRound, Eye, EyeOff, CheckCircle2, Send, AtSign, ShieldCheck, Server, Info, CreditCard, MessageSquare,
} from 'lucide-react';
import { db, firebaseConfig, USE_EMULATORS, FUNCTIONS_REGION, EMU_HOST, EMU_PORT } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { fetchDoc, useZones } from '@/lib/firestore';
import { testSmtp } from '@/lib/callables';
import { errMsg, imgUrl } from '@/lib/format';
import { Card, PageHeader, StatusPill, Toggle, Loading, Forbidden, KV, cx } from '@/components/ui';
import { Field, Input, Select, Textarea, ImageUpload } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { CURRENCIES, FIELDS, GATEWAYS, SMS_DRIVERS, TABS, getPath, setPath, type DocKey, type FieldDef } from './settingsSchema';

const DOCS: DocKey[] = ['public', 'private_payment', 'private_sms', 'private_smtp', 'private_ai'];
type Vals = Record<string, any>;
const k = (d: DocKey, path: string) => `${d}|${path}`;
const TIMEZONES: string[] = (() => { try { return (Intl as any).supportedValuesOf('timeZone') as string[]; } catch { return ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'America/New_York', 'UTC']; } })();

function SecretInput({ label, value, onChange, saved, writeOnly, hint, disabled }: { label: string; value: string; onChange: (v: string) => void; saved: boolean; writeOnly: boolean; hint?: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label flex items-center justify-between">
        <span>{label}</span>
        {writeOnly ? <span className="text-[11px] text-amber-600 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Write-only</span>
          : saved ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Saved</span>
            : <span className="text-[11px] text-muted">Not set</span>}
      </label>
      <div className="relative">
        <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type={show ? 'text' : 'password'} autoComplete="new-password" className="input pl-9 pr-10 font-mono" value={value} disabled={disabled}
          placeholder={saved || writeOnly ? '•••••••••• (leave blank to keep)' : `Enter ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary" onClick={() => setShow(!show)} title="Show / hide">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can, user, claims } = useAuth();
  const superAdmin = claims.role === 'admin';
  const { countries, settings: liveSettings } = usePanel();
  const { data: zones = [] } = useZones();
  const toast = useToast();
  const tab = TABS.some((t) => t.key === sp.get('tab')) ? String(sp.get('tab')) : 'general';
  const tabDef = TABS.find((t) => t.key === tab)!;

  const [docs, setDocs] = useState<Record<string, any>>({});
  const [readable, setReadable] = useState<Record<string, boolean>>({});
  const [vals, setVals] = useState<Vals>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (user?.email && !testTo) setTestTo(user.email); }, [user?.email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const d: Record<string, any> = {}; const r: Record<string, boolean> = {};
      await Promise.all(DOCS.map(async (id) => {
        try { d[id] = (await fetchDoc<any>('settings', id)) || {}; r[id] = true; } catch { d[id] = {}; r[id] = false; }
      }));
      if (!alive) return;
      setDocs(d); setReadable(r);
      // initial values for every schema field
      const v: Vals = {};
      Object.values(FIELDS).flat().forEach((f) => {
        if (f.type === 'secret') { v[k(f.doc, f.path)] = ''; return; }
        const cur = getPath(d[f.doc], f.path);
        v[k(f.doc, f.path)] = f.type === 'toggle' ? (cur === undefined || cur === null ? !!f.default : !!cur) : cur === undefined || cur === null ? (f.default ?? '') : String(cur);
      });
      // older docs may still carry the Laravel key names (mail_host …) — show them in the canonical fields
      const smtpLegacy: Record<string, string> = { host: 'mail_host', port: 'mail_port', username: 'mail_username', encryption: 'mail_encryption', from_email: 'mail_from_address', from_name: 'mail_from_name' };
      Object.entries(smtpLegacy).forEach(([f, legacy]) => {
        const cur = v[k('private_smtp', f)];
        const old = d.private_smtp?.[legacy] ?? (f === 'from_email' ? d.private_smtp?.from_address : undefined);
        if ((cur === '' || cur == null) && old != null && old !== '') v[k('private_smtp', f)] = String(old);
      });
      if (!v[k('private_smtp', 'encryption')] && d.private_smtp?.secure !== undefined) v[k('private_smtp', 'encryption')] = d.private_smtp.secure ? 'ssl' : 'tls';
      if (d.public?.delivery?.auto_assign == null && d.public?.delivery?.assign_mode === 'auto') v[k('public', 'delivery.auto_assign')] = true;
      const pm: any[] = Array.isArray(d.public?.payment_methods) ? d.public.payment_methods : [];
      GATEWAYS.forEach((g) => {
        const e = pm.find((m) => m?.key === g.key);
        const priv = d.private_payment || {};
        v[`pay|${g.key}|enabled`] = e ? !!e.enabled : priv[`${g.key}_enabled`] !== undefined ? !!priv[`${g.key}_enabled`] : g.key === 'cod' || g.key === 'wallet';
        v[`pay|${g.key}|mode`] = e?.mode || priv[`${g.key}_mode`] || (g.fields.length ? 'sandbox' : 'live');
        v[`pay|${g.key}|name`] = e?.name || g.name;
        v[`pay|${g.key}|logo`] = e?.logo || '';
        g.fields.forEach((f) => { v[k('private_payment', f.key)] = f.secret ? '' : String(priv[f.key] ?? (f.key === g.publicKey ? e?.public_key ?? '' : '')); });
      });
      v[k('public', 'cod.max_amount')] = d.public?.cod?.max_amount != null ? String(d.public.cod.max_amount) : '';
      v[k('private_sms', 'gateway')] = d.private_sms?.gateway || d.private_sms?.sms_gateway || 'log';
      SMS_DRIVERS.forEach((drv) => drv.fields.forEach((f) => { v[k('private_sms', f.key)] = f.secret ? '' : String(d.private_sms?.[f.key] ?? ''); }));
      setVals(v); setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const demo = !!(docs.public?.demo_mode ?? liveSettings.demo_mode);
  const locked = demo && !!tabDef.locked;
  const set = (key: string, v: any) => setVals((s) => ({ ...s, [key]: v }));
  const saved = (d: DocKey, path: string) => { const x = getPath(docs[d], path); return x !== undefined && x !== null && x !== ''; };
  const writeOnly = (d: DocKey) => d !== 'public' && readable[d] === false;
  const currency = docs.public?.currency_symbol || liveSettings.currency_symbol || '₹';

  const optionsFor = (f: FieldDef) => {
    if (Array.isArray(f.options)) return f.options;
    if (f.options === 'countries') return countries.map((c) => ({ value: c.id, label: c.name }));
    if (f.options === 'zones') return zones.filter((z) => !vals[k('public', 'default_country_id')] || z.country_id === vals[k('public', 'default_country_id')]).map((z) => ({ value: z.id, label: z.name }));
    if (f.options === 'currencies') return [...new Set([...countries.map((c) => c.currency_code).filter(Boolean), ...CURRENCIES])].map((c) => ({ value: c, label: c }));
    if (f.options === 'timezones') return TIMEZONES.map((t) => ({ value: t, label: t }));
    return [];
  };

  const renderField = (f: FieldDef) => {
    const key = k(f.doc, f.path);
    const v = vals[key];
    const span = f.span === 2 ? 'md:col-span-2' : '';
    const wo = writeOnly(f.doc);
    const section = f.section ? <div key={key + '-s'} className="md:col-span-2 pt-2 -mb-1 border-t border-line dark:border-dark-line first:border-0 first:pt-0"><h4 className="text-xs font-bold uppercase tracking-wide text-muted">{f.section}</h4></div> : null;
    let el: React.ReactNode;
    switch (f.type) {
      case 'toggle': el = <div className={cx(span, 'flex items-center')}><Toggle checked={!!v} onChange={(x) => set(key, x)} label={f.label} description={f.description} disabled={locked} /></div>; break;
      case 'select': el = <Select wrapClass={span} label={f.label} placeholder="Select" options={optionsFor(f)} value={v ?? ''} onChange={(e) => set(key, e.target.value)} disabled={locked} hint={wo ? 'Write-only — current value hidden.' : f.hint} />; break;
      case 'textarea': el = <Textarea wrapClass={span} label={f.label} rows={3} value={v ?? ''} onChange={(e) => set(key, e.target.value)} hint={f.hint} disabled={locked} />; break;
      case 'image': el = <div className={span}><ImageUpload label={f.label} value={v || ''} onChange={(x) => set(key, x)} square={f.path !== 'logo'} folder="catalog/settings" /></div>; break;
      case 'color': el = (
        <div className={span}>
          <label className="label">{f.label}</label>
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#0E9623'} onChange={(e) => set(key, e.target.value)} className="h-[42px] w-14 cursor-pointer rounded-lg border border-line p-1 dark:border-dark-line" />
            <input type="text" value={v ?? ''} onChange={(e) => set(key, e.target.value)} className="input font-mono" maxLength={9} placeholder="#0E9623" />
          </div>
        </div>
      ); break;
      case 'secret': el = <div className={span}><SecretInput label={f.label} value={v ?? ''} onChange={(x) => set(key, x)} saved={saved(f.doc, f.path)} writeOnly={wo} hint={f.hint} disabled={locked} /></div>; break;
      default: el = <Input wrapClass={span} type={f.type === 'number' ? 'number' : f.type} step="any" label={f.label} required={f.required} value={v ?? ''} onChange={(e) => set(key, e.target.value)}
        placeholder={wo ? '(write-only — leave blank to keep)' : f.placeholder} prefix={f.prefix ? currency : undefined} hint={f.hint} disabled={locked} />;
    }
    return <div key={key} className="contents">{section}{el}</div>;
  };

  // -------------------------------------------------------------- save
  const write = async (id: DocKey, data: Record<string, any>) => {
    if (!Object.keys(data).length) return;
    await setDoc(doc(db(), 'settings', id), { ...data, updated_at: serverTimestamp() }, { merge: true });
  };
  const collect = (fields: FieldDef[]) => {
    const out: Partial<Record<DocKey, Record<string, any>>> = {};
    for (const f of fields) {
      const raw = vals[k(f.doc, f.path)];
      let v: any = raw;
      if (f.type === 'toggle') v = !!raw;
      else if (f.type === 'number') v = raw === '' || raw == null ? null : Number(raw);
      else v = typeof raw === 'string' ? raw.trim() : raw;
      if (f.type === 'secret' && !v) continue;
      if (writeOnly(f.doc) && (v === '' || v === null)) continue;
      if (f.type === 'number' && v !== null && !Number.isFinite(v)) throw new Error(`${f.label} must be a number.`);
      if (f.required && !v) throw new Error(`${f.label} is required.`);
      if (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) throw new Error(`${f.label} must be a valid email.`);
      if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) throw new Error(`${f.label} must be a valid URL (https://…).`);
      if (f.type === 'color' && v && !/^#[0-9A-Fa-f]{3,8}$/.test(v)) throw new Error(`${f.label} must be a hex color.`);
      setPath((out[f.doc] ||= {}), f.path, v === '' ? null : v);
    }
    return out;
  };

  const save = async () => {
    setBusy(true);
    try {
      let out: Partial<Record<DocKey, Record<string, any>>> = {};
      if (tab === 'payment') {
        const existing: any[] = Array.isArray(docs.public?.payment_methods) ? docs.public.payment_methods : [];
        const pm = GATEWAYS.map((g) => {
          const e = existing.find((m) => m?.key === g.key) || {};
          const pk = g.publicKey ? String(vals[k('private_payment', g.publicKey)] || '').trim() || e.public_key || null : null;
          return { ...e, key: g.key, name: String(vals[`pay|${g.key}|name`] || g.name), logo: vals[`pay|${g.key}|logo`] || null, enabled: !!vals[`pay|${g.key}|enabled`], public_key: pk, mode: vals[`pay|${g.key}|mode`] || 'sandbox' };
        });
        existing.filter((m) => m?.key && !GATEWAYS.some((g) => g.key === m.key)).forEach((m) => pm.push(m));
        const codMax = vals[k('public', 'cod.max_amount')];
        out.public = { payment_methods: pm, cod: { enabled: !!vals['pay|cod|enabled'], max_amount: codMax === '' ? 0 : Number(codMax) } };
        const priv: Record<string, any> = {};
        GATEWAYS.forEach((g) => {
          priv[`${g.key}_enabled`] = !!vals[`pay|${g.key}|enabled`];
          if (g.fields.length) priv[`${g.key}_mode`] = vals[`pay|${g.key}|mode`] || 'sandbox';
          g.fields.forEach((f) => { const v = String(vals[k('private_payment', f.key)] ?? '').trim(); if (v || (!f.secret && !writeOnly('private_payment'))) priv[f.key] = v || null; });
        });
        out.private_payment = priv;
      } else if (tab === 'sms') {
        const priv: Record<string, any> = { gateway: vals[k('private_sms', 'gateway')] || 'log' };
        SMS_DRIVERS.forEach((d) => d.fields.forEach((f) => { const v = String(vals[k('private_sms', f.key)] ?? '').trim(); if (v || (!f.secret && !writeOnly('private_sms'))) priv[f.key] = v || null; }));
        out.private_sms = priv;
      } else {
        out = collect(FIELDS[tab] || []);
        if (tab === 'smtp' && out.private_smtp) {
          const enc = vals[k('private_smtp', 'encryption')]; const port = Number(vals[k('private_smtp', 'port')] || 0);
          if (enc || port) out.private_smtp.secure = enc === 'ssl' || port === 465;
        }
      }
      for (const id of DOCS) if (out[id]) await write(id, out[id]!);
      toast(`${tabDef.label} settings saved.`);
      setReloadKey((x) => x + 1);
    } catch (e: any) {
      toast(e?.code === 'permission-denied' ? 'You do not have permission to change these settings.' : errMsg(e), 'error');
    }
    setBusy(false);
  };

  const sendTest = async () => {
    if (!/^\S+@\S+\.\S+$/.test(testTo)) { toast('Enter a valid recipient email.', 'error'); return; }
    setTesting(true);
    try { const r = await testSmtp({ to: testTo }); toast(r?.message || `Test mail sent to ${testTo}.`); } catch (e) { toast(`Test mail failed: ${errMsg(e)}`, 'error'); }
    setTesting(false);
  };

  const fbRows = useMemo(() => Object.entries(firebaseConfig) as [string, string][], []);
  if (!can('setting.view')) return <Forbidden />;
  const secretTab = (['payment', 'sms', 'smtp', 'ai'] as string[]).includes(tab);
  const canSave = can('setting.update') && !locked && (!secretTab || superAdmin);

  return (
    <>
      <PageHeader title="System Settings" subtitle={tabDef.desc}>
        {demo && <span className="pill border border-amber-200 bg-amber-50 text-amber-700"><FlaskConical className="w-3.5 h-3.5" /> Demo mode</span>}
      </PageHeader>

      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="card shrink-0 p-2 lg:w-60 h-max lg:sticky lg:top-20">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => router.replace(`${pathname}?tab=${t.key}`)}
              className={cx('w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition', t.key === tab ? 'bg-primary-50 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
              <t.icon className="w-4 h-4" /> {t.label}
              {t.locked && demo && <Lock className="w-3 h-3 ml-auto text-amber-500" />}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-5">
          {loading ? <Loading /> : (
            <>
              {locked && (
                <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <div><b>Demo mode is enabled.</b> Credentials cannot be changed. Disable demo mode in <button type="button" className="underline font-semibold" onClick={() => router.replace(`${pathname}?tab=general`)}>General</button> settings to edit them.</div>
                </div>
              )}
              {(['payment', 'sms', 'smtp', 'ai'] as const).includes(tab as any) && writeOnly(`private_${tab}` as DocKey) && (
                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  <Info className="w-5 h-5 shrink-0" />
                  <div>These credentials are stored in <code>settings/private_{tab}</code>, which only the Super Admin (and Cloud Functions) can read or change.{superAdmin ? <> Fields are <b>write-only</b>: leave a field blank to keep its current value.</> : <> Ask a Super Admin to update them.</>}</div>
                </div>
              )}

              {tab === 'payment' && (
                <>
                  <div className="grid gap-5 xl:grid-cols-2">
                    {GATEWAYS.map((g) => {
                      const on = !!vals[`pay|${g.key}|enabled`];
                      const mode = vals[`pay|${g.key}|mode`] || 'sandbox';
                      const configured = g.fields.length > 0 && g.fields.every((f) => saved('private_payment', f.key) || (f.key === g.publicKey && !!vals[k('private_payment', f.key)]));
                      return (
                        <div key={g.key} className="card p-5" data-testid={`gateway-${g.key}`}>
                          <div className="flex items-center gap-3">
                            <span className="w-11 h-11 rounded-xl bg-primary-50 text-primary flex items-center justify-center overflow-hidden">
                              {vals[`pay|${g.key}|logo`] ? <img src={imgUrl(vals[`pay|${g.key}|logo`])} alt="" className="w-full h-full object-contain" /> : <CreditCard className="w-5 h-5" />}
                            </span>
                            <div className="flex-1">
                              <h3 className="font-bold text-navy dark:text-white">{g.name}</h3>
                              <p className="text-xs text-muted">
                                {!g.fields.length ? (g.key === 'cod' ? 'Customers pay cash to the delivery boy.' : 'Customers pay from their wallet balance.')
                                  : writeOnly('private_payment') ? 'Credentials are write-only' : configured ? <span className="text-emerald-600 font-semibold">Credentials saved</span> : <span className="text-amber-600">Credentials missing</span>}
                              </p>
                            </div>
                            <Toggle checked={on} onChange={(v) => set(`pay|${g.key}|enabled`, v)} disabled={locked} />
                          </div>
                          <div className={cx('mt-4 space-y-4 border-t border-line pt-4 dark:border-dark-line', !on && 'opacity-60')}>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Input label="Display Name" value={vals[`pay|${g.key}|name`] ?? ''} onChange={(e) => set(`pay|${g.key}|name`, e.target.value)} />
                              <ImageUpload label="Logo" value={vals[`pay|${g.key}|logo`] || ''} onChange={(v) => set(`pay|${g.key}|logo`, v)} folder="catalog/settings" />
                            </div>
                            {g.key === 'cod' && <Input label="Max COD order amount" type="number" min={0} prefix={currency} value={vals[k('public', 'cod.max_amount')] ?? ''} onChange={(e) => set(k('public', 'cod.max_amount'), e.target.value)} hint="0 = no limit" />}
                            {g.fields.length > 0 && (
                              <>
                                <div>
                                  <span className="label">Mode</span>
                                  <div className="inline-flex rounded-lg border border-line p-0.5 dark:border-dark-line">
                                    {(['sandbox', 'live'] as const).map((m) => (
                                      <button key={m} type="button" disabled={locked} className={cx('rounded-md px-4 py-1.5 text-xs font-semibold transition', mode === m ? 'bg-primary text-white' : 'text-slate-500')} onClick={() => set(`pay|${g.key}|mode`, m)}>{m === 'live' ? 'Live' : 'Sandbox'}</button>
                                    ))}
                                  </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  {g.fields.map((f) => f.secret
                                    ? <SecretInput key={f.key} label={f.label} value={vals[k('private_payment', f.key)] ?? ''} onChange={(v) => set(k('private_payment', f.key), v)} saved={saved('private_payment', f.key)} writeOnly={writeOnly('private_payment')} disabled={locked} />
                                    : f.options
                                      ? <Select key={f.key} label={f.label} placeholder="Select" options={f.options} value={vals[k('private_payment', f.key)] ?? ''} onChange={(e) => set(k('private_payment', f.key), e.target.value)} disabled={locked} />
                                      : <Input key={f.key} label={f.label} value={vals[k('private_payment', f.key)] ?? ''} onChange={(e) => set(k('private_payment', f.key), e.target.value)} disabled={locked}
                                        placeholder={writeOnly('private_payment') && f.key !== g.publicKey ? '(write-only — leave blank to keep)' : undefined} />)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === 'sms' && (
                <>
                  <Card title="SMS Gateway" subtitle="Provider used to send OTP messages" icon={MessageSquare}>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {SMS_DRIVERS.map((d) => {
                        const on = vals[k('private_sms', 'gateway')] === d.key;
                        return (
                          <button key={d.key} type="button" disabled={locked} onClick={() => set(k('private_sms', 'gateway'), d.key)} className={cx('flex items-center gap-3 rounded-xl border p-3 text-left transition', on ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
                            <span className={cx('w-4 h-4 shrink-0 rounded-full border-2', on ? 'border-primary bg-primary' : 'border-slate-300')} />
                            <span className="text-sm font-semibold text-navy dark:text-white">{d.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {writeOnly('private_sms') && <p className="mt-2 text-xs text-muted">The currently active gateway cannot be read here — pick one and save to change it.</p>}
                  </Card>
                  {SMS_DRIVERS.filter((d) => d.key === vals[k('private_sms', 'gateway')]).map((d) => (
                    <Card key={d.key} title={`${d.name} Credentials`} icon={KeyRound}>
                      {d.fields.length ? (
                        <div className="grid gap-5 md:grid-cols-2">
                          {d.fields.map((f) => f.secret
                            ? <SecretInput key={f.key} label={f.label} value={vals[k('private_sms', f.key)] ?? ''} onChange={(v) => set(k('private_sms', f.key), v)} saved={saved('private_sms', f.key)} writeOnly={writeOnly('private_sms')} disabled={locked} />
                            : <Input key={f.key} label={f.label} value={vals[k('private_sms', f.key)] ?? ''} onChange={(e) => set(k('private_sms', f.key), e.target.value)} disabled={locked} placeholder={writeOnly('private_sms') ? '(write-only — leave blank to keep)' : undefined} />)}
                        </div>
                      ) : d.key === 'firebase'
                        ? <p className="text-sm text-muted">OTP is sent by Firebase Phone Authentication in the apps — no SMS credentials needed. Enable the Phone provider in Firebase console → Authentication.</p>
                        : <p className="text-sm text-muted">OTP codes are only written to the Cloud Functions log. Use for local testing — no SMS is sent.</p>}
                    </Card>
                  ))}
                </>
              )}

              {tab === 'firebase' && (
                <>
                  <div className="card flex items-center gap-4 p-4">
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600"><ShieldCheck className="w-5 h-5" /></span>
                    <div className="flex-1 text-sm">
                      <div className="font-bold text-navy dark:text-white">Firebase is configured</div>
                      <div className="text-muted text-xs">Project <b>{firebaseConfig.projectId}</b> · Functions region {FUNCTIONS_REGION}. Cloud Functions use the built-in Admin SDK credentials — no service account upload is needed.</div>
                    </div>
                    <StatusPill status="active" label="Configured" />
                  </div>
                  <div className="card flex items-center gap-4 p-4">
                    <span className={cx('w-11 h-11 rounded-xl flex items-center justify-center', USE_EMULATORS ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')}><Server className="w-5 h-5" /></span>
                    <div className="flex-1 text-sm">
                      <div className="font-bold text-navy dark:text-white">{USE_EMULATORS ? 'Connected to the local Emulator Suite' : 'Connected to production Firebase'}</div>
                      <div className="text-muted text-xs">{USE_EMULATORS ? `Host ${EMU_HOST} — auth ${EMU_PORT.auth}, firestore ${EMU_PORT.firestore}, functions ${EMU_PORT.functions}, storage ${EMU_PORT.storage}.` : 'Set NEXT_PUBLIC_USE_EMULATORS=true to use the emulators locally.'}</div>
                    </div>
                    <StatusPill status={USE_EMULATORS ? 'pending' : 'active'} label={USE_EMULATORS ? 'Emulator' : 'Production'} />
                  </div>
                  <Card title="Web Config in use" subtitle="From NEXT_PUBLIC_FIREBASE_* environment variables (read-only)." icon={Info}>
                    {fbRows.map(([key, v]) => <KV key={key} label={<span className="font-mono text-xs">{key}</span>}><span className="font-mono text-xs break-all">{demo && /apiKey|appId/.test(key) ? `${String(v).slice(0, 6)}••••••••` : v}</span></KV>)}
                  </Card>
                  <Card title="Web Push" subtitle="Used by the website for browser notifications." icon={KeyRound}>
                    <div className="grid gap-5 md:grid-cols-2">{(FIELDS.firebase || []).map(renderField)}</div>
                  </Card>
                </>
              )}

              {!['payment', 'sms', 'firebase'].includes(tab) && (
                <Card title={tabDef.label} subtitle={tabDef.desc} icon={tabDef.icon}>
                  <div className="grid gap-5 md:grid-cols-2">{(FIELDS[tab] || []).map(renderField)}</div>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" className="btn-outline" onClick={() => setReloadKey((x) => x + 1)}>Reset</button>
                <button type="button" className="btn-primary" disabled={busy || !canSave} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : `Save ${tabDef.label}`}</button>
              </div>

              {tab === 'smtp' && (
                <Card title="Send Test Mail" subtitle="Uses the saved SMTP settings above." icon={Send}>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Recipient" required className="flex-1 min-w-[240px]">
                      <div className="relative">
                        <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="email" className="input pl-9" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                      </div>
                    </Field>
                    <button type="button" className="btn-soft" disabled={testing} onClick={sendTest} data-testid="test-smtp"><Send className="w-4 h-4" /> {testing ? 'Sending…' : 'Send test mail'}</button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
