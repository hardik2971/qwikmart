'use client';
// Port of admin/languages/index.blade.php (screenshot docs/reference/39.png) — languages/{code} CRUD.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Download, List, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { batchUpdate, removeDoc, saveDoc, useInvalidate, useLanguages } from '@/lib/firestore';
import { errMsg } from '@/lib/format';
import type { Language } from '@/lib/types';
import { PageHeader, StatusPill, Spinner, Toggle, Forbidden, cx } from '@/components/ui';
import { Input, SearchBox } from '@/components/form/fields';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { PLATFORMS, RTL, SUPPORTED, downloadJson, starterKeys } from './languageData';

const on = (s: any) => s === 'active' || s === true;

export default function LanguagesPage() {
  const { p } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const invalidate = useInvalidate();
  const list = useLanguages();
  const [q, setQ] = useState('');
  const [supOpen, setSupOpen] = useState(false);
  const [supQ, setSupQ] = useState('');
  const [add, setAdd] = useState<{ name: string; code: string; rtl: boolean; status: boolean } | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; isDefault: boolean; wasDefault: boolean; status: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const langs = list.data || [];
  const existing = langs.map((l) => l.id);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...langs].filter((l) => !s || l.name?.toLowerCase().includes(s) || l.id.includes(s)).sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || a.name.localeCompare(b.name));
  }, [langs, q]);
  const refresh = () => { invalidate('lookup', 'languages'); list.refetch(); };

  const saveAdd = async () => {
    if (!add) return;
    const code = add.code.trim().toLowerCase();
    if (!add.name.trim()) { toast('The language name is required.', 'error'); return; }
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i.test(code)) { toast('Enter a valid language code (e.g. fr, pt-br).', 'error'); return; }
    if (existing.includes(code)) { toast('This language already exists.', 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('languages', code, { code, name: add.name.trim(), is_rtl: add.rtl, is_default: false, status: add.status ? 'active' : 'inactive' });
      toast(`${add.name} added.`); setAdd(null); refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const saveEdit = async () => {
    if (!edit) return;
    if (!edit.name.trim()) { toast('The display name is required.', 'error'); return; }
    setBusy(true);
    try {
      const makeDefault = edit.isDefault && !edit.wasDefault;
      if (makeDefault) await batchUpdate(langs.filter((l) => l.is_default && l.id !== edit.id).map((l) => ({ path: 'languages', id: l.id, data: { is_default: false } })));
      await saveDoc('languages', edit.id, { name: edit.name.trim(), is_default: edit.wasDefault || edit.isDefault, status: edit.wasDefault || edit.isDefault || edit.status ? 'active' : 'inactive' });
      toast('Language updated.'); setEdit(null); refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const del = async (l: Language) => {
    if (!(await confirm({ title: 'Delete this language and its translations?', message: `${l.name} (${l.id})`, danger: true }))) return;
    try {
      await Promise.all(Object.keys(PLATFORMS).map((pf) => removeDoc('translations', `${l.id}_${pf}`).catch(() => undefined)));
      await removeDoc('languages', l.id);
      toast('Language deleted.'); refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  if (!can('language.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Languages">
        <Link href={p('/settings')} className="btn-outline"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <button type="button" className="btn-primary" onClick={() => { setSupQ(''); setSupOpen(true); }}><List className="w-4 h-4" /> Supported Languages List</button>
        {can('language.create') && <button type="button" className="btn-primary" onClick={() => setAdd({ name: '', code: '', rtl: false, status: true })} data-testid="add-language"><Plus className="w-4 h-4" /> Add Language</button>}
      </PageHeader>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-4">
        <span className="mr-1 text-sm text-muted">Download Sample Files</span>
        {Object.entries(PLATFORMS).map(([pf, [label]]) => (
          <button key={pf} type="button" className="btn-outline btn-sm !border-primary !text-primary hover:!bg-primary-50" onClick={() => downloadJson(starterKeys(pf), `${pf}_sample.json`)}>
            <Download className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-line dark:border-dark-line">
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} />
            <button type="button" className="icon-btn !w-9 !h-9" title="Refresh" onClick={() => { setQ(''); refresh(); }}><RefreshCw className={cx('w-4 h-4', list.isFetching && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="!text-center">Language</th><th className="!text-center">Code</th><th className="!text-center">RTL</th><th className="!text-center">Status</th><th className="!text-center">Actions</th></tr></thead>
            <tbody>
              {list.isLoading ? <tr><td colSpan={5} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : list.error ? <tr><td colSpan={5} className="!py-14 text-center text-muted">{errMsg(list.error)}</td></tr>
                  : !rows.length ? <tr><td colSpan={5} className="!py-14 text-center text-muted">No records found.</td></tr>
                    : rows.map((l) => (
                      <tr key={l.id}>
                        <td className="text-center"><span className="font-medium text-navy dark:text-white">{l.name}</span>{l.is_default && <span className="ml-1.5 pill border border-blue-200 bg-blue-50 text-blue-700">Default</span>}</td>
                        <td className="text-center font-mono text-sm">{l.id}</td>
                        <td className="text-center"><StatusPill status={l.is_rtl ? 'yes' : 'no'} label={l.is_rtl ? 'Yes' : 'No'} /></td>
                        <td className="text-center"><StatusPill status={on(l.status)} /></td>
                        <td>
                          <div className="flex items-center justify-center gap-1.5">
                            {can('language.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => setEdit({ id: l.id, name: l.name, isDefault: !!l.is_default, wasDefault: !!l.is_default, status: on(l.status) })}><Pencil className="w-4 h-4" /></button>}
                            {!l.is_default && can('language.delete') && <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(l)}><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-dark-line text-sm text-muted">Total Records : {rows.length}</div>
      </div>

      {/* Supported languages list */}
      <Modal open={supOpen} onClose={() => setSupOpen(false)} title="Supported Languages List" size="2xl">
        <div className="p-5">
          <input type="search" value={supQ} onChange={(e) => setSupQ(e.target.value)} className="input mb-3" placeholder="Search language" />
          <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 scrollbar-thin">
            {Object.entries(SUPPORTED).filter(([c, nm]) => !supQ || `${nm} ${c}`.toLowerCase().includes(supQ.toLowerCase())).map(([code, name]) => {
              const added = existing.includes(code);
              return (
                <button key={code} type="button" disabled={added}
                  className={cx('flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm', added ? 'border-primary/30 bg-primary-50 cursor-default' : 'border-line hover:border-primary dark:border-dark-line')}
                  onClick={() => { setSupOpen(false); setAdd({ name, code, rtl: RTL.includes(code), status: true }); }}>
                  <span><span className="font-medium text-navy dark:text-white">{name}</span> <span className="text-xs text-muted">({code})</span></span>
                  {added ? <Check className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-muted" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Add language */}
      <Modal open={!!add} onClose={() => setAdd(null)} title="Add Language" size="xl">
        {add && (
          <div className="p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Language Name" required maxLength={80} placeholder="e.g. French" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
              <Input label="Code" required maxLength={10} placeholder="e.g. fr" className="font-mono" value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle checked={add.rtl} onChange={(v) => setAdd({ ...add, rtl: v })} label="Right-to-left (RTL)" />
              <Toggle checked={add.status} onChange={(v) => setAdd({ ...add, status: v })} label="Active" />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-dark-line">
              <button type="button" className="btn-primary" disabled={busy} onClick={saveAdd} data-testid="save">{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn-gray" onClick={() => setAdd(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit language (screenshot 39) */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit Language" size="2xl">
        {edit && (
          <div className="p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="label">Supported Language</label>
                <input type="text" value={`${SUPPORTED[edit.id] ?? edit.name} (${edit.id})`} className="input !bg-slate-100 dark:!bg-slate-800" readOnly />
                <label className={cx('mt-3 flex items-center gap-2 text-sm cursor-pointer', edit.wasDefault && 'opacity-60 cursor-not-allowed')}>
                  <input type="checkbox" checked={edit.isDefault} disabled={edit.wasDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} className="rounded border-line text-primary focus:ring-primary" />
                  Set as a default language
                </label>
              </div>
              <div>
                <Input label="Display Name" required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <label className="label mt-3">Status</label>
                <div className="inline-flex overflow-hidden rounded-lg border border-line dark:border-dark-line">
                  <button type="button" className={cx('flex items-center gap-1.5 px-4 py-2 text-xs font-semibold', !edit.status ? 'bg-red-500 text-white' : 'text-slate-500')} onClick={() => { if (!edit.wasDefault) setEdit({ ...edit, status: false }); }}>
                    <span className={cx('w-3 h-3 rounded-full border-2', !edit.status ? 'border-white bg-white/40' : 'border-slate-300')} /> Deactivate
                  </button>
                  <button type="button" className={cx('flex items-center gap-1.5 px-4 py-2 text-xs font-semibold', edit.status ? 'bg-primary text-white' : 'text-slate-500')} onClick={() => setEdit({ ...edit, status: true })}>
                    <span className={cx('w-3 h-3 rounded-full border-2', edit.status ? 'border-white bg-white/40' : 'border-slate-300')} /> Activate
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <div className="label">Edit JSON Data for System Types:</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(PLATFORMS).map(([pf, [, btn]]) => (
                  <Link key={pf} href={p(`/languages/${edit.id}/${pf}`)} className="btn-primary justify-center"><Pencil className="w-4 h-4" /> {btn}</Link>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4 dark:border-dark-line">
              <button type="button" className="btn-primary" disabled={busy} onClick={saveEdit} data-testid="save">{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn-gray" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
