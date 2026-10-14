# QwikMart — Firebase-only backend (binding spec)

Laravel, the REST API and MySQL are being replaced. Every client talks to Firebase directly:

| Concern | Firebase product |
|---|---|
| Identity | **Firebase Auth** — phone OTP + email/password (customers), email/password (riders, panel users), **anonymous** (guest cart) |
| Data | **Cloud Firestore** (default DB, region `asia-south1`) |
| Trusted logic | **Cloud Functions for Firebase v2** (TypeScript, Node 22, region `asia-south1`) — callable functions + Firestore triggers |
| Files | **Cloud Storage for Firebase** (product images, banners, avatars, rider documents, invoices) |
| Push | **FCM** from functions (Admin SDK) |
| Hosting | **Firebase App Hosting** (Next.js website + admin panel) |

Project: `qwikmart-37299`. Blaze plan required for Functions.

Repo layout:
```
firebase/
  firebase.json  .firebaserc  firestore.rules  firestore.indexes.json  storage.rules
  functions/      TypeScript Cloud Functions (src/index.ts exports everything)
  tools/          migrate-from-mysql.ts (one-time import of the current MySQL data + Auth users), seed helpers
admin/            Next.js admin app: /admin, /store, /delivery panels (replaces Laravel Blade panels)
web/              customer website (Next.js) — Firebase SDK
customer_app/ delivery_app/   Flutter — FlutterFire (firebase_auth, cloud_firestore, cloud_functions, firebase_storage, firebase_messaging)
```

Local dev: Firebase Emulator Suite (auth 9099, firestore 8080, functions 5001, storage 9199, UI 4000). JDK: `/c/Program Files/Android/Android Studio/jbr/bin`. Node 22: `/c/Users/di/AppData/Roaming/nvm/v22.22.3`. `firebase-tools` as a devDependency of `firebase/` (run via `npx firebase`).

---

## 1. Conventions

- Document IDs: auto IDs unless stated. `users/{uid}` uses the Firebase Auth uid.
- Timestamps: Firestore `Timestamp` fields `created_at`, `updated_at`.
- Money: numbers in the country's currency (2-decimals rounding in functions).
- Translatable text: map `{en, ar, hi}`; clients pick `field[lang] ?? field.en`.
- `status` on catalog docs: `'active' | 'inactive'` (products also `'draft' | 'pending_approval'`).
- `search_keywords: string[]` — lowercase word prefixes (min 2 chars, max 15 chars per prefix) of name/code fields in all languages; maintained by triggers. Search = `where('search_keywords','array-contains', firstTermLower)` then client-side filter on the remaining terms.
- **Server-owned fields** (prices, totals, wallet, stock, status, roles, ratings, counters) are written only by functions (Admin SDK bypasses rules). Rules whitelist the few fields a client may write.

## 2. Custom claims (set by functions with the Admin SDK)

`{ role: 'customer'|'delivery_boy'|'admin'|'staff'|'store', store_id?: string, role_id?: string, zone_id?: string }`
- Set by `syncProfile` (customers/riders), `createPanelUser` / `updatePanelUser` (admin/staff/store), `approveDeliveryBoy` (adds zone_id).
- Clients call `getIdToken(true)` after a call that changes claims.
- Staff/store-staff permissions: `roles/{role_id}.permissions: string[]` (keys like `order.list`, `order.update`, `product.create`, … same keys as the old Laravel `Role::MODULES`). Rules read the role doc with `get()`.

## 3. Collections

### Settings & geography
- `settings/public` — readable by everyone: `app_name, tagline, logo, favicon, support{phone,email,whatsapp}, social{facebook,instagram,twitter,youtube}, default_country_id, default_zone_id, demo_mode, tax_inclusive, payment_methods: [{key, name, logo, enabled, public_key?, mode}], referral{enabled, referrer_reward, referred_reward, min_order}, wallet{min_recharge, max_recharge, min_withdraw}, cod{enabled, max_amount}, app_versions{customer_min, delivery_min, force_update}, maintenance{app, web, message}, cookie_consent, home_search_hints[], delivery{auto_assign, …}` (`delivery.auto_assign` = Laravel `auto_assign_delivery`).
- `settings/private_{group}` (`payment`, `sms`, `smtp`, `ai`) — secrets: read/write by **role `admin` only** (admin Settings page) + functions; denied to staff, stores and clients. Canonical keys (admin page = functions = migration):
  - `private_payment`: `${gateway}_${key}` (e.g. `stripe_key, stripe_secret, razorpay_key, razorpay_secret, paystack_public_key, paystack_secret_key, paypal_client_id, paypal_secret, cashfree_app_id, cashfree_secret, phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index, paytabs_profile_id, paytabs_server_key, paytabs_region, midtrans_server_key, midtrans_client_key`) + `${gateway}_enabled`, `${gateway}_mode`.
  - `private_smtp`: `host, port, username, password, encryption ('tls'|'ssl'|'none'), secure, from_email, from_name` (functions also accept the Laravel `mail_*` names and `from_address`).
  - `private_sms`: `gateway` (`twilio|msg91|fast2sms|2factor|firebase|log`; Laravel `sms_gateway` accepted), `twilio_sid, twilio_token, twilio_from, msg91_auth_key, msg91_template_id, msg91_sender, fast2sms_key, twofactor_key, twofactor_template`.
  - `private_ai`: `gemini_api_key, gemini_model`.
- `countries/{id}`: `name, iso2, dial_code, currency_code, currency_symbol, timezone, date_format, flag, is_default, status`.
- `zones/{id}`: `country_id, name, slug, city, polygon:[{lat,lng}], center:{lat,lng}, fulfillment_type:'quick'|'ecommerce'|'both', base_charge, base_distance_km, per_km_charge, free_delivery_above, min_order, surge_slots:[{from:'18:00',to:'21:00',amount}], additional_charges:[{name:{en..},amount,refundable}], delivery_time_minutes, default_store_id, status`.
- `stores/{id}`: `zone_id, country_id, name, slug, email, phone, address, city, lat, lng, logo, banner, opening_time, closing_time, fulfillment_type, commission_percent, status, is_open, owner_uid`.
- `languages/{code}`: `name, is_rtl, is_default, status`; `translations/{code}_{platform}`: `{language, platform:'customer_app'|'delivery_app'|'website'|'admin', data:{key:value}}`.

### Users
- `users/{uid}`: `type, name, email, phone (E.164), avatar, store_id?, role_id?, referral_code, referred_by?, wallet_balance, orders_count, total_spent, fcm_tokens:[], status:'active'|'inactive', language, created_at, last_login_at, search_keywords`.
  Client may update only `name, avatar, language, fcm_tokens, updated_at` on its own doc. Guests (anonymous auth) get a minimal doc from `syncProfile` (`type:'customer', is_anonymous:true`, zero counters, no referral code / keywords / notifications); when the uid is upgraded to phone/email the next `syncProfile` runs the new-user path once (referral code, referral attach, welcome notification, `is_new:true`) and sets `is_anonymous:false`.
- `users/{uid}/addresses/{id}`: `label, name, phone, address_line, landmark, city, state, pincode, country_id, lat, lng, is_default` — owner CRUD.
- `users/{uid}/cart/{lineId}` (lineId = `${mode}_${storeId|'central'}_${variantId}`): `product_id, variant_id, store_id|null, mode, qty, added_at` — owner CRUD (qty 1..max_qty_per_order checked again by functions). Guests use **anonymous auth**; on login the client links the credential (`linkWithCredential`) so the uid — and cart — is kept; if linking fails (account exists) the client calls `mergeGuestCart({guest_uid})`.
- `users/{uid}/favorites/{productId}`: `{created_at}` — owner create/delete.
- `users/{uid}/notifications/{id}`: `title, message, type, data, image, read_at, created_at` — owner read + update `read_at` only.
- `users/{uid}/wallet_transactions/{id}`: `type:'credit'|'debit', amount, balance_after, payment_type, txn_id, order_id?, message, status, created_at` — owner read only.
- `delivery_boys/{uid}`: `zone_id, country_id, dob, address, vehicle_type, vehicle_number, driving_license (storage path), id_proof, bank{name,account,ifsc}, commission_type, commission_value, salary, cash_in_hand, earnings_total, rating_avg, rating_count, is_online, location:{lat,lng,updated_at}, approval_status:'pending'|'approved'|'rejected', status, created_at`.
  Rider may update only `location` on its own doc (every ~10 s while online).
- `roles/{id}`: `name, scope:'admin'|'store', store_id?, permissions:[]`.

### Catalog
- `categories/{id}`: `parent_id|null, name{}, slug, image, icon, banner, header_color, sort_order, status, show_in_quick, show_in_ecommerce, product_count`.
- `brands/{id}`: `name, slug, logo, status, sort_order`.
- `attributes/{id}`: `name{}, values:[{id, value, color_hex?}]`.
- `taxes/{id}`: `name, percent, status`.
- `products/{id}`: `store_id|null, category_id, sub_category_id|null, category_ids:[all ancestors+self], brand_id|null, brand_name, name{}, slug, short_description{}, description{}, images:[], thumbnail, product_type:'simple'|'variable', tax_id|null, tax_percent, is_veg|null, return_allowed, return_days, cancelable, cod_allowed, max_qty_per_order, fulfillment_type, seo{title{},description{},keywords{}}, schema_markup, tags:[], attributes:[{name, values:[]}], variants:[{id, name, sku, attribute_value_ids:[], attrs:{size:'XL'}, price, sale_price|null, stock, low_stock_alert, weight, image, status}], cross_sell_ids:[], up_sell_ids:[], rating_avg, rating_count, sold_count, is_featured, status, min_price, max_discount_percent, in_stock_store_ids:[], search_keywords, created_at, updated_at`.
  Derived by trigger: `min_price, max_discount_percent, category_ids, search_keywords, brand_name, in_stock_store_ids`.
- `store_stocks/{storeId}_{variantId}`: `store_id, product_id, variant_id, stock, price|null, sale_price|null, low_stock_alert`. Quick mode lists products where `in_stock_store_ids array-contains zone.default_store_id`; eCommerce mode uses central `variants[].stock`.
- `reviews/{id}`: `product_id, user_id, user_name, user_avatar, order_id, item_variant_id, rating, comment, images:[], status, created_at` — created by `submitReview`.
- `banners/{id}`: `title{}, subtitle{}, image, link_type:'product'|'category'|'url'|'none', link_value, zone_id|null, mode, status, sort_order`.
- `home_layouts/{zoneId}_{mode}_{categoryId|'all'}` (public, **published data only**, written by `publishHomeLayout`): `zone_id, mode, category_id|null, header:{bg_type,bg_value,text_color}, published_sections:[], is_published, published_at, published_by, store_id?`.
  `home_layout_drafts/{same id}` (panel-only working copy, written directly by the Home Builder): `zone_id, mode, category_id, header, draft_sections:[], store_id?, updated_at`. Section: `{id, type, title{}, is_active, settings}`; types `banner_slider, category_section, product_slider, top_brands, grid_banner, title_image, heading_text` with the same settings keys as the Laravel home builder (`HomeLayout::SECTION_DEFAULTS`; product_slider `source: featured|category|manual|newest|discount`, `category_id`, `product_ids`, `limit`≤30).
- `promo_codes/{id}`: `store_id|null` (store promos; null = platform) + same fields as SPEC §4 (`code` uppercase unique, `discount_type, discount_value, max_discount, min_order, usage_limit_total, usage_limit_per_user, used_count, starts_at, ends_at, is_permanent, applies_to, applies_to_ids, audience, channels, platforms, zone_ids, country_ids, time_from, time_to, is_instant, is_cashback, title{}, description{}, image, banner_color, status`). Clients do not read promo codes directly — use `listCoupons`.
- `blogs/{id}` (`category_id, title{}, slug, image, excerpt{}, content{}, read_minutes, views, status, published_at`), `blog_categories/{id}`, `faqs/{id}`, `pages/{slug}` — public read.

### Orders & money
- `orders/{id}`: `order_number ('SB-ORD-00001'), user_id, customer:{name,phone,email}, store_id, zone_id, country_id, address:{…snapshot, lat, lng}, mode, delivery_type:'delivery'|'self_pickup', status, payment_method, payment_status, transaction_id, items:[{variant_id, product_id, name, variant_name, image, price, sale_price, qty, tax_amount, total, status, is_reviewed, return_status?}], totals:{subtotal, savings, discount, promo_discount, delivery_charge, surge_charge, additional_charges, tax_amount, wallet_used, total (payable), grand_total}, promo_code|null, promo_is_cashback, delivery_boy_id|null, delivery_boy:{name, phone, avatar, vehicle_number}|null, rider:{lat,lng,updated_at}|null (copied by trigger), timeline:[{status,label,at,by}], cancel_reason, cancelled_by, notes, estimated_delivery_at, assigned_at, delivered_at, invoice_path, can_cancel, search_keywords, created_at, updated_at`.
  Status: `payment_pending, received, processed, shipped, ready_for_pickup, picked_up, out_for_delivery, delivered, cancelled, returned` with the same transitions as Laravel `Order::TRANSITIONS`.
- `orders/{id}/secret/otp`: `{delivery_otp}` — readable by the customer (owner) and staff only; **never by the rider**. Rider submits the OTP to `deliverOrder`.
- `return_requests/{id}`: `return_number, order_id, order_number, user_id, item_variant_id, item_name, qty, reason, images, status:'pending'|'approved'|'rejected'|'pickup_assigned'|'picked_up'|'refund_completed', refund_amount, refund_method:'wallet'|'original', delivery_boy_id, admin_remark, store_id, zone_id, created_at`; when a pickup rider is assigned also `customer:{name, phone}` and `address` (order address snapshot with lat/lng) — riders cannot read orders they did not deliver.
- `withdrawal_requests/{id}`: `user_id, user_type, user_name, amount, message, status, remark, receipt_image, created_at, processed_at`.
- `cash_collections/{id}`: `delivery_boy_id, order_id|null, order_number|null, amount, type:'collected_from_customer'|'submitted_to_admin', message, created_at` (+ `expected_amount, short_amount` when the rider reported less cash than payable).
- `delivery_earnings/{id}`: `delivery_boy_id, order_id|null, order_number|null, amount, type:'commission'|'bonus'|'salary', status:'credited'|'paid'|'pending', created_at`.
- `deleted_orders/{id}` (functions only): audit copy of orders removed by `deleteOrder` (+ `deleted_at, deleted_by`).
- `referrals/{id}`: `referrer_id, referred_id, referred_name, referrer_reward, referred_reward, status, created_at`.
- `counters/{name}`: `{value}` — `orders`, `returns` (sequence numbers via transactions).

### Engagement
- `chats/{id}`: `user_id, user_uid (=user_id), user_type, user_name, order_id|null, order_number, store_id|null, subject, status:'open'|'closed', last_message:{text,sender_type,at}, last_message_at, unread_admin, unread_user, created_at`. `store_id` = the linked order's store (set by `onChatCreated` / `startChat`; a client may pass it only when it matches its own order), so store users can read / reply / mark read their store's threads.
  `chats/{id}/messages/{id}`: `user_uid (thread owner), sender_id, sender_type:'customer'|'delivery_boy'|'admin'|'store', sender_name, message, attachment, read_at, created_at`.
  Owner may **create** a chat (fields whitelisted) and **create** messages with `sender_id == auth.uid`; staff may create messages in any chat. Trigger updates `last_message*`, unread counters and sends FCM.
- `notifications/{id}` (broadcast log written by `sendNotification`): `title, message, type, link, image, target, user_id, user_name, store_id|null, sent_at, sent_count, push_count, created_by`. `store_id` is set when a store user sent it (store panel history).
- `email_templates/{key}`, `mail_log/{id}`.

### Analytics (written only by triggers)
- `stats_daily/{scope}_{yyyy-mm-dd}` (scope `all` | `store_{id}` | `zone_{id}`): `date, scope, orders, revenue, delivery_charges, tax, units, cancelled, returned, by_status:{}, by_mode:{quick:{orders,revenue}, ecommerce:{…}}, by_category:{catId:{revenue,units}}, by_hour:{'0'..'23': {orders,revenue}}`. Computed incrementally on order create/update (diff of old vs new contribution).
- Product `sold_count`, store `orders_count/revenue`, user `orders_count/total_spent` maintained by the same trigger. Dashboard = read `stats_daily` for the range + "top N" queries ordered by those counters.

## 4. Callable functions (`httpsCallable(name)`; region `asia-south1`)

All return plain JSON; errors are `HttpsError` with codes `invalid-argument`, `failed-precondition`, `permission-denied`, `not-found`, `unauthenticated`. Messages are user-readable.

**Account**
- `syncProfile({name?, email?, referral_code?, fcm_token?, language?, app:'customer'|'delivery'})` → `{user, is_new}` — creates `users/{uid}` (customer) with referral code + welcome notification, links legacy accounts imported from MySQL by verified phone/email, sets claims. Call after every sign-in.
- `deleteAccount()`.

**Location & home**
- `detectZone({lat, lng})` → `{deliverable, zone, store, distance_km, delivery_minutes}`.
- `getHome({zone_id, mode, category_id?, lang})` → `{header, categories:[top tabs], sections:[{id,type,title,settings,items:[…hydrated]}]}` (cached 60 s in memory).

**Cart & checkout** (all compute with server prices)
- `cartSummary({zone_id, mode, promo_code?, use_wallet?, address_id?, delivery_type?})` → `{items:[{line_id, product_id, variant_id, name, variant_name, image, slug, price, sale_price, qty, line_total, in_stock, max_qty}], subtotal, savings, delivery_charge, surge_charge, additional_charges, tax, tax_inclusive, promo:{code,discount,is_cashback,message}|null, wallet_balance, wallet_used, total, grand_total, min_order, can_checkout, issues:[], free_delivery_remaining}`.
- `listCoupons({zone_id, mode})` → `[{code, title, description, image, banner_color, discount_type, discount_value, max_discount, min_order, applicable, message, is_cashback}]`.
- `mergeGuestCart({guest_uid})`.
- `placeOrder({zone_id, mode, address_id?, delivery_type, payment_method, promo_code?, use_wallet, notes?, platform:'app'|'web'})` → `{order_id, order_number, payment:{gateway, …client payload: stripe client_secret / razorpay order_id+key / paystack access_code / redirect_url}|null}` — transaction: re-price, validate stock (store or central), decrement stock, consume promo, debit wallet, create order + OTP, clear cart lines.
- `verifyPayment({order_id, gateway, payload})`, `walletRecharge({amount, gateway})`, `verifyWalletRecharge({…})`.
- `cancelOrder({order_id, reason})`, `reorder({order_id})` → `{added, skipped}`, `getInvoiceUrl({order_id})` → signed Storage URL (PDF generated on first request, pdfkit) — allowed for the customer, panel users and the **assigned rider**.
- `requestReturn({order_id, variant_id, qty, reason, images:[storage paths]})`, `submitReview({order_id, variant_id, rating, comment, images})` — review images are Storage paths under `reviews/{uid}/` (public read) or `users/{uid}/`, or full URLs.
- `walletWithdraw({amount, message})`.

**Delivery boy**
- `registerDeliveryBoy({name, phone, dob, country_id, zone_id, address, vehicle_type, vehicle_number, driving_license, id_proof (storage paths), bank})` → `{approval_status:'pending'}`.
- `setOnline({is_online})`, `acceptOrder({order_id})`, `rejectOrder({order_id})`, `updateDeliveryStatus({order_id, status:'picked_up'|'out_for_delivery'})`, `deliverOrder({order_id, otp, cash_collected?})`, `returnPickedUp({return_id})`.
  `deliverOrder.cash_collected` (COD only, optional): cash actually received, `0 ≤ x ≤ payable` (more → `invalid-argument`). It is recorded on `cash_collections/cod_{orderId}` and added to `cash_in_hand`; when it differs from the payable amount the entry gets `expected_amount` / `short_amount` and the order `cod_collected`. Omitted → the payable amount. Ignored for prepaid orders.
- Reads directly from Firestore: own `delivery_boys/{uid}`, `orders` where `delivery_boy_id == uid`, available orders `where zone_id == claim.zone_id && delivery_boy_id == null && status in ['received','processed','ready_for_pickup']`, own `delivery_earnings`, `cash_collections`, `withdrawal_requests`, wallet transactions.

**Panels (admin / staff / store — permission-checked)**
- Orders: `adminUpdateOrderStatus({order_id, status, note})`, `assignDeliveryBoy({order_id, delivery_boy_id})`, `verifyPickupOtp({order_id, otp})`, `processReturn({return_id, action, remark?, delivery_boy_id?, refund_amount?, refund_method?:'wallet'|'original'})` → `{id, status, refund_amount, refund_method}` (`original`: the refund completes without a wallet credit — the gateway refund is done outside; `pickup_assigned` copies `customer` + `address` onto the return for the rider).
- `updatePaymentStatus({order_id, payment_status:'pending'|'paid'|'failed'|'refunded', transaction_id?})` → `{order}` (`order.update`, store-scoped; timeline note "Payment status set to …", no status side-effects — Laravel `updatePayment`).
- `deleteOrder({order_id})` → `{order_id, deleted}` (`order.delete`; admin/staff — store users refused, like Laravel): only `cancelled` / `payment_pending`. **Hard delete**: a payment_pending order is first cancelled (restock, wallet refund, promo release); the order and `secret/otp` are deleted, an audit copy goes to `deleted_orders/{id}`, and `onOrderWritten` subtracts its stats_daily / counter contribution (Laravel soft-deleted orders were excluded from its dashboard the same way).
- `deleteReturn({return_id})` → `{id, deleted}` (`return.update` — `Role::MODULES` has no `return.delete`; store users refused): only `pending` / `rejected`; the order item goes back to `delivered` with `return_status:null`.
- `startChat({user_id, order_id?, subject?, message?})` → `{chat_id, created}` (`chat.reply`): reuses the user's chat for that order (or the general one) and reopens it, else creates it (with `store_id` of the order); optionally posts the first message as `admin`/`store`. Store users must pass one of their store's orders.
- People: `createPanelUser({type, name, email, password, phone?, store_id?, role_id?})`, `updatePanelUser({uid, …, password?})`, `setUserStatus({uid, active})`, `deleteUser({uid})`, `approveDeliveryBoy({uid, approve, remark?})`, `createDeliveryBoy({…})` (Admin SDK creates Auth users — no service-account upload needed inside Functions).
- Money: `walletAdjust({uid, type, amount, message})`, `processWithdrawal({id, approve, remark, receipt_image?})`, `updateWithdrawal({id, remark?, receipt_image?})` (already processed requests: remark / receipt only), `collectCash({delivery_boy_id, amount, message})`, `payEarnings({delivery_boy_id, amount?, type, message})`.
- Content: `publishHomeLayout({layout_id})` (copies `home_layout_drafts/{id}` sections + header → public `home_layouts/{id}`), `previewHomeSections({zone_id, mode, sections})` or `({layout_id})` (hydrates the stored draft), `generateProductContent({name, category, keywords, language})` (Gemini), `translateFields({fields, from, to:[]})`, `bulkImportProducts({csv_path})`, `exportReport({type, from, to, filters})` → CSV signed URL, `sendNotification({title, message, type, target, user_id?, image?, link?})` (store users: `target:'user'` only, for a customer who ordered from the store; the log row gets `store_id`), `sendBulkEmail({subject, body, segment})`, `testSmtp({to})`.
- Catalog CRUD (categories, brands, attributes, taxes, products, store_stocks, banners, zones, stores, countries, languages, translations, promo_codes, blogs, faqs, pages, settings/public, settings/private_* (role admin only), roles, email_templates, home_layout_drafts): **direct Firestore writes from the admin app**, guarded by rules (permission check) — triggers derive computed fields.

## 5. Triggers
- `onOrderWritten` → stats_daily (scopes all/store/zone), counters on product/store/user, notifications (users/{uid}/notifications + FCM to customer; FCM to zone riders on `received`/`ready_for_pickup`; to assigned rider), email on placed/delivered, cashback credit on delivered, referral reward on first delivered order, rider commission on delivered.
  **Rider auto-assign** (Laravel `OrderService::afterPlaced → autoAssign`): when `settings/public.delivery.auto_assign` is true (legacy `delivery.assign_mode:'auto'` honoured when unset), a **quick-mode delivery** order that was just placed (`received` on create, or `payment_pending → received`) is assigned to the nearest online, approved, active rider of its zone (distance store → `delivery_boys.location`, else delivery address → rider; riders without a location sort last; riders in `rejected_by` skipped; never overrides a rider who accepted meanwhile). Timeline note "Auto-assigned to …", order `auto_assigned:true`, rider notified, zone-pool push skipped. No rider → the order stays in the pool (accept / manual assignment).
- `onProductWritten` → derived fields; `onStoreStockWritten` → `in_stock_store_ids`; `onReviewCreated` → product rating; `onCategoryWritten` → `product_count`/ancestor ids.
- `onChatCreated` → `store_id` / `order_number` from the linked order (null when there is no order or it is not the chat owner's).
- `onChatMessageCreated` → chat summary + unread + FCM.
- `onDeliveryBoyLocation` (`delivery_boys/{uid}` location change) → copy to `rider` on that rider's active orders.
- `onUserWritten` → `search_keywords`.

## 6. Security rules summary (`firestore.rules`)
- Public read: `settings/public, countries, zones, stores, languages, translations, categories, brands, attributes, taxes, products (status=='active'), store_stocks, reviews (status active), banners, home_layouts (published data only — drafts are in panel-only `home_layout_drafts`), blogs, blog_categories, faqs, pages`.
- Owner: `users/{uid}` (+subcollections as above), `orders` where `user_id == uid` (read), `orders/{id}/secret/otp` (owner read), `return_requests`/`withdrawal_requests`/`referrals` where `user_id/referrer_id == uid` (read), chats (owner read/create, messages create).
- Rider (`role=='delivery_boy'`): own `delivery_boys` doc (read; update `location` only), orders assigned or available in `zone_id` claim (read), own earnings/cash/withdrawals (read).
- Panels: `role=='admin'` full read/write on catalog/config collections; `staff` by `roles/{role_id}.permissions`; `store` only docs with `store_id == claim.store_id` (orders read, products/store_stocks/promo_codes/banners write for own store, `home_layout_drafts` of the store's zone, chats and the notifications log carrying their `store_id`). `settings/private_*`: role admin only. Collection group `**/wallet_transactions`: `wallet.list` or `customer.list` (admin/staff; not store users — ledger rows carry no store). Server-owned fields stay function-only.
- Everything else denied. Storage rules: public read for `catalog/**`, owner write for `users/{uid}/**` (images ≤ 5 MB), `reviews/{uid}/**` (owner write images ≤ 5 MB, public read), rider docs `delivery_docs/{uid}/**` (owner or panel write, owner + panel read), `withdrawal_receipts/**` (panel), `imports/{uid}/**` (panel CSV), invoices/exports function-only.

## 7. Data migration
`firebase/tools/migrate-from-mysql.ts` reads the current local MySQL (`snapbuy`) and writes Firestore + Auth (emulator by default, production with `--prod` and `GOOGLE_APPLICATION_CREDENTIALS`): all catalog/config/content, orders, returns, wallet ledgers, earnings, chats, reviews, etc. Auth users via `importUsers` with **BCRYPT** password hashes (existing passwords keep working) and existing `firebase_uid`s preserved (`user_<mysqlId>` for unlinked users without email/phone collisions). Then recomputes derived fields and `stats_daily`.
Mapping details: `settings/private_*` are written with the canonical key names above (Laravel `mail_*` → `host/port/username/password/encryption/secure/from_email/from_name`, `sms_gateway` → `gateway`, `private_ai` only `gemini_api_key/gemini_model`); `home_layouts` rows → published `home_layouts/{id}` + `home_layout_drafts/{id}`; `promo_codes.store_id` from the MySQL column when present (Laravel has none → null); `chats.store_id` / `order_number` from the linked order; `notifications.store_id` null (admin broadcasts) + `user_name`; `cash_collections` / `delivery_earnings` carry `order_number`; `settings/public.delivery.auto_assign` from `auto_assign_delivery`; variants without `attribute_value_ids` get `attrs` derived from the variant name (matching attribute value → that value + id; else the single attribute the siblings use; else `{variant: name}`) and are flagged `attrs_derived:true`.
Image fields hold full download URLs: `https://firebasestorage.googleapis.com/v0/b/qwikmart-37299.firebasestorage.app/o/…` with `--prod`; in emulator data the host is `STORAGE_PUBLIC_HOST` (default the Storage emulator, e.g. `127.0.0.1:9199`) — clients running against emulator data on another host (Android emulator `10.0.2.2`) should rewrite that host. The object path is the URL-decoded segment after `/o/`. Functions always use the default bucket `qwikmart-37299.firebasestorage.app` (also in the emulator).

## 8. stats_daily rule (binding — matches the old Laravel dashboard)
- Bucket by order `created_at` in **Asia/Kolkata** (day + hour).
- `orders`: every order except `payment_pending`.
- `revenue` (= `totals.grand_total`), `delivery_charges`, `tax`, `units`, `by_category`, `by_mode.*.revenue`, `by_hour.*.revenue`: orders whose status is **not** in `payment_pending | cancelled | returned` (NON_REVENUE_STATUSES).
- `cancelled` / `returned`: counts of orders currently in those statuses. `by_status`: count per current status.
- Triggers apply the diff between the old and new contribution of an order, so a status change moves it between buckets correctly.

## Deviations (functions/rules implementation)
Recorded by the backend build (`firebase/functions`, `firestore.rules`). Clients should code against these.
- **Extra functions-only collections**: `promo_usages/{promoId}_{uid}` `{count}` (per-user coupon usage, decremented on cancel), `wallet_recharges/{id}` (pending gateway top-ups; `walletRecharge` returns `recharge_id`, pass it to `verifyWalletRecharge({recharge_id, payload})`). Rules deny both to clients.
- **Extra order fields**: `promo_code_id`, `all_cancelable`, `platform`, `rejected_by[]` (riders who rejected), item `unit_price`, `tax_percent`, `category_id`, `stock_source:'store'|'central'`, `return_allowed`, `return_days`, `cancelable`; `timeline[]` entries also carry `note`. `orders/{id}/secret/otp` also stores `user_id`.
- **cartSummary** returns a few extra keys (Laravel parity): `item_count, total_qty, mrp_total, delivery_charge_original, additional_charges_breakdown[], promo_error, min_order_remaining, free_delivery_above, distance_km, delivery_minutes, store, zone_id, mode`; items add `unit_price, tax_amount, stock, cod_allowed`. `promo` has `{code,title,discount,is_cashback,free_delivery,message}`. Optional inputs `lang`, `platform`, `lat`, `lng`.
- **Zone `additional_charges`** (not priced by Laravel) are summed into `additional_charges` and added to `grand_total` for delivery orders.
- **Stock source**: quick mode uses `store_stocks/{store}_{variant}` when it exists (else central variant stock, same as Laravel `pricingFor`); ecommerce mode always uses central `variants[].stock`. Cart lines are aggregated per variant regardless of the `store_id` in the line id; checkout deletes every line of that mode.
- **Rider commission, cashback and referral rewards** are applied by `onOrderWritten` (idempotent deterministic ids `delivery_earnings/commission_{orderId}`, wallet txns `commission_/cashback_/referral_…`); **COD cash collection** (`cash_collections/cod_{orderId}`, `cash_in_hand`) is written inside the deliver transaction so `deliverOrder` can return `cash_collected` / `cash_in_hand`.
- **Return of part of a line** marks the whole order item `returned` (Laravel behaviour); refund = unit price × returned qty. When every item is returned the order becomes `returned` / `refunded`.
- **verifyPickupOtp** is the self-pickup handover: store/admin submits the customer OTP and the order becomes `delivered`.
- **payEarnings** `type`: `bonus|salary` (with `amount`) adds an entry; `pending` pays all pending entries; `credit_wallet` (default true) credits the rider wallet.
- **adminUpdateOrderStatus** follows `TRANSITIONS`; admins may pass `force:true` to override. Store users are limited to their `store_id`.
- **Auto-assign of riders** is implemented in `onOrderWritten` (§5) — only on placement of quick-mode orders, like Laravel (`ready_for_pickup` does not trigger it); self-pickup orders are never auto-assigned (Laravel did not check).
- **Home layouts**: drafts live in panel-only `home_layout_drafts/{id}`; `home_layouts/{id}` holds published data only and is written solely by `publishHomeLayout` (full rewrite — a legacy `draft_sections` on the public doc is dropped and turned into a draft doc on first publish). Admins may delete `home_layouts`.
- **deleteOrder** is a hard delete with an audit copy in `deleted_orders` (functions-only); stats are corrected by the trigger.
- **settings/private_*** are readable/writable by role `admin` (not staff, even with `setting.update`). Functions read the canonical keys and fall back to the Laravel names (`mail_*`, `sms_gateway`).
- **Guest users**: `users/{uid}` for anonymous auth is a minimal doc with `is_anonymous:true`; the upgrade to phone/email runs the new-user path once (`is_new:true`).
- **Cold start**: `detectZone`, `getHome`, `cartSummary` take `minInstances` from the `HOT_MIN_INSTANCES` param (default 0).
- **Rules**: Products read by non-panel clients must query `status == 'active'`. Riders listing the pool must filter `zone_id == claim.zone_id`, `delivery_boy_id == null`, `status in [received, processed, ready_for_pickup]` (the rule also allows `shipped`, matching Laravel `AVAILABLE_STATUSES`; the spec list is a valid subset). Chats carry `store_id` derived from the linked order (a client may only pass the store of its own order); store users read / reply / mark read those threads. Store owners (no `role_id`) may edit a few fields of their own `stores` doc and manage store-scoped `roles`.
- **Storage**: extra `imports/{uid}/**` (panel CSV uploads for `bulkImportProducts`, which reads `csv_path` under `imports/`), `exports/**` written by `exportReport`; `users/{uid}/avatar/**` and `reviews/{uid}/**` are public-read; `withdrawal_receipts/**` is panel-only; panel users may upload rider documents to `delivery_docs/{uid}/**`.
- **Invoices/exports URLs**: v4 signed URLs in production (needs Token Creator on the runtime SA); Firebase download-token URLs in the emulator or when signing fails.
- **FCM** is skipped in the emulator (set `FCM_IN_EMULATOR=1` to try). Email templates are read from `email_templates/{order_placed|order_delivered}` `{subject, body}` with `{{var}}` placeholders, falling back to built-ins.
- **Backend QA hardening (2026-10-13, see `firebase/QA_REPORT.md`)**:
  - `verifyPayment` / `verifyWalletRecharge` verify only the gateway order created by the server (`orders.gateway_order_id` / `wallet_recharges.gateway_order_id`); client-supplied gateway ids are ignored.
  - Delivery / pickup OTP: 5 wrong attempts lock `deliverOrder` / `verifyPickupOtp` for that order for 15 min (`resource-exhausted`). OTPs use `crypto.randomInt`.
  - Store users (role `store`) are refused by `walletAdjust`, `processWithdrawal`, `updateWithdrawal`, `payEarnings`, `approveDeliveryBoy`, `createDeliveryBoy`, `testSmtp`; `collectCash` / `assignDeliveryBoy` only for riders of the store's zone; `updatePaymentStatus` only for COD orders; `bulkImportProducts` only `imports/{own uid}/…`.
  - `sendBulkEmail` segments: `all | customers | delivery_boys | staff | stores | specific` (+ `user_ids`, max 500); store users: `customers` (= customers who ordered from the store) or `specific` (filtered to those).
  - `processReturn.refund_amount` ≤ the paid line amount (`unit_price × qty`, ≤ order `grand_total`). Delivered / returned orders cannot be cancelled (any actor, even with `force`).
  - Store promo codes (`store_id` set) only discount that store's items; duplicate codes resolve to the cart store's promo, then the platform promo; `listCoupons` hides other stores' promos.
  - Checkout refuses inactive zones and zones whose `fulfillment_type` does not serve the mode.
  - Rules: store users read only riders of their store's zone (`delivery_boys` queries must filter `zone_id`), cannot set `products.in_stock_store_ids`, `store_stocks` values validated (`stock ≥ 0`, `price` null or > 0); store staff need `order.view|update` to read the OTP. Storage: store users may add but not overwrite/delete `catalog/**` files; no SVG in `users/**`, `reviews/**`, `delivery_docs/**`; `delivery_docs` / `withdrawal_receipts` written by owner / admin+staff only.
  - `onOrderWritten` is idempotent per event (`_trigger_events/{id}`, functions-only; add a TTL policy on `expire_at`) and no longer recreates deleted product / store / user docs.
  - Params: `ENFORCE_APP_CHECK` (default false) and `HOT_MIN_INSTANCES` (default 0) in `functions/.env.qwikmart-37299`.
  - **Store staff** = `users.type 'store'` + `store_id` + `role_id` (claims `{role:'store', store_id, role_id}`), permissions from that store role and scoped to the store; store owner = no `role_id`. A `type:'staff'` user is platform staff and never carries a `store_id` (legacy docs are normalised by `syncProfile` and the migration).
  - `sendBulkEmail` queues `mail_queue/{id}` jobs (`to[]` ≤ 50, `status pending|sending|done|failed`, `sent`, `failed`; functions-only) processed by `onMailQueued`; the response adds `queued` and `jobs` (`sent`/`failed` are 0 at return).
  - `email_templates`: read (get/list) with `email.list` / `email.create` (store users with `email.list`), write with `email.create`.
  - `cash_collections.store_id` (order store / collecting store / rider zone's default store); store users read their rows (`where('store_id','==',claim.store_id)`).
  - **Customer / delivery QA batch**: `registerDeliveryBoy` is refused (`permission-denied`) for an existing non-rider account (customer / panel); only new accounts or existing riders (pending / rejected) may (re-)register. `syncProfile` called from the wrong app (`app:'delivery'` by a non-rider, `app:'customer'` by a rider / panel account) writes no client data (fcm token, language, login stamp), still syncs claims and returns `{user, is_new:false, claims, wrong_app:true, expected_type}`.
  - `cartSummary` / `placeOrder` price delivery on the same basis: the address when `address_id` is given, otherwise the zone/store default (no distance, default store); a detected `lat/lng` only helps find the zone. `cartSummary` returns `delivery_basis: 'address' | 'default'`.
  - `submitReview.images`: Storage paths (`reviews/{uid}/…`, `users/{uid}/…`) are stored as public download URLs (missing objects → `invalid-argument`); full URLs are kept.
  - `search_keywords`: apostrophes are removed and punctuated tokens also indexed joined (`Lay's` → `lays`, `Coca-Cola` → `coca`, `cola`, `cocacola`); clients should normalise the query the same way (lowercase, drop `' ’ ‘ \``, split on other punctuation).
  - `mergeGuestCart`: unknown guest uid → `not-found`; non-anonymous source account → `failed-precondition`.
