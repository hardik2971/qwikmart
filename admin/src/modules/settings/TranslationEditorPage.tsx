'use client';
// Port of admin/languages/json.blade.php — translations/{code}_{platform}.data key/value editor + raw JSON view, import/export.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Braces, Table2, WandSparkles, CheckCircle, Import, Plus, X, Save, Download, Upload, Search } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fetchDoc, saveDoc, useLanguages } from '@/lib/firestore';
import { errMsg, timeAgo } from '@/lib/format';
import type { Translation } from '@/lib/types';
import { PageHeader, Loading, Forbidden, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PLATFORMS, SUPPORTED, downloadJson, starterKeys } from './languageData';

interface Row { id: number; k: string; v: string }
let seq = 0;
const toRows = (o: Record<string, any>): Row[] => Object.entries(o).map(([k, v]) => ({ id: ++seq, k, v: typeof v === 'string' ? v : JSON.stringify(v) }));
const fromRows = (rows: Row[]) => { const o: Record<string, string> = {}; rows.forEach((r) => { if (r.k.trim()) o[r.k.trim()] = r.v; }); return o; };
function parse(text: string): Record<string, string> {
  const o = JSON.parse(text || '{}');
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('Root must be an object of "key": "value" pairs');
  return o;
}

export default function TranslationEditorPage() {
  const params = useParams<{ code: string; platform: string }>();
  const code = String(params?.code || '');
  const platform = String(params?.platform || '');
  const { p } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { data: langs = [] } = useLanguages();
  const lang = langs.find((l) => l.id === code);
  const def = langs.find((l) => l.is_default) || langs.find((l) => l.id === 'en');
  const defCode = def?.id || 'en';
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState('{}');
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [view, setView] = useState<'table' | 'code'>('table');
  const [filter, setFilter] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const validPlatform = !!PLATFORMS[platform];

  useEffect(() => {
    if (!validPlatform || !code) return;
    let alive = true;
    (async () => {
      setLoaded(false);
      try {
        const [cur, dflt] = await Promise.all([
          fetchDoc<Translation & { updated_at?: any }>('translations', `${code}_${platform}`),
          code === defCode ? Promise.resolve(null) : fetchDoc<Translation>('translations', `${defCode}_${platform}`),
        ]);
        if (!alive) return;
        const d = code === defCode ? starterKeys(platform) : (dflt?.data && Object.keys(dflt.data).length ? dflt.data : starterKeys(platform));
        setDefaults(d);
        const data = cur?.data || {};
        setRows(toRows(data)); setText(JSON.stringify(data, null, 2)); setUpdatedAt(cur?.updated_at || null); setError('');
      } catch (e) { toast(errMsg(e), 'error'); }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [code, platform, defCode]);

  const current = (): Record<string, string> | null => {
    if (view === 'table') return fromRows(rows);
    try { const o = parse(text); setError(''); return o; } catch (e: any) { setError(e.message); return null; }
  };
  const stats = useMemo(() => {
    let o: Record<string, string> = {};
    if (view === 'table') o = fromRows(rows); else { try { o = parse(text); } catch { /* */ } }
    return { count: Object.keys(o).length, missing: Object.keys(defaults).filter((k) => !(k in o)).length };
  }, [rows, text, view, defaults]);

  const toTable = () => { try { const o = parse(text); setRows(toRows(o)); setError(''); setView('table'); } catch (e: any) { setError(e.message); toast('Fix the JSON before switching view', 'error'); } };
  const toCode = () => { if (view === 'table') setText(JSON.stringify(fromRows(rows), null, 2)); setError(''); setView('code'); };
  const format = () => { try { setText(JSON.stringify(parse(text), null, 2)); setError(''); toast('Formatted'); } catch (e: any) { setError(e.message); toast(e.message, 'error'); } };
  const validate = () => { try { const o = parse(text); setError(''); toast(`JSON is valid (${Object.keys(o).length} keys)`); } catch (e: any) { setError(e.message); toast(e.message, 'error'); } };
  const apply = (o: Record<string, string>) => { if (view === 'table') setRows(toRows(o)); else setText(JSON.stringify(o, null, 2)); };
  const importDefault = () => {
    const o = current(); if (!o) { toast('Fix the JSON first', 'error'); return; }
    let added = 0;
    Object.entries(defaults).forEach(([k, v]) => { if (!(k in o)) { o[k] = v; added++; } });
    apply(o);
    toast(added ? `${added} missing keys imported from the default language` : 'No missing keys');
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const incoming = parse(await f.text());
      const o = current(); if (!o) { toast('Fix the JSON first', 'error'); return; }
      const merged = { ...o, ...Object.fromEntries(Object.entries(incoming).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])) };
      apply(merged);
      toast(`${Object.keys(incoming).length} keys imported from ${f.name}`);
    } catch (e: any) { toast(`Invalid JSON file: ${e.message}`, 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const exportFile = () => { const o = current(); if (!o) { toast('Fix the JSON first', 'error'); return; } downloadJson(o, `${code}_${platform}.json`); };

  const save = async () => {
    const o = current();
    if (!o) { toast(error || 'Invalid JSON', 'error'); return; }
    const bad = Object.entries(o).find(([, v]) => typeof v !== 'string');
    if (bad) { toast(`Value of "${bad[0]}" must be a string.`, 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('translations', `${code}_${platform}`, { language: code, platform, data: o }, { merge: false });
      setUpdatedAt(new Date());
      toast(`${PLATFORMS[platform][0]} translations saved (${Object.keys(o).length} keys).`);
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  const visible = (r: Row) => {
    if (onlyEmpty && r.v) return false;
    const f = filter.toLowerCase();
    return !f || r.k.toLowerCase().includes(f) || r.v.toLowerCase().includes(f);
  };

  if (!can('language.update')) return <Forbidden />;
  if (!validPlatform) return <div className="card p-10 text-center text-muted">Unknown platform.</div>;
  const name = lang?.name || SUPPORTED[code] || code;
  const rtl = !!lang?.is_rtl;

  return (
    <>
      <PageHeader title={`${name} — ${PLATFORMS[platform][0]} Translations`} subtitle={`Language code: ${code}${updatedAt ? ` · last saved ${timeAgo(updatedAt)}` : ' · not saved yet'}`} back={p('/languages')}>
        <button type="button" className="btn-outline" onClick={() => downloadJson(starterKeys(platform), `${platform}_sample.json`)}><Download className="w-4 h-4" /> Sample</button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(PLATFORMS).map(([pf, [label]]) => <Link key={pf} href={p(`/languages/${code}/${pf}`)} className={pf === platform ? 'chip chip-active' : 'chip'}>{label}</Link>)}
      </div>

      {!loaded ? <Loading /> : (
        <div className="card">
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 pt-5">
            <div className="inline-flex rounded-lg border border-line p-0.5 dark:border-dark-line mr-auto">
              <button type="button" className={cx('rounded-md px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1', view === 'table' ? 'bg-primary text-white' : 'text-slate-500')} onClick={toTable}><Table2 className="w-3.5 h-3.5" /> Key / Value</button>
              <button type="button" className={cx('rounded-md px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1', view === 'code' ? 'bg-primary text-white' : 'text-slate-500')} onClick={toCode}><Braces className="w-3.5 h-3.5" /> JSON</button>
            </div>
            {view === 'code' && <button type="button" className="btn-outline btn-sm" onClick={format}><WandSparkles className="w-3.5 h-3.5" /> Format</button>}
            {view === 'code' && <button type="button" className="btn-outline btn-sm" onClick={validate}><CheckCircle className="w-3.5 h-3.5" /> Validate</button>}
            <button type="button" className="btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Import JSON</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
            <button type="button" className="btn-outline btn-sm" onClick={exportFile}><Download className="w-3.5 h-3.5" /> Export JSON</button>
            <button type="button" className="btn-soft btn-sm" onClick={importDefault} data-testid="copy-missing"><Import className="w-3.5 h-3.5" /> Copy missing keys from {code === defCode ? 'starter set' : def?.name || 'English'}</button>
          </div>
          <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
              <span className={cx('pill border', error ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{error ? 'Invalid JSON' : 'Valid JSON'}</span>
              <span className="text-muted">{stats.count} keys</span>
              {stats.missing > 0 && <span className="text-muted">{stats.missing} keys missing vs default</span>}
              {error && <span className="text-red-500 font-mono">{error}</span>}
            </div>

            {view === 'code' ? (
              <textarea value={text} onChange={(e) => { setText(e.target.value); try { parse(e.target.value); setError(''); } catch (er: any) { setError(er.message); } }} spellCheck={false}
                className="input font-mono text-[13px] leading-relaxed !min-h-[60vh] whitespace-pre" style={{ tabSize: 2 }} />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter keys or values" className="input !py-2 !pl-9 w-64" />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} className="rounded border-line text-primary" /> Only empty</label>
                  <button type="button" className="btn-outline btn-sm ml-auto" onClick={() => { setFilter(''); setOnlyEmpty(false); setRows([{ id: ++seq, k: '', v: '' }, ...rows]); }} data-testid="add-key"><Plus className="w-3.5 h-3.5" /> Add key</button>
                </div>
                <div className="max-h-[60vh] overflow-auto rounded-xl border border-line dark:border-dark-line scrollbar-thin">
                  <table className="tbl">
                    <thead><tr><th className="w-1/4">Key</th><th className="w-1/3">Default</th><th>Translation</th><th className="w-12" /></tr></thead>
                    <tbody>
                      {!rows.length && <tr><td colSpan={4} className="!py-10 text-center text-muted">No keys yet — use “Copy missing keys” or “Add key”.</td></tr>}
                      {rows.filter(visible).map((r) => (
                        <tr key={r.id}>
                          <td><input type="text" value={r.k} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, k: e.target.value } : x)))} className="input !py-1.5 font-mono text-xs" /></td>
                          <td className="text-xs text-muted">{defaults[r.k] ?? '—'}</td>
                          <td><input type="text" dir={rtl ? 'rtl' : 'ltr'} value={r.v} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, v: e.target.value } : x)))} className={cx('input !py-1.5 text-sm', !r.v && '!border-amber-300')} /></td>
                          <td><button type="button" className="icon-btn hover:!text-red-500" title="Delete key" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}><X className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-5 dark:border-dark-line">
              <Link href={p('/languages')} className="btn-outline">Cancel</Link>
              <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Translations'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
