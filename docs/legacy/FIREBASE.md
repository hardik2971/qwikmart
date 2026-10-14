# Firebase — project `qwikmart-37299`

| Service | Used for | Who writes | Who reads |
|---|---|---|---|
| Cloud Messaging (FCM v1) | push: order status, new order for riders, chat, promotions | backend (`FcmService`) | apps |
| Cloud Firestore | realtime mirror: order tracking, support chat, rider positions | backend only (`FirestoreSync`) | apps / web / panels (read-only, rules) |
| Authentication | sign-in for apps + website (phone OTP, email/password); API accepts Firebase ID tokens — see `AUTH.md` | Firebase | backend verifies tokens |

MySQL stays the source of truth. Firestore only mirrors what clients listen to live.

## Config locations

| Where | File / setting |
|---|---|
| Backend | `.env` `FIREBASE_*` (web config) → seeded into settings; service account JSON uploaded in **Admin → Settings → Firebase** or saved at `backend/storage/app/private/firebase/service-account.json` |
| Customer app | `customer_app/android/app/google-services.json` (applicationId `com.qwikmart.app`) |
| Delivery app | `delivery_app/android/app/google-services.json` (applicationId `com.qwikmart.delivery`) |
| Website | `web/.env.local` `NEXT_PUBLIC_FIREBASE_*` |
| Rules / indexes | `firebase/firestore.rules`, `firebase/firestore.indexes.json` |

## Setup checklist

1. Firebase console → Project settings → Service accounts → **Generate new private key** → upload in Admin → Settings → Firebase (turn demo mode off first), or save as `backend/storage/app/private/firebase/service-account.json`.
2. Authentication → Sign-in method: enable **Email/Password** and **Phone**; Settings → SMS region policy: allow **India**; add test number +91 9876543210 → 123456.
3. Deploy rules and indexes:
   ```bash
   npm i -g firebase-tools && firebase login
   cd firebase && firebase deploy --only firestore:rules,firestore:indexes
   ```
   Or paste `firestore.rules` into Firestore → Rules → Publish.
4. Check from the backend: `php artisan firebase:sync --check`, then backfill with `php artisan firebase:sync`.
5. iOS (later): add iOS apps in Firebase, download `GoogleService-Info.plist` into each `ios/Runner/`, upload an APNs key under Cloud Messaging.
6. Web push (optional): Cloud Messaging → Web Push certificates → generate key pair → paste VAPID key in Admin → Settings → Firebase.

## Firestore documents

```
orders/{orderId}                 order_number, user_id, user_uid, store_id, delivery_boy_id, delivery_boy_uid, mode, delivery_type,
                                 status, status_label, is_active, rider{lat,lng,updated_at},
                                 store{lat,lng}, address{lat,lng}, estimated_delivery_at, updated_at
chats/{chatId}                   user_id, user_uid, user_type, order_id, subject, status, last_message{text,sender_type,at},
                                 last_message_at, updated_at
chats/{chatId}/messages/{msgId}  chat_id, user_id, user_uid (thread owner), sender_id, sender_type, sender_name,
                                 message, attachment, read_at, created_at
riders/{deliveryBoyId}           user_id, user_uid, zone_id, is_online, lat, lng, updated_at
```

The delivery OTP and payment data are never written to Firestore.

## Client usage

Customers and riders are Firebase Auth users (see `AUTH.md`), so they read Firestore directly after
signing in; the rules compare `request.auth.uid` with the document's `user_uid` / `delivery_boy_uid`.
Admin/store panel pages get a custom token with role claims from `GET /panel/firebase-token`.

List queries must include the owner filter so the rules can verify them, e.g.
`collection('chats').where('user_uid', '==', auth.currentUser.uid)`,
`collection('chats/{id}/messages').where('user_uid', '==', uid).orderBy('created_at')`.
Single-document listeners (`orders/{id}`) need no filter.

Sending chat messages stays on the REST API (`POST /chats/{id}/messages`) so messages are validated and pushed via FCM.