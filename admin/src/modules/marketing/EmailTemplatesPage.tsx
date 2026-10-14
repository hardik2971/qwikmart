'use client';
// Port of admin/email/templates.blade.php — email_templates/{key} CRUD (store panel: view only).
import { useState } from 'react';
import { Eye, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { removeDoc, saveDoc, useListQ } from '@/lib/firestore';
import { errMsg, fmtDate } from '@/lib/format';
import type { EmailTemplate } from '@/lib/types';
import { PageHeader, Spinner, Forbidden } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/form/fields';
import { RichEditor } from '@/components/form/RichEditor';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

export const EMAIL_PLACEHOLDERS: Record<string, string> = {
  '{name}': 'Customer name', '{email}': 'Customer email', '{order_number}': 'Order number', '{order_total}': 'Order total',
  '{status}': 'Order status', '{otp}': 'One-time password', '{app_name}': 'App name', '{store_name}': 'Store name',
  '{amount}': 'Amount', '{link}': 'Action link',
};
const human = (k: string) => k.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function EmailTemplatesPage() {
  const { p, isStore } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const list = useListQ<EmailTemplate & { key?: string; updated_at?: any }>(['all'], 'email_templates', [], { enabled: !isStore });
  const [edit, setEdit] = useState<{ isNew: boolean; key: string; subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = isStore || !can('email.create');
  const rows = [...(list.data || [])].sort((a, b) => a.id.localeCompare(b.id));

  const save = async () => {
    if (!edit) return;
    const key = edit.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    if (!key) { toast('The key is required.', 'error'); return; }
    if (!edit.subject.trim()) { toast('The subject is required.', 'error'); return; }
    if (edit.isNew && rows.some((r) => r.id === key)) { toast('A template with this key already exists.', 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('email_templates', key, { key, subject: edit.subject.trim(), body: edit.body || '' });
      toast(`Template "${human(key)}" ${edit.isNew ? 'created' : 'updated'}.`);
      setEdit(null); list.refetch();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const del = async (t: EmailTemplate) => {
    if (!(await confirm({ title: `Delete template "${human(t.id)}"?`, message: 'The platform falls back to its built-in text for this email.', danger: true }))) return;
    try { await removeDoc('email_templates', t.id); toast('Template deleted.'); list.refetch(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  // email_templates are platform-wide (rules: admin / staff only) — not part of the store panel
  if (isStore || !can('email.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Email Templates" subtitle="Transactional emails sent automatically by the platform" back={p('/email')}>
        {!readOnly && <button type="button" className="btn-primary" onClick={() => setEdit({ isNew: true, key: '', subject: '', body: '' })} data-testid="add-template"><Plus className="w-4 h-4" /> Add Template</button>}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>#</th><th>Template</th><th>Subject</th><th>Last Updated</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {list.isLoading ? <tr><td colSpan={5} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : list.error ? <tr><td colSpan={5} className="!py-14 text-center text-muted">{errMsg(list.error)}</td></tr>
                  : !rows.length ? <tr><td colSpan={5} className="!py-14 text-center text-muted">No email templates found.</td></tr>
                    : rows.map((t, i) => (
                      <tr key={t.id}>
                        <td className="font-semibold text-navy dark:text-white">{i + 1}</td>
                        <td><span className="font-semibold text-navy dark:text-white">{human(t.id)}</span><span className="block text-xs text-muted font-mono">{t.id}</span></td>
                        <td className="max-w-md">{t.subject}</td>
                        <td className="text-muted whitespace-nowrap">{fmtDate(t.updated_at)}</td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <button type="button" className="icon-btn" title={readOnly ? 'View' : 'Edit'} onClick={() => setEdit({ isNew: false, key: t.id, subject: t.subject || '', body: t.body || '' })}>
                              {readOnly ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                            </button>
                            {!readOnly && <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(t)}><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="3xl" title={edit ? (edit.isNew ? 'Add Template' : `Edit Template — ${human(edit.key)}`) : ''}>
        {edit && (
          <div className="p-5 space-y-4">
            {edit.isNew && <Input label="Key" required placeholder="e.g. order_placed" value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value })} hint="Lowercase identifier used by the platform (order_placed, order_delivered, welcome, password_reset …)." />}
            <Input label="Subject" required value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} readOnly={readOnly} />
            <div>
              <span className="label">Body</span>
              {readOnly
                ? <div className="input min-h-[200px] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: edit.body || '<p class="text-muted">Empty</p>' }} />
                : <RichEditor value={edit.body} onChange={(v) => setEdit((s) => (s ? { ...s, body: v } : s))} minHeight={280} />}
            </div>
            <div className="rounded-xl bg-slate-50 border border-line p-3 dark:bg-slate-800 dark:border-dark-line">
              <p className="text-xs font-semibold text-navy dark:text-white mb-2">Available placeholders</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(EMAIL_PLACEHOLDERS).map(([ph, desc]) => (
                  <button type="button" key={ph} className="chip" title={desc} disabled={readOnly} onClick={() => setEdit((s) => (s ? { ...s, body: (s.body || '') + ph } : s))}><code className="text-primary">{ph}</code></button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-gray" onClick={() => setEdit(null)}>{readOnly ? 'Close' : 'Cancel'}</button>
              {!readOnly && <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Template'}</button>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
