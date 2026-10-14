'use client';
// Support chat — port of admin/chat/index.blade.php (Admin\ChatController). Two panes: live thread list (chats ordered by last_message_at)
// and live messages (chats/{id}/messages). Panel users write messages directly (rules allow staff message create); the
// onChatMessageCreated trigger maintains last_message / unread counters and pushes FCM. "New Chat" (and the
// ?start_user=&start_order= deep link from the order page) goes through the startChat callable; chats carry store_id
// (derived from the linked order by onChatCreated) so the store panel sees and marks read its own threads.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Bike, Check, CheckCheck, List, Lock, LockOpen, MessageSquareDashed, MessagesSquare, Plus, Send, Users } from 'lucide-react';
import { col, fetchList, limit, q, ref, useLiveQuery, useStores, where, orderBy } from '@/lib/firestore';
import { startChat } from '@/lib/callables';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/form/fields';
import { UserPicker, type PickedUser } from '@/modules/marketing/UserPicker';
import type { Order } from '@/lib/types';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { imgUrl, toDate } from '@/lib/format';
import type { Chat, ChatMessage } from '@/lib/types';
import { Forbidden, PageHeader, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';

type TypeTab = 'all' | 'customer' | 'delivery_boy';
type StatusTab = 'all' | 'open' | 'closed';
const TYPE_TABS: { key: TypeTab; label: string; icon: typeof List }[] = [
  { key: 'all', label: 'All', icon: List },
  { key: 'customer', label: 'Customers', icon: Users },
  { key: 'delivery_boy', label: 'Delivery Boys', icon: Bike },
];

const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
const isYesterday = (d: Date) => { const y = new Date(); y.setDate(y.getDate() - 1); return d.toDateString() === y.toDateString(); };
const hm = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function listTime(v: any) {
  const d = toDate(v); if (!d) return '';
  return isToday(d) ? hm(d) : isYesterday(d) ? 'Yesterday' : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}
function dateLabel(d: Date) {
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
const initials = (name: string) => (name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?');

export default function ChatPage() {
  const { p, storeId, isStore } = usePanel();
  const { can, user, profile } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const { data: stores = [] } = useStores();

  const [type, setType] = useState<TypeTab>('all');
  const [status, setStatus] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(params.get('chat'));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const scoped = !isStore || !!storeId;
  const threadsQ = useMemo(
    () => (scoped ? q('chats', ...(storeId ? [where('store_id', '==', storeId)] : []), orderBy('last_message_at', 'desc'), limit(200)) : null),
    [storeId, scoped],
  );
  const { data: threads, loading: loadingList, error: listError } = useLiveQuery<Chat>(threadsQ, [storeId, scoped]);

  const msgsQ = useMemo(() => (activeId ? q(`chats/${activeId}/messages`, orderBy('created_at', 'desc'), limit(300)) : null), [activeId]);
  const { data: rawMsgs, loading: loadingMsgs } = useLiveQuery<ChatMessage>(msgsQ, [activeId]);
  const messages = useMemo(() => [...rawMsgs].sort((a, b) => (toDate(a.created_at)?.getTime() ?? Infinity) - (toDate(b.created_at)?.getTime() ?? Infinity)), [rawMsgs]);

  const chat = threads.find((c) => c.id === activeId) || null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return threads.filter((c) => {
      if (type !== 'all' && c.user_type !== type) return false;
      if (status !== 'all' && (c.status || 'open') !== status) return false;
      if (term) {
        const hay = `${c.user_name || ''} ${c.order_number || ''} ${c.subject || ''} ${c.last_message?.text || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [threads, type, status, search]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  // mark the open thread as read for panel users (rules allow staff to update unread_admin)
  useEffect(() => {
    if (chat && Number(chat.unread_admin || 0) > 0) updateDoc(ref('chats', chat.id), { unread_admin: 0, updated_at: serverTimestamp() }).catch(() => {});
  }, [chat?.id, chat?.unread_admin]);

  const open = (id: string | null) => {
    setActiveId(id);
    setDraft('');
    try { window.history.replaceState(null, '', id ? `${p('/chat')}?chat=${id}` : p('/chat')); } catch { /* */ }
    if (id) setTimeout(() => input.current?.focus(), 50);
  };

  // deep link from the order page: ?start_user=<uid>&start_order=<orderId>
  useEffect(() => {
    const u = params.get('start_user');
    if (!u || !can('chat.reply')) return;
    startChat({ user_id: u, order_id: params.get('start_order') || undefined })
      .then((r) => open(r.chat_id))
      .catch((e: any) => toast(e?.message || 'Could not start the conversation', 'error'));
  }, []);

  if (!can('chat.list') && !can('chat.view')) return <Forbidden />;

  const me = isStore ? 'store' : 'admin';
  const canReply = can('chat.reply');
  const senderName = isStore ? (stores.find((s) => s.id === storeId)?.name || profile?.name || 'Store') : (profile?.name || 'QwikMart Support');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !chat || !user || sending) return;
    setSending(true);
    try {
      await addDoc(col(`chats/${chat.id}/messages`), {
        user_uid: chat.user_uid || chat.user_id, sender_id: user.uid, sender_type: me, sender_name: senderName,
        message: text.slice(0, 5000), attachment: null, read_at: null, created_at: serverTimestamp(),
      });
      setDraft('');
      // Laravel reopened the conversation on reply
      if (chat.status === 'closed') await updateDoc(ref('chats', chat.id), { status: 'open' }).catch(() => {});
    } catch (err: any) { toast(err?.message || 'Could not send message', 'error'); }
    setSending(false);
    setTimeout(() => input.current?.focus(), 30);
  };

  const toggleClose = async () => {
    if (!chat) return;
    const next = chat.status === 'closed' ? 'open' : 'closed';
    setToggling(true);
    try {
      await updateDoc(ref('chats', chat.id), { status: next });
      toast(next === 'closed' ? 'Conversation closed.' : 'Conversation reopened.');
    } catch (err: any) { toast(err?.message || 'Could not update conversation', 'error'); }
    setToggling(false);
  };

  const typeLabel = (t?: string) => (t === 'delivery_boy' ? 'Delivery Boy' : 'Customer');
  const lastText = (c: Chat) => {
    const lm = c.last_message;
    if (!lm?.text) return 'No messages yet';
    return `${lm.sender_type === me ? 'You: ' : ''}${lm.text.length > 60 ? lm.text.slice(0, 60) + '…' : lm.text}`;
  };

  return (
    <div>
      <PageHeader title="Chat">
        {canReply && <button type="button" className="btn-primary" onClick={() => setNewOpen(true)} data-testid="new-chat"><Plus className="w-4 h-4" /> New Chat</button>}
      </PageHeader>
      <NewChatModal open={newOpen} onClose={() => setNewOpen(false)} storeId={isStore ? storeId : null} onStarted={(cid) => { setNewOpen(false); open(cid); }} />

      <div className="card overflow-hidden flex h-[calc(100vh-190px)] min-h-[520px]">
        {/* Conversations */}
        <aside className={cx('w-full md:w-[340px] shrink-0 border-r border-line dark:border-dark-line flex-col', activeId ? 'hidden md:flex' : 'flex')}>
          <div className="p-3 border-b border-line dark:border-dark-line space-y-3">
            <SearchBox value={search} onChange={setSearch} placeholder="Search" className="w-full" />
            <div className="flex items-center gap-1.5 text-sm">
              {TYPE_TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setType(t.key)} className={cx('tab !px-2.5 !py-1.5 flex items-center gap-1.5 whitespace-nowrap text-[13px]', type === t.key && 'tab-active')}>
                  <t.icon className="w-3.5 h-3.5" /><span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {(['all', 'open', 'closed'] as StatusTab[]).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={cx('chip !py-1 text-xs', status === s && 'chip-active')}>
                  {s === 'all' ? 'All' : s === 'open' ? 'Open' : 'Closed'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loadingList && !threads.length ? (
              <div className="p-10 text-center text-muted text-sm">Loading…</div>
            ) : listError ? (
              <div className="p-10 text-center text-muted text-sm">{(listError as any)?.code === 'permission-denied' ? 'You do not have permission to view conversations.' : 'Could not load conversations.'}</div>
            ) : !filtered.length ? (
              <div className="p-10 text-center text-muted text-sm flex flex-col items-center gap-2"><MessageSquareDashed className="w-8 h-8 text-slate-300" /> No conversations</div>
            ) : filtered.map((c) => {
              const name = c.user_name || 'Unknown';
              const unread = Number(c.unread_admin || 0);
              return (
                <button
                  key={c.id} type="button" onClick={() => open(c.id)} data-testid="chat-thread"
                  className={cx('w-full text-left px-3 py-3 flex gap-3 border-b border-line/70 dark:border-dark-line hover:bg-slate-50 dark:hover:bg-dark-line transition', activeId === c.id && '!bg-primary-50 dark:!bg-dark-line border-l-4 border-l-primary')}
                >
                  <span className={cx('w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold', c.user_type === 'delivery_boy' ? 'bg-amber-100 text-amber-700' : 'bg-primary-50 text-primary')}>{initials(name)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-navy dark:text-white truncate">{name}</span>
                      <span className="text-[11px] text-muted shrink-0">{listTime(c.last_message_at || c.created_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted truncate">{lastText(c)}</span>
                      {unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{unread}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                      <span className="text-muted">{typeLabel(c.user_type)}</span>
                      {c.order_number && <span className="text-primary font-medium">· Order: {c.order_number}</span>}
                      {c.status === 'closed' && <span className="text-red-500">· Closed</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Conversation */}
        <section className={cx('flex-1 min-w-0 flex-col', !activeId ? 'hidden md:flex' : 'flex')}>
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3">
              <span className="w-16 h-16 rounded-2xl bg-primary-50 text-primary flex items-center justify-center"><MessagesSquare className="w-8 h-8" /></span>
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-dark-line">
                <button type="button" className="icon-btn md:hidden" onClick={() => open(null)}><ArrowLeft className="w-4 h-4" /></button>
                {chat ? (
                  <>
                    <span className={cx('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold', chat.user_type === 'delivery_boy' ? 'bg-amber-100 text-amber-700' : 'bg-primary-50 text-primary')}>{initials(chat.user_name || 'Unknown')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-navy dark:text-white truncate">{chat.user_name || 'Unknown'}</div>
                      <div className="text-xs text-muted">
                        <span>{typeLabel(chat.user_type)}</span>
                        {chat.order_id && <Link href={p(`/orders/view/${chat.order_id}`)} className="text-primary font-medium hover:underline"> · Order {chat.order_number || chat.order_id}</Link>}
                        {chat.subject && <span> · {chat.subject}</span>}
                      </div>
                    </div>
                    {canReply && (
                      <button type="button" className="btn-outline btn-sm" onClick={toggleClose} disabled={toggling} data-testid="toggle-chat">
                        {chat.status === 'closed' ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        <span>{chat.status === 'closed' ? 'Reopen' : 'Close'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 text-sm text-muted">{loadingList ? 'Loading…' : 'Conversation not found.'}</div>
                )}
              </div>

              <div ref={scroller} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2 bg-slate-50/60 dark:bg-transparent">
                {loadingMsgs && !messages.length ? (
                  <div className="text-center text-muted text-sm py-10">Loading…</div>
                ) : !messages.length ? (
                  <div className="text-center text-muted text-sm py-10">No messages yet. Say hello 👋</div>
                ) : messages.map((m, i) => {
                  const d = toDate(m.created_at) || new Date();
                  const prev = i > 0 ? (toDate(messages[i - 1].created_at) || new Date()) : null;
                  const mine = m.sender_type === 'admin' || m.sender_type === 'store';
                  return (
                    <div key={m.id}>
                      {(!prev || prev.toDateString() !== d.toDateString()) && (
                        <div className="flex justify-center my-3"><span className="text-[11px] px-3 py-1 rounded-full bg-white dark:bg-dark-line border border-line dark:border-dark-line text-muted">{dateLabel(d)}</span></div>
                      )}
                      <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cx('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', mine ? 'bg-primary text-white rounded-br-md' : 'bg-white dark:bg-dark-line text-slate-700 dark:text-slate-200 border border-line dark:border-dark-line rounded-bl-md')}>
                          {m.attachment && <a href={imgUrl(m.attachment)} target="_blank" rel="noopener noreferrer"><img src={imgUrl(m.attachment)} className="rounded-lg max-h-48 mb-1" alt="" /></a>}
                          <div className="whitespace-pre-wrap break-words">{m.message}</div>
                          <div className={cx('text-[10px] mt-1 flex items-center gap-1 justify-end', mine ? 'text-white/75' : 'text-muted')}>
                            {mine && m.sender_type !== me && <span>{m.sender_type === 'store' ? 'Store ·' : 'Admin ·'}</span>}
                            {mine && m.sender_name && m.sender_type === me && m.sender_id !== user?.uid && <span>{m.sender_name} ·</span>}
                            <span>{hm(d)}</span>
                            {mine && (m.read_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canReply && chat && (
                <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-line dark:border-dark-line">
                  <input
                    ref={input} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={sending}
                    placeholder={chat.status === 'closed' ? 'Conversation closed — replying reopens it' : 'Type message…'} className="input flex-1" maxLength={5000} autoComplete="off" data-testid="chat-input"
                  />
                  <button type="submit" className="btn-primary !px-4" disabled={sending || !draft.trim()} data-testid="chat-send"><Send className="w-4 h-4" /> <span className="hidden sm:inline">Send</span></button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Staff-initiated conversation (startChat). Store users must link one of their store's orders. */
function NewChatModal({ open, onClose, storeId, onStarted }: { open: boolean; onClose: () => void; storeId: string | null; onStarted: (chatId: string) => void }) {
  const toast = useToast();
  const [user, setUser] = useState<PickedUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setUser(null); setOrders([]); setOrderId(''); setSubject(''); setMessage(''); } }, [open]);
  useEffect(() => {
    setOrders([]); setOrderId('');
    if (!user) return;
    fetchList<Order>('orders', where('user_id', '==', user.id), ...(storeId ? [where('store_id', '==', storeId)] : []), limit(50))
      .then((list) => setOrders([...list].sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0)).slice(0, 20)))
      .catch(() => setOrders([]));
  }, [user?.id, storeId]);
  const submit = async () => {
    if (!user) { toast('Select a user', 'error'); return; }
    if (storeId && !orderId) { toast("Select one of your store's orders", 'error'); return; }
    setBusy(true);
    try {
      const r = await startChat({ user_id: user.id, order_id: orderId || undefined, subject: subject.trim() || undefined, message: message.trim() || undefined });
      toast(r.created ? 'Conversation started.' : 'Existing conversation opened.');
      onStarted(r.chat_id);
    } catch (e: any) { toast(e?.message || 'Could not start the conversation', 'error'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="New Conversation" size="lg">
      <div className="p-5 space-y-4">
        <UserPicker label={storeId ? 'Customer (ordered from your store)' : 'Customer / Delivery boy'} required value={user} onChange={setUser} storeId={storeId} types={storeId ? undefined : ['customer', 'delivery_boy']} />
        <Select label={storeId ? 'Order' : 'Order (optional)'} required={!!storeId} placeholder={user ? (orders.length ? 'Select order' : 'No orders') : 'Pick a user first'} value={orderId} onChange={(e) => setOrderId(e.target.value)}
          options={orders.map((o) => ({ value: o.id, label: `${o.order_number} · ${o.status}` }))} />
        <Input label="Subject" placeholder="e.g. About your order" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        <Textarea label="First message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !user} onClick={submit} data-testid="start-chat"><Send className="w-4 h-4" /> {busy ? 'Starting…' : 'Start Chat'}</button>
        </div>
      </div>
    </Modal>
  );
}
