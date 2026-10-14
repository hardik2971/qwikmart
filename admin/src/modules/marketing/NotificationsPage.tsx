'use client';
// Port of admin/notifications/index.blade.php — broadcast history + "Send Notification" modal (callable sendNotification).
import { useState } from 'react';
import { Plus, Send, Info } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { removeDoc, where } from '@/lib/firestore';
import { sendNotification } from '@/lib/callables';
import { fmtDateTime, imgUrl, errMsg } from '@/lib/format';
import type { BroadcastNotification } from '@/lib/types';
import { PageHeader, RowActions, Toggle, Forbidden } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea, ImageUpload } from '@/components/form/fields';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { UserPicker, type PickedUser } from './UserPicker';

const TYPES = ['default', 'order', 'promotion', 'product', 'category'];
const TARGETS: Record<string, string> = { all: 'Everyone', customers: 'Customers', delivery_boys: 'Delivery Boys', user: 'Single User' };
const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '—');

export default function NotificationsPage() {
  const { isStore, storeId } = usePanel();
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ type: 'default', target: isStore ? 'user' : 'all', title: '', message: '', link: '', includeImage: false, image: '' });
  const [user, setUser] = useState<PickedUser | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openModal = () => { setF({ type: 'default', target: isStore ? 'user' : 'all', title: '', message: '', link: '', includeImage: false, image: '' }); setUser(null); setErrors({}); setOpen(true); };

  const send = async () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = 'The title is required.';
    if (!f.message.trim()) e.message = 'The message is required.';
    if (f.target === 'user' && !user) e.user_id = 'Please select a user.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await sendNotification({
        title: f.title.trim(), message: f.message.trim(), type: f.type, target: isStore ? 'user' : f.target,
        user_id: f.target === 'user' || isStore ? user?.id : undefined, image: f.includeImage && f.image ? f.image : undefined,
        link: f.link.trim() || undefined, store_id: storeId || undefined,
      });
      const n = res?.sent_count;
      toast(res?.message || (n != null ? `Notification saved for ${n} ${n === 1 ? 'user' : 'users'}.` : 'Notification sent.'));
      setOpen(false); setRefresh((r) => r + 1);
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  const del = async (n: BroadcastNotification) => {
    if (!(await confirm({ title: 'Delete this notification?', message: 'It is removed from the history log (already delivered inbox copies stay with the users).', danger: true }))) return;
    try { await removeDoc('notifications', n.id); toast('Notification deleted.'); setRefresh((r) => r + 1); } catch (err) { toast(errMsg(err), 'error'); }
  };

  if (!can('notification.list')) return <Forbidden />;
  return (
    <>
      <PageHeader title="Notifications">
        {can('notification.create') && <button type="button" className="btn-primary" onClick={openModal} data-testid="send-notification"><Plus className="w-4 h-4" /> Send Notification</button>}
      </PageHeader>

      {isStore && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          <Info className="w-5 h-5 shrink-0" />
          <div>Store notifications go to <b>individual customers who have ordered from your store</b>. Broadcasts to all customers or delivery partners are sent by the platform admin; the history below lists your store's notifications only.</div>
        </div>
      )}

      {(!isStore || !!storeId) && <DataTable<BroadcastNotification>
        path="notifications"
        constraints={isStore ? [where('store_id', '==', storeId)] : []}
        deps={[storeId]}
        refreshKey={refresh}
        defaultSort={{ field: 'sent_at', dir: 'desc' }}
        filters={[
          { key: 'type', placeholder: 'All Types', options: TYPES.map((t) => ({ value: t, label: cap(t) })) },
          ...(isStore ? [] : [{ key: 'target', placeholder: 'All Targets', options: Object.entries(TARGETS).map(([value, label]) => ({ value, label })) }]),
        ]}
        empty="No notifications sent yet."
        columns={[
          { key: 'title', header: 'Title', sort: 'title', className: 'font-medium max-w-[180px]', render: (n) => n.title },
          { key: 'message', header: 'Message', className: 'max-w-[280px] text-xs', render: (n) => (n.message?.length > 140 ? n.message.slice(0, 140) + '…' : n.message) },
          { key: 'type', header: 'Type', sort: 'type', render: (n) => cap(n.type) },
          {
            key: 'target', header: 'Target', className: 'whitespace-nowrap',
            render: (n) => <>{n.target === 'user' ? (n as any).user_name || 'User' : TARGETS[n.target || ''] ?? n.target}<span className="block text-xs text-muted">{Number(n.sent_count || 0)} recipients</span></>,
          },
          { key: 'link', header: 'Link', className: 'max-w-[160px] truncate text-xs', render: (n) => n.link ? <a href={n.link} target="_blank" rel="noopener" className="text-primary hover:underline">{n.link}</a> : '—' },
          { key: 'image', header: 'Image', render: (n) => n.image ? <img src={imgUrl(n.image)} className="w-12 h-12 rounded-lg object-cover border border-line" alt="" /> : <span className="text-muted">—</span> },
          { key: 'sent_at', header: 'Sent', sort: 'sent_at', className: 'whitespace-nowrap text-muted text-xs', render: (n) => fmtDateTime(n.sent_at ?? (n as any).created_at) },
          { key: 'actions', header: <span className="block text-right">Actions</span>, render: (n) => <RowActions onDelete={can('notification.delete') ? () => del(n) : undefined} /> },
        ]}
      />}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Notification" size="xl">
        <div className="p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Type" required value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={TYPES.map((t) => ({ value: t, label: cap(t) }))} />
            {!isStore && (
              <Select label="Send To" required value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}
                options={[{ value: 'all', label: 'Everyone' }, { value: 'customers', label: 'All Customers' }, { value: 'delivery_boys', label: 'All Delivery Boys' }, { value: 'user', label: 'Specific User' }]} />
            )}
          </div>
          {(isStore || f.target === 'user') && (
            <UserPicker label={isStore ? 'Customer (ordered from your store)' : 'User'} required value={user} onChange={setUser} storeId={isStore ? storeId : null} error={errors.user_id} />
          )}
          <Input label="Title" required placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} maxLength={190} />
          <Textarea label="Message" required rows={3} placeholder="Enter message here" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={errors.message} maxLength={2000} />
          <Input label="Link (optional)" placeholder="https:// or app deep link" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
          <Toggle checked={f.includeImage} onChange={(v) => setF({ ...f, includeImage: v })} label="Include Image" />
          {f.includeImage && <ImageUpload label="Image" square={false} value={f.image} onChange={(v) => setF({ ...f, image: v })} folder="catalog/notifications" />}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={send} data-testid="send"><Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Save'}</button>
            <button type="button" className="btn-gray" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
