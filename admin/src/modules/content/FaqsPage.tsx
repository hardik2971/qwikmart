'use client';
// Port of admin/faqs/{index,form}.blade.php — list + modal CRUD (question/answer LangTabs, sort, status).
import { useMemo, useState } from 'react';
import { Pencil, Plus, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { patchDoc, removeDoc, saveDoc, useListQ } from '@/lib/firestore';
import { errMsg, tr } from '@/lib/format';
import type { Faq, Trans } from '@/lib/types';
import { PageHeader, RowActions, StatusPill, Spinner, Toggle, Forbidden, cx } from '@/components/ui';
import { Input, SearchBox } from '@/components/form/fields';
import { Modal } from '@/components/ui/Modal';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

const sortOf = (f: Faq) => Number(f.sort_order ?? f.sort ?? 0);
const isOn = (s: any) => s === 'active' || s === true;
const strip = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export default function FaqsPage() {
  const { uiLang } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const list = useListQ<Faq>(['all'], 'faqs');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<{ id: string | null; question: Trans; answer: Trans; sort: string; status: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || [])
      .filter((f) => !status || (status === 'active' ? isOn(f.status) : !isOn(f.status)))
      .filter((f) => !s || tr(f.question, uiLang).toLowerCase().includes(s) || tr(f.answer, uiLang).toLowerCase().includes(s))
      .sort((a, b) => sortOf(a) - sortOf(b) || a.id.localeCompare(b.id));
  }, [list.data, q, status, uiLang]);

  const openNew = () => setEdit({ id: null, question: {}, answer: {}, sort: String((list.data || []).reduce((m, f) => Math.max(m, sortOf(f)), 0) + 1), status: true });
  const save = async () => {
    if (!edit) return;
    if (!(edit.question.en || Object.values(edit.question).some(Boolean))) { toast('The question is required.', 'error'); return; }
    if (!(edit.answer.en || Object.values(edit.answer).some(Boolean))) { toast('The answer is required.', 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('faqs', edit.id, { question: edit.question, answer: edit.answer, sort_order: Number(edit.sort || 0), status: edit.status ? 'active' : 'inactive' });
      toast(edit.id ? 'FAQ updated.' : 'FAQ created.');
      setEdit(null); list.refetch();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const toggle = async (f: Faq) => {
    try { await patchDoc('faqs', f.id, { status: isOn(f.status) ? 'inactive' : 'active' }); list.refetch(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const del = async (f: Faq) => {
    if (!(await confirm({ title: 'Delete this FAQ?', message: tr(f.question, uiLang), danger: true }))) return;
    try { await removeDoc('faqs', f.id); toast('FAQ deleted.'); list.refetch(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  if (!can('faq.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="FAQs">
        {can('faq.create') && <button type="button" className="btn-primary" onClick={openNew} data-testid="add-faq"><Plus className="w-4 h-4" /> Add FAQ</button>}
      </PageHeader>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40 !py-2">
            <option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search FAQs" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Refresh" onClick={() => { setQ(''); setStatus(''); list.refetch(); }}><RefreshCw className={cx('w-4 h-4', list.isFetching && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Question</th><th>Answer</th><th>Sort</th><th>Status</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {list.isLoading ? <tr><td colSpan={5} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : list.error ? <tr><td colSpan={5} className="!py-14 text-center text-muted">{errMsg(list.error)}</td></tr>
                  : !rows.length ? <tr><td colSpan={5} className="!py-14 text-center text-muted">No records found.</td></tr>
                    : rows.map((f) => {
                      const a = strip(tr(f.answer, uiLang));
                      return (
                        <tr key={f.id}>
                          <td className="font-medium text-navy dark:text-white max-w-xs">{tr(f.question, uiLang)}</td>
                          <td className="text-muted max-w-md">{a.length > 110 ? a.slice(0, 110) + '…' : a}</td>
                          <td>{sortOf(f)}</td>
                          <td><button type="button" onClick={() => can('faq.update') && toggle(f)} title="Toggle status"><StatusPill status={isOn(f.status)} /></button></td>
                          <td>
                            <RowActions onDelete={can('faq.delete') ? () => del(f) : undefined}>
                              {can('faq.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => setEdit({ id: f.id, question: f.question || {}, answer: f.answer || {}, sort: String(sortOf(f)), status: isOn(f.status) })}><Pencil className="w-4 h-4" /></button>}
                            </RowActions>
                          </td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-dark-line text-sm text-muted">Total Records : {rows.length}</div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit FAQ' : 'Add FAQ'} size="3xl">
        {edit && (
          <div className="p-5">
            <p className="text-xs text-muted mb-4">Shown in the Help / FAQ section of the apps and website.</p>
            <LangTabs translate>
              <TransInput label="Question" required value={edit.question} onChange={(v) => setEdit((s) => (s ? { ...s, question: v } : s))} />
              <TransInput label="Answer" type="textarea" rows={5} required value={edit.answer} onChange={(v) => setEdit((s) => (s ? { ...s, answer: v } : s))} />
            </LangTabs>
            <div className="grid gap-5 md:grid-cols-2 mt-5">
              <Input label="Sort Order" type="number" min={0} value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} hint="Lower numbers appear first." />
              <div className="flex items-end pb-3"><Toggle checked={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} label="Active" description="Inactive FAQs are hidden." /></div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5 dark:border-dark-line">
              <button type="button" className="btn-outline" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save FAQ'}</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
