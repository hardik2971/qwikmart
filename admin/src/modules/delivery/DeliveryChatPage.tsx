'use client';
// Chat with Support — port of delivery/chat/index.blade.php, realtime on Firestore.
// Rider creates its own `chats` doc (whitelisted fields) and `chats/{id}/messages` with sender_id == uid;
// the onChatMessageCreated trigger maintains last_message / unread counters and pushes to admins.
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { Check, CheckCheck, Headset, MessagesSquare, Plus, SendHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { col, q, useLiveQuery, where } from '@/lib/firestore';
import { errMsg, fmtDate, toDate } from '@/lib/format';
import type { Chat, ChatMessage } from '@/lib/types';
import { cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { RiderGate } from './shared';

const ts = (v: any) => toDate(v)?.getTime() ?? Date.now();
const hhmm = (v: any) => { const d = toDate(v); if (!d) return ''; let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`; };

export default function DeliveryChatPage() {
  return <RiderGate>{(r) => <ChatView uid={r.uid} />}</RiderGate>;
}

function ChatView({ uid }: { uid: string }) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const { prompt } = useConfirm();
  const myName = profile?.name || user?.displayName || 'Delivery Partner';
  const chats = useLiveQuery<Chat>(q('chats', where('user_uid', '==', uid)), [uid]);
  const sorted = useMemo(() => [...chats.data].sort((a, b) => ts(b.last_message_at ?? b.created_at) - ts(a.last_message_at ?? a.created_at)), [chats.data]);
  const [sel, setSel] = useState<string | null>(null);
  const current = sorted.find((c) => c.id === sel) || sorted.find((c) => c.status === 'open') || sorted[0] || null;
  const chatId = current?.id || null;

  const msgs = useLiveQuery<ChatMessage>(chatId ? q(`chats/${chatId}/messages`, where('user_uid', '==', uid)) : null, [chatId, uid]);
  const messages = useMemo(() => [...msgs.data].sort((a, b) => ts(a.created_at) - ts(b.created_at)), [msgs.data]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const l = listRef.current; if (l) l.scrollTop = l.scrollHeight; }, [messages.length, chatId]);

  const createChat = async (subject: string) => {
    const r = await addDoc(col('chats'), {
      user_id: uid, user_uid: uid, user_type: 'delivery_boy', user_name: myName, order_id: null, subject,
      status: 'open', created_at: serverTimestamp(), last_message_at: serverTimestamp(),
    });
    setSel(r.id);
    return r.id;
  };
  const newChat = async () => {
    const subject = await prompt({ title: 'New conversation', input: { label: 'Subject', required: true, placeholder: 'What do you need help with?' } });
    if (!subject) return;
    try { await createChat(subject.trim()); toast('Conversation started'); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const id = chatId && current?.status !== 'closed' ? chatId : await createChat('Delivery partner support');
      await addDoc(col(`chats/${id}/messages`), {
        user_uid: uid, sender_id: uid, sender_type: 'delivery_boy', sender_name: myName, message, created_at: serverTimestamp(),
      });
      setText('');
    } catch (e) { toast(errMsg(e), 'error'); }
    setSending(false);
  };

  return (
    <div className="max-w-5xl mx-auto grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Threads */}
      <div className="card overflow-hidden flex flex-col lg:h-[calc(100vh-170px)] lg:min-h-[460px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line">
          <span className="font-bold text-navy dark:text-white text-sm">Conversations</span>
          <button type="button" className="icon-btn" title="New conversation" onClick={newChat} data-testid="new-chat"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto max-h-48 lg:max-h-none divide-y divide-line dark:divide-dark-line">
          {sorted.map((c) => (
            <button key={c.id} type="button" onClick={() => setSel(c.id)} className={cx('w-full text-left px-4 py-3 hover:bg-primary-50/50', c.id === chatId && 'bg-primary-50 dark:bg-primary/10')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-navy dark:text-white truncate">{c.subject || 'Support'}</span>
                {!!c.unread_user && <span className="pill bg-primary text-white">{c.unread_user}</span>}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate">{c.last_message?.text || 'No messages yet'}</span>
                <span className={c.status === 'closed' ? 'text-red-500' : 'text-primary'}>{c.status === 'closed' ? 'Closed' : 'Open'}</span>
              </div>
            </button>
          ))}
          {!sorted.length && <p className="px-4 py-6 text-xs text-muted text-center">{chats.loading ? 'Loading…' : 'No conversations yet.'}</p>}
        </div>
      </div>

      {/* Conversation */}
      <div className="card flex flex-col overflow-hidden h-[calc(100vh-170px)] min-h-[460px]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-dark-line">
          <span className="relative w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
            <Headset className="w-5 h-5" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-dark-card" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-navy dark:text-white leading-tight">Chat with Support</h1>
            <p className="text-xs text-muted truncate">{current?.subject ? `${current.subject} · ` : ''}QwikMart delivery partner support · usually replies in a few minutes</p>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-slate-50/60 dark:bg-slate-900/30">
          {msgs.loading && chatId && !messages.length ? (
            <div className="h-full flex items-center justify-center text-sm text-muted">Loading conversation…</div>
          ) : !messages.length ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted gap-2">
              <MessagesSquare className="w-10 h-10 text-slate-300" />
              <p>Need help with an order, payment or your account?<br />Send a message and our team will reply here.</p>
            </div>
          ) : messages.map((m, i) => {
            const mine = m.sender_id === uid;
            const day = fmtDate(m.created_at ?? new Date());
            const prevDay = i > 0 ? fmtDate(messages[i - 1].created_at ?? new Date()) : null;
            return (
              <div key={m.id}>
                {day !== prevDay && <div className="flex justify-center my-3"><span className="text-[11px] px-3 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-line dark:border-dark-line text-muted">{day}</span></div>}
                <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cx('max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm', mine ? 'bg-primary text-white rounded-br-md' : 'bg-white dark:bg-slate-800 text-navy dark:text-slate-100 border border-line dark:border-dark-line rounded-bl-md')}>
                    {!mine && m.sender_name && <p className="text-[11px] font-semibold text-primary mb-0.5">{m.sender_name}</p>}
                    {m.attachment && <a href={m.attachment} target="_blank" rel="noopener noreferrer" className="block underline text-sm mb-1">Attachment</a>}
                    <p className="text-sm whitespace-pre-line break-words">{m.message}</p>
                    <p className={cx('text-[10px] mt-0.5 text-right flex items-center justify-end gap-1', mine ? 'text-white/75' : 'text-muted')}>
                      <span>{hhmm(m.created_at ?? new Date())}</span>
                      {mine && (m.read_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form className="flex items-end gap-2 p-3 border-t border-line dark:border-dark-line" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {current?.status === 'closed' && <p className="sr-only">This conversation is closed; sending starts a new one.</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={current?.status === 'closed' ? 'Conversation closed — type to start a new one…' : 'Type a message…'} className="input !py-2.5 resize-none max-h-32 flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} data-testid="chat-input" />
          <button type="submit" className="btn-primary !rounded-full !w-11 !h-11 !p-0 justify-center shrink-0" disabled={sending || !text.trim()} data-testid="send-message">
            <SendHorizontal className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
