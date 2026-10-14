/**
 * Support chat — chats/{id} + chats/{id}/messages/{id}. The customer creates the chat (whitelisted fields) and
 * messages with sender_id == auth.uid; the onChatMessageCreated trigger maintains last_message / unread counters.
 * Lists are live (onSnapshot); queries carry `user_uid == uid` so the rules can be proven.
 */
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import type { CreateChatBody, Unsubscribe } from '../api-types';
import { fb } from '../firebase';
import type { Chat, ChatMessage, Id } from '../types';
import { customerUid, guard, iso, num, type Raw } from './core';

const db = () => fb().db;

function toChat(id: string, c: Raw): Chat & { unread_user?: number } {
  return {
    id,
    subject: c.subject ?? 'Support',
    order_id: c.order_id ?? null,
    status: c.status === 'closed' ? 'closed' : 'open',
    last_message_at: iso(c.last_message_at ?? c.created_at) || new Date().toISOString(),
    last_message: c.last_message?.text ?? undefined,
    unread_user: num(c.unread_user),
  };
}

function toMessage(id: string, m: Raw): ChatMessage {
  return {
    id,
    sender_id: m.sender_id,
    sender_type: m.sender_type,
    message: m.message ?? '',
    attachment: m.attachment ?? null,
    created_at: iso(m.created_at) || new Date().toISOString(),
    read_at: m.read_at ? iso(m.read_at) : null,
  };
}

const chatsQuery = (uid: string) => query(collection(db(), 'chats'), where('user_uid', '==', uid), orderBy('last_message_at', 'desc'), limit(50));
const messagesQuery = (chatId: string, uid: string) =>
  query(collection(db(), 'chats', chatId, 'messages'), where('user_uid', '==', uid), orderBy('created_at', 'asc'), limit(300));

export async function chats(): Promise<Chat[]> {
  const uid = await customerUid();
  const s = await guard(() => getDocs(chatsQuery(uid)));
  return s.docs.map((d) => toChat(d.id, d.data()));
}

export async function chatMessages(id: Id): Promise<ChatMessage[]> {
  const uid = await customerUid();
  const s = await guard(() => getDocs(messagesQuery(String(id), uid)));
  return s.docs.map((d) => toMessage(d.id, d.data()));
}

async function senderName(uid: string): Promise<string> {
  const { auth } = fb();
  const { getDoc } = await import('firebase/firestore');
  const u = await getDoc(doc(db(), 'users', uid)).catch(() => null);
  return String(u?.get('name') || auth.currentUser?.displayName || 'Customer').slice(0, 100);
}

export async function sendChatMessage(id: Id, message: string): Promise<void> {
  const uid = await customerUid();
  const name = await senderName(uid);
  await guard(() =>
    addDoc(collection(db(), 'chats', String(id), 'messages'), {
      user_uid: uid,
      sender_id: uid,
      sender_type: 'customer',
      sender_name: name,
      message: message.slice(0, 4000),
      attachment: null,
      read_at: null,
      created_at: serverTimestamp(),
    }),
  );
}

export async function createChat(body: CreateChatBody): Promise<Chat> {
  const uid = await customerUid();
  const name = await senderName(uid);
  const ref = await guard(() =>
    addDoc(collection(db(), 'chats'), {
      user_id: uid,
      user_uid: uid,
      user_type: 'customer',
      user_name: name,
      order_id: body.order_id ? String(body.order_id) : null,
      order_number: body.order_number ?? null,
      subject: (body.subject || 'General enquiry').slice(0, 200),
      status: 'open',
      last_message: null,
      last_message_at: serverTimestamp(),
      unread_admin: 0,
      unread_user: 0,
      created_at: serverTimestamp(),
    }),
  );
  if (body.message) await sendChatMessage(ref.id, body.message);
  return toChat(ref.id, { subject: body.subject, order_id: body.order_id ?? null, status: 'open', last_message_at: new Date().toISOString() });
}

export async function markChatRead(id: Id): Promise<void> {
  await customerUid();
  await guard(() => updateDoc(doc(db(), 'chats', String(id)), { unread_user: 0, updated_at: serverTimestamp() })).catch(() => undefined);
}

export function watchChats(cb: (c: Chat[]) => void): Unsubscribe {
  let unsub: Unsubscribe = () => {};
  let alive = true;
  customerUid()
    .then((uid) => {
      if (!alive) return;
      unsub = onSnapshot(chatsQuery(uid), (s) => cb(s.docs.map((d) => toChat(d.id, d.data()))), () => undefined);
    })
    .catch(() => undefined);
  return () => {
    alive = false;
    unsub();
  };
}

export function watchChatMessages(id: Id, cb: (m: ChatMessage[]) => void): Unsubscribe {
  let unsub: Unsubscribe = () => {};
  let alive = true;
  customerUid()
    .then((uid) => {
      if (!alive) return;
      unsub = onSnapshot(messagesQuery(String(id), uid), (s) => cb(s.docs.map((d) => toMessage(d.id, d.data({ serverTimestamps: 'estimate' })))), () => undefined);
    })
    .catch(() => undefined);
  return () => {
    alive = false;
    unsub();
  };
}
