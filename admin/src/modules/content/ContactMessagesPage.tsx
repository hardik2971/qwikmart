'use client';
// Website "Contact us" form submissions (contact_messages, written by the submitContactMessage callable).
import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { Eye, Mail, Phone, RefreshCw, Reply } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { patchDoc, removeDoc, useListQ } from '@/lib/firestore';
import { errMsg, fmtDateTime, timeAgo } from '@/lib/format';
import { PageHeader, RowActions, StatusPill, Spinner, Forbidden, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

interface ContactMessage {
  id: string; ticket?: string; name: string; email: string; phone?: string | null; topic: string; order_no?: string | null;
  message: string; status: 'new' | 'in_progress' | 'resolved'; admin_note?: string | null; source?: string; created_at?: any;
}

const TOPICS: Record<string, string> = {
  order: 'Order issue', payment: 'Payment / refund', delivery: 'Delivery', return: 'Return / replacement', account: 'Account / login',
  partner: 'Sell or deliver with us', feedback: 'Feedback', other: 'Other',
};
const STATUSES = [
  { key: 'new', label: 'New', pill: 'pending' },
  { key: 'in_progress', label: 'In progress', pill: 'processing' },
  { key: 'resolved', label: 'Resolved', pill: 'active' },
] as const;
const statusOf = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[0];

export default function ContactMessagesPage() {
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const list = useListQ<ContactMessage>(['recent'], 'contact_messages', [orderBy('created_at', 'desc'), limit(500)]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [topic, setTopic] = useState('');
  const [view, setView] = useState<ContactMessage | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canReply = can('chat.reply');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || [])
      .filter((m) => !status || m.status === status)
      .filter((m) => !topic || m.topic === topic)
      .filter((m) => !s || [m.ticket, m.name, m.email, m.phone, m.order_no, m.message].some((v) => String(v ?? '').toLowerCase().includes(s)));
  }, [list.data, q, status, topic]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.key, (list.data || []).filter((m) => m.status === s.key).length])), [list.data]);

  const open = (m: ContactMessage) => { setView(m); setNote(m.admin_note || ''); };
  const setStatusOf = async (m: ContactMessage, next: ContactMessage['status'], adminNote = m.admin_note ?? null) => {
    setBusy(true);
    try {
      await patchDoc('contact_messages', m.id, { status: next, admin_note: adminNote || null });
      toast(`Marked as ${statusOf(next).label.toLowerCase()}.`);
      setView((v) => (v && v.id === m.id ? { ...v, status: next, admin_note: adminNote } : v));
      list.refetch();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const del = async (m: ContactMessage) => {
    if (!(await confirm({ title: 'Delete this message?', message: `${m.ticket ?? ''} ${m.name} — ${m.email}`, danger: true }))) return;
    try { await removeDoc('contact_messages', m.id); toast('Message deleted.'); setView(null); list.refetch(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const replyHref = (m: ContactMessage) =>
    `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${TOPICS[m.topic] ?? 'Your message'} (${m.ticket ?? ''})`)}&body=${encodeURIComponent(`Hi ${m.name},\n\n\n\n---\nYour message:\n${m.message}`)}`;

  if (!can('chat.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Contact Messages" subtitle="Messages sent from the website Contact us form" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {STATUSES.map((s) => (
          <button key={s.key} type="button" onClick={() => setStatus(status === s.key ? '' : s.key)} className={cx('card p-4 text-left transition', status === s.key && 'ring-2 ring-primary')}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-navy dark:text-white">{counts[s.key] ?? 0}</p>
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-line dark:border-dark-line">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40 !py-2">
            <option value="">All Statuses</option>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input !w-48 !py-2">
            <option value="">All Topics</option>{Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search name, e-mail, ticket" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Refresh" onClick={() => { setQ(''); setStatus(''); setTopic(''); list.refetch(); }}><RefreshCw className={cx('w-4 h-4', list.isFetching && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Ticket</th><th>From</th><th>Topic</th><th>Message</th><th>Received</th><th>Status</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {list.isLoading ? <tr><td colSpan={7} className="!py-14 text-center"><Spinner className="w-6 h-6 inline" /></td></tr>
                : list.error ? <tr><td colSpan={7} className="!py-14 text-center text-muted">{errMsg(list.error)}</td></tr>
                  : !rows.length ? <tr><td colSpan={7} className="!py-14 text-center text-muted">No messages yet.</td></tr>
                    : rows.map((m) => (
                      <tr key={m.id} className={cx('cursor-pointer', m.status === 'new' && 'font-medium')} onClick={() => open(m)}>
                        <td className="font-mono text-xs">{m.ticket ?? m.id.slice(0, 6)}</td>
                        <td><div className="text-navy dark:text-white">{m.name}</div><div className="text-xs text-muted">{m.email}</div></td>
                        <td className="whitespace-nowrap">{TOPICS[m.topic] ?? m.topic}{m.order_no && <div className="text-xs text-muted">#{m.order_no}</div>}</td>
                        <td className="text-muted max-w-sm">{m.message.length > 90 ? m.message.slice(0, 90) + '…' : m.message}</td>
                        <td className="whitespace-nowrap text-muted" title={fmtDateTime(m.created_at)}>{timeAgo(m.created_at)}</td>
                        <td><StatusPill status={statusOf(m.status).pill} label={statusOf(m.status).label} /></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <RowActions onDelete={canReply ? () => del(m) : undefined}><button type="button" className="icon-btn" title="View" onClick={() => open(m)}><Eye className="w-4 h-4" /></button></RowActions>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.ticket ?? 'Message'} · ${TOPICS[view.topic] ?? view.topic}` : ''} size="md"
        footer={view && (
          <div className="flex flex-wrap justify-end gap-2">
            <a href={replyHref(view)} className="btn-soft"><Reply className="w-4 h-4" /> Reply by e-mail</a>
            {canReply && view.status !== 'in_progress' && view.status !== 'resolved' && <button type="button" className="btn-outline" disabled={busy} onClick={() => setStatusOf(view, 'in_progress', note)}>Mark in progress</button>}
            {canReply && (view.status === 'resolved'
              ? <button type="button" className="btn-outline" disabled={busy} onClick={() => setStatusOf(view, 'new', note)}>Reopen</button>
              : <button type="button" className="btn-primary" disabled={busy} onClick={() => setStatusOf(view, 'resolved', note)}>{busy && <Spinner className="w-4 h-4" />} Mark resolved</button>)}
          </div>
        )}>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-xs text-muted">Name</p><p className="font-semibold text-navy dark:text-white">{view.name}</p></div>
              <div><p className="text-xs text-muted">Status</p><StatusPill status={statusOf(view.status).pill} label={statusOf(view.status).label} /></div>
              <div><p className="text-xs text-muted">E-mail</p><a href={`mailto:${view.email}`} className="inline-flex items-center gap-1.5 text-primary"><Mail className="w-3.5 h-3.5" />{view.email}</a></div>
              <div><p className="text-xs text-muted">Phone</p>{view.phone ? <a href={`tel:${view.phone}`} className="inline-flex items-center gap-1.5 text-primary"><Phone className="w-3.5 h-3.5" />{view.phone}</a> : '—'}</div>
              <div><p className="text-xs text-muted">Order no.</p><p>{view.order_no || '—'}</p></div>
              <div><p className="text-xs text-muted">Received</p><p>{fmtDateTime(view.created_at)} · {view.source ?? 'website'}</p></div>
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Message</p>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-white/5 p-3 leading-relaxed">{view.message}</p>
            </div>
            {canReply && (
              <div>
                <label className="text-xs text-muted" htmlFor="cm-note">Internal note (not sent to the customer)</label>
                <textarea id="cm-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="input mt-1" placeholder="e.g. Refunded ₹120 to wallet, replied by e-mail" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
