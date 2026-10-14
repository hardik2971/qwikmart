'use client';
// Port of admin/email/index.blade.php — bulk email composer (callable sendBulkEmail) + mail_log table.
import { useState } from 'react';
import Link from 'next/link';
import { LayoutTemplate, Info, Mail, Send, X } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { sendBulkEmail } from '@/lib/callables';
import { errMsg, fmtDateTime } from '@/lib/format';
import { Card, PageHeader, Forbidden, cx } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/form/fields';
import { RichEditor } from '@/components/form/RichEditor';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { UserPicker, type PickedUser } from './UserPicker';

interface MailLog { id: string; to: string; subject: string; status: string; error?: string; created_at?: any }

const ADMIN_SEGMENTS: [string, string, string][] = [
  ['all', 'Everyone', 'Customers, delivery boys and store owners'],
  ['customers', 'All customers', 'Active customers with an email'],
  ['delivery_boys', 'Delivery boys', 'All approved delivery partners'],
  ['stores', 'Store owners', 'Owners / managers of every store'],
  ['specific', 'Specific users', 'Pick individual recipients'],
];
const STORE_SEGMENTS: [string, string, string][] = [
  ['customers', 'My customers', 'Customers who ordered from your store'],
  ['specific', 'Specific customers', 'Pick individual customers'],
];
const PILL: Record<string, string> = { sent: 'bg-emerald-50 text-emerald-700 border-emerald-200', failed: 'bg-red-50 text-red-600 border-red-200' };

export default function EmailPage() {
  const { p, isStore, storeId, isAdmin, settings } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const segments = isStore ? STORE_SEGMENTS : ADMIN_SEGMENTS;
  const [segment, setSegment] = useState(segments[0][0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<PickedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = async () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = 'The subject is required.';
    if (!body.replace(/<[^>]*>/g, '').trim()) e.body = 'Email body cannot be empty.';
    if (segment === 'specific' && !picked.length) e.users = 'Pick at least one recipient.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!(await confirm({ title: 'Send this email?', message: 'The email will be sent to the selected audience.', confirmText: 'Send' }))) return;
    setBusy(true);
    try {
      const res = await sendBulkEmail({ subject: subject.trim(), body, segment, user_ids: segment === 'specific' ? picked.map((u) => u.id) : undefined });
      toast(res?.message || (res?.sent != null ? `Email sent to ${res.sent} recipients.` : 'Email queued.'));
      setSubject(''); setBody(''); setPicked([]); setRefresh((r) => r + 1);
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  if (!can('email.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Email" subtitle="Send bulk emails to your customers">
        {!isStore && <Link href={p('/email/templates')} className="btn-outline"><LayoutTemplate className="w-4 h-4" /> Email Templates</Link>}
      </PageHeader>

      {settings.demo_mode && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info className="w-5 h-5 shrink-0" /> Demo mode is on — emails are logged with status “demo” but not actually delivered.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card title="Compose Email" icon={Mail}>
            <div className="space-y-5">
              <div>
                <span className="label">Audience<span className="text-red-500"> *</span></span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {segments.map(([v, l, d]) => (
                    <button key={v} type="button" onClick={() => setSegment(v)} className={cx('flex items-center gap-3 rounded-xl border p-3 text-left', segment === v ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
                      <span className={cx('w-4 h-4 shrink-0 rounded-full border-2', segment === v ? 'border-primary bg-primary' : 'border-slate-300')} />
                      <span className="text-sm"><span className="block font-semibold text-navy dark:text-white">{l}</span><span className="text-xs text-muted">{d}</span></span>
                    </button>
                  ))}
                </div>
              </div>
              {segment === 'specific' && (
                <div>
                  <UserPicker label="Add recipient" value={null} storeId={isStore ? storeId : null}
                    onChange={(u) => { if (u && !picked.some((x) => x.id === u.id)) setPicked([...picked, u]); }} error={errors.users} />
                  {picked.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {picked.map((u) => (
                        <span key={u.id} className="pill border border-primary/30 bg-primary-50 text-primary">
                          {u.name}{u.email ? ` <${u.email}>` : ''}
                          <button type="button" onClick={() => setPicked(picked.filter((x) => x.id !== u.id))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Input label="Subject" required placeholder="e.g. Weekend sale — up to 50% off, {name}!" value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} maxLength={190} />
              <div>
                <span className="label">Body<span className="text-red-500"> *</span></span>
                <RichEditor value={body} onChange={setBody} minHeight={260} />
                <p className="mt-1.5 text-xs text-muted">Placeholders: <code className="text-primary">{'{name}'}</code> <code className="text-primary">{'{email}'}</code> <code className="text-primary">{'{app_name}'}</code></p>
                {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end border-t border-line pt-5 dark:border-dark-line">
              <button type="button" className="btn-primary" disabled={busy || !can('email.create')} onClick={send} data-testid="send-email"><Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Send Email'}</button>
            </div>
          </Card>
        </div>

        <div className="xl:col-span-2">
          {isAdmin || !isStore ? (
            <DataTable<MailLog>
              path="mail_log"
              refreshKey={refresh}
              defaultSort={{ field: 'created_at', dir: 'desc' }}
              filters={[{ key: 'status', placeholder: 'All', options: ['sent', 'failed', 'demo'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }]}
              empty="No emails sent yet."
              columns={[
                { key: 'to', header: 'To', className: 'text-xs', render: (r) => r.to },
                { key: 'subject', header: 'Subject', className: 'text-xs max-w-[200px] truncate', render: (r) => <span title={r.subject}>{r.subject}</span> },
                { key: 'status', header: 'Status', render: (r) => <span className={cx('pill border', PILL[r.status] || 'bg-blue-50 text-blue-700 border-blue-200')} title={r.error || undefined}>{r.status ? r.status[0].toUpperCase() + r.status.slice(1) : '—'}</span> },
                { key: 'created_at', header: 'Date', sort: 'created_at', className: 'text-xs text-muted whitespace-nowrap', render: (r) => fmtDateTime(r.created_at) },
              ]}
            />
          ) : (
            <Card title="Mail Log"><p className="text-sm text-muted">The mail log is visible to the platform admin only.</p></Card>
          )}
        </div>
      </div>
    </>
  );
}
