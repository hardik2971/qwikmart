/** Chat messages, rider location fan-out, user search keywords. */
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, FieldValue, now, REGION } from '../shared/firebase';
import type { ChatDoc, ChatMessageDoc, DeliveryBoyDoc, UserDoc } from '../shared/types';
import { ACTIVE_STATUSES } from '../shared/status';
import { searchKeywords } from '../shared/util';
import { pushToUsers } from '../services/notify';

export const onChatMessageCreated = onDocumentCreated({ document: 'chats/{chatId}/messages/{messageId}', region: REGION }, async (event) => {
  const m = event.data?.data() as ChatMessageDoc | undefined;
  if (!m) return;
  const chatRef = db.doc(`chats/${event.params.chatId}`);
  const chat = await chatRef.get();
  if (!chat.exists) return;
  const fromUser = m.sender_type === 'customer' || m.sender_type === 'delivery_boy';
  const text = (m.message || (m.attachment ? '📎 Attachment' : '')).slice(0, 200);
  await chatRef.update({
    last_message: { text, sender_type: m.sender_type, at: m.created_at ?? now() },
    last_message_at: m.created_at ?? now(),
    ...(fromUser ? { unread_admin: FieldValue.increment(1), status: 'open' } : { unread_user: FieldValue.increment(1) }),
    updated_at: now(),
  });
  if (!fromUser) {
    await pushToUsers([String(chat.get('user_uid'))], m.sender_name || 'Support', text, { type: 'chat', chat_id: event.params.chatId });
  } else if (chat.get('assigned_uid')) {
    await pushToUsers([String(chat.get('assigned_uid'))], m.sender_name || 'Customer', text, { type: 'chat', chat_id: event.params.chatId });
  }
});

/**
 * Store scoping for chats: `store_id` (+ `order_number`) is derived from the linked order whenever a chat is created
 * (client-created or startChat). A chat without an order — or whose order does not belong to the chat owner — gets
 * store_id null, so a client cannot route its thread to an arbitrary store.
 */
export const onChatCreated = onDocumentCreated({ document: 'chats/{chatId}', region: REGION }, async (event) => {
  const c = event.data?.data() as ChatDoc | undefined;
  if (!c || !event.data) return;
  let storeId: string | null = null;
  let orderNumber: string | null = c.order_number ?? null;
  if (c.order_id) {
    const o = await db.doc(`orders/${c.order_id}`).get();
    const owner = c.user_uid || c.user_id;
    if (o.exists && (o.get('user_id') === owner || o.get('delivery_boy_id') === owner)) {
      storeId = (o.get('store_id') as string | null) ?? null;
      orderNumber = (o.get('order_number') as string | null) ?? orderNumber;
    }
  }
  if ((c.store_id ?? null) !== storeId || (c.order_number ?? null) !== orderNumber) {
    await event.data.ref.update({ store_id: storeId, order_number: orderNumber });
  }
});

export const onDeliveryBoyLocation = onDocumentUpdated({ document: 'delivery_boys/{uid}', region: REGION }, async (event) => {
  const before = event.data?.before.data() as DeliveryBoyDoc | undefined;
  const after = event.data?.after.data() as DeliveryBoyDoc | undefined;
  const loc = after?.location;
  if (!loc || JSON.stringify(before?.location ?? null) === JSON.stringify(loc)) return;
  const orders = await db.collection('orders').where('delivery_boy_id', '==', event.params.uid).where('status', 'in', ACTIVE_STATUSES).get();
  if (orders.empty) return;
  const batch = db.batch();
  orders.docs.forEach((o) => batch.update(o.ref, { rider: { lat: loc.lat, lng: loc.lng, updated_at: loc.updated_at ?? now() } }));
  await batch.commit();
});

export const onUserWritten = onDocumentWritten({ document: 'users/{uid}', region: REGION }, async (event) => {
  if (!event.data?.after.exists) return;
  const u = event.data.after.data() as UserDoc;
  const kw = searchKeywords(u.name ?? '', u.email ?? '', u.phone ?? '', (u.phone ?? '').replace(/^\+\d{1,3}/, ''));
  if (JSON.stringify(kw) !== JSON.stringify(u.search_keywords ?? [])) await event.data.after.ref.update({ search_keywords: kw });
});
