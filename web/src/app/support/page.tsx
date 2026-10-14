'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Check, CheckCheck, Headset, MessageSquarePlus, Paperclip, SendHorizonal } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useIsAuthed } from '@/hooks';
import type { Id } from '@/lib/types';
import AccountShell from '@/components/account/AccountShell';
import { Modal, Spinner } from '@/components/ui';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function Inner() {
  const authed = useIsAuthed();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const orderParam = sp.get('order');
  const orderNo = sp.get('no');
  const [active, setActive] = useState<Id | null>(null);
  const [text, setText] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Firebase: onSnapshot listeners keep both lists live; the demo mock polls
  const realtime = api.realtime && !!api.watchChats && !!api.watchChatMessages;
  const chats = useQuery({ queryKey: ['chats'], queryFn: api.chats, enabled: authed, refetchInterval: realtime ? false : 15_000 });
  const messages = useQuery({
    queryKey: ['chat-messages', active],
    queryFn: () => api.chatMessages(active!),
    enabled: authed && !!active,
    refetchInterval: realtime ? false : 5000,
  });
  useEffect(() => {
    if (!authed || !realtime || !api.watchChats) return;
    return api.watchChats((list) => qc.setQueryData(['chats'], list));
  }, [authed, realtime, qc]);
  useEffect(() => {
    if (!authed || !realtime || !active || !api.watchChatMessages) return;
    const unsub = api.watchChatMessages(active, (list) => qc.setQueryData(['chat-messages', active], list));
    void api.markChatRead?.(active);
    return unsub;
  }, [authed, realtime, active, qc]);

  // choose chat: from ?order=… (create if needed) or first chat
  useEffect(() => {
    if (!chats.data || active) return;
    if (orderParam) {
      const existing = chats.data.find((c) => String(c.order_id) === orderParam);
      if (existing) setActive(existing.id);
      else
        api
          .createChat({ subject: `Help with order ${orderNo || '#' + orderParam}`, order_id: orderParam, order_number: orderNo })
          .then((c) => {
            qc.invalidateQueries({ queryKey: ['chats'] });
            setActive(c.id);
          })
          .catch((e) => toast.error(errorMessage(e)));
    } else if (chats.data.length) setActive(chats.data[0].id);
  }, [chats.data, active, orderParam, orderNo, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: (msg: string) => api.sendChatMessage(active!, msg),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['chat-messages', active] });
      qc.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const create = useMutation({
    mutationFn: () => api.createChat({ subject: subject || 'General enquiry' }),
    onSuccess: (c) => {
      setNewOpen(false);
      setSubject('');
      qc.invalidateQueries({ queryKey: ['chats'] });
      setActive(c.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const current = chats.data?.find((c) => c.id === active);
  let lastDay = '';

  return (
    <AccountShell title="Chat with Support">
      <div className="card grid h-[calc(100dvh-22rem)] min-h-[360px] overflow-hidden md:h-[calc(100vh-14rem)] md:min-h-[520px] md:grid-cols-[260px_1fr]">
        <div className="hidden flex-col border-e border-line md:flex">
          <div className="flex items-center justify-between border-b border-line p-3">
            <span className="font-bold">Conversations</span>
            <button onClick={() => setNewOpen(true)} className="btn-soft px-2 py-1 text-xs">
              <MessageSquarePlus className="h-4 w-4" /> New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chats.isLoading && <div className="skeleton m-3 h-16" />}
            {chats.data?.map((c) => (
              <button key={c.id} onClick={() => setActive(c.id)} className={clsx('block w-full border-b border-line px-3 py-3 text-start', c.id === active ? 'bg-primary-50 dark:bg-primary/10' : 'hover:bg-soft')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{c.subject}</span>
                  <span className="shrink-0 text-[10px] text-muted">{time(c.last_message_at)}</span>
                </div>
                <div className="truncate text-xs text-muted">{c.last_message || (c.status === 'open' ? 'Open' : 'Closed')}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line bg-primary px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Headset className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">QwikMart Support</div>
              <div className="text-xs text-white/80">{current ? current.subject : 'We usually reply within a minute'}</div>
            </div>
            <button onClick={() => setNewOpen(true)} className="rounded-full p-1.5 hover:bg-white/10 md:hidden" aria-label="New chat">
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-soft/60 p-4">
            {!active && !chats.isLoading && (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted">
                <Headset className="mb-2 h-10 w-10 text-primary" /> Start a conversation with our support team.
                <button onClick={() => setNewOpen(true)} className="btn-primary mt-3">Start chat</button>
              </div>
            )}
            {messages.data?.map((m) => {
              const mine = m.sender_type === 'customer';
              const day = formatDate(m.created_at, false);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-2 text-center">
                      <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-muted shadow-soft">{day}</span>
                    </div>
                  )}
                  <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-soft', mine ? 'rounded-ee-sm bg-primary text-white' : 'rounded-es-sm bg-surface text-ink')}>
                      <p className="whitespace-pre-wrap">{m.message}</p>
                      <div className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-muted')}>
                        {time(m.created_at)}
                        {mine && (m.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && active) send.mutate(text.trim());
            }}
            className="flex items-center gap-2 border-t border-line bg-surface p-3"
          >
            <button type="button" onClick={() => toast('Attachments are available in the mobile app')} className="rounded-full p-2 text-muted hover:bg-soft" aria-label="Attach">
              <Paperclip className="h-5 w-5" />
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} disabled={!active} placeholder="Type a message…" className="input flex-1 rounded-full" />
            <button disabled={!text.trim() || send.isPending} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50" aria-label="Send">
              {send.isPending ? <Spinner /> : <SendHorizonal className="h-4 w-4 rtl:rotate-180" />}
            </button>
          </form>
        </div>
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New conversation" size="sm">
        <label className="label">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="e.g. Payment issue" />
        <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary mt-4 w-full">
          {create.isPending && <Spinner />} Start chat
        </button>
      </Modal>
    </AccountShell>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
