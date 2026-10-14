# QwikMart — Hyperlocal Quick Commerce & eCommerce Platform (Master Spec)

> **Note:** the Laravel `backend/` and its REST API described in §1, §5 and §6 were replaced by the Firebase-only backend — see [`FIREBASE_BACKEND.md`](FIREBASE_BACKEND.md). The product, UI, design tokens and data model here still apply.

This is the single source of truth shared by all five sub-projects. Every sub-project MUST follow
the names, routes, JSON shapes and design tokens here so the pieces fit together.

Reference screenshots live in `docs/reference/*.png` (open them with the Read tool):

| # | What | # | What |
|---|------|---|------|
| 5, 50 | Customer app home (Quick / eCommerce toggle) | 44 | Website: "Set Delivery Location" modal |
| 13–27 | Customer web + app feature screens | 45 | Website home (header, categories, hero) |
| 28–30 | Delivery boy app + panel screens | 46 | Admin login (Store Panel / Delivery Boy Panel buttons) |
| 31–41 | Admin panel screens (dashboard, products, AI SEO, orders, returns, stores, zones, pricing, coupons, home builder, delivery boys, wallet, countries, languages, roles, notifications) | 47 | Store panel dashboard (exact layout to copy) |
| 9, 37 | Home Builder | 48, 49 | Sidebar (exact module list) |
| 51–53 | Logo | 42, 43 | Architecture / deliverables |

## 1. Monorepo layout

```
qwikmart/
  backend/          Laravel 12 (PHP 8.2) — REST API (/api/v1) + Admin / Store / Delivery-boy web panels (Blade)
  web/              Next.js 14 (App Router, TypeScript, Tailwind) — customer website
  customer_app/     Flutter — customer mobile app (package com.qwikmart.app)
  delivery_app/     Flutter — delivery boy mobile app (package com.qwikmart.delivery)
  docs/             this spec + reference screenshots
```

Local tooling (Windows, use Git Bash paths):
- PHP 8.2 + Composer: `php`, `composer` on PATH. MySQL (XAMPP): `/f/xampp/mysql/bin/mysqld.exe` / `mysql.exe`, user `root`, no password, port 3306, database `snapbuy`.
- Node 22: prepend `export PATH=/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH` (default node on PATH is v14 — too old).
- Flutter 3.41 / Dart 3.11: `flutter` on PATH.

## 2. Brand & design tokens (sampled from the screenshots — use exactly)

| Token | Hex | Use |
|---|---|---|
| primary | `#0E9623` | buttons, active sidebar item, logo bg, links, price accents |
| primary-dark | `#0B7A1C` | hover/pressed |
| primary-50 (tint) | `#E6F4E9` | soft buttons (Store Panel / Delivery Boy Panel), chips, badges bg |
| admin-bg | `#F2F7FF` | admin content background |
| navy | `#25396F` | admin headings ("Welcome, Mumbai Store"), card titles |
| muted | `#7C8DB5` | admin secondary text, sidebar section labels |
| body-text | `#344054` | normal text |
| border | `#E6EAF2` | card borders, dividers |
| surface | `#FFFFFF` | cards, sidebar, header |
| web-header gradient | `#EBEC8D → #F8F9E9 → #FFFFFF` | website header & app "Quick" mode top (yellow-green) |
| ecommerce gradient | `#FDE2D6 → #FFF4EE` | app/web header in eCommerce mode (peach) |
| info | `#3B82F6` | "Today Orders" icon tile |
| success | `#22C55E` / `#0E9623` | revenue tile, delivered |
| warning | `#F59E0B` | returns tile, pending |
| danger | `#EF4444` | cancelled tile |
| purple | `#8B5CF6` | processed/units |

- Font: **Plus Jakarta Sans** (Google Fonts), weights 400/500/600/700/800. Flutter: `google_fonts` package `GoogleFonts.plusJakartaSans`.
- Radius: cards 12px, buttons 8–10px, pills 999px. Shadows very soft (`0 1px 2px rgba(16,24,40,.05)`).
- Icons: Lucide-style outline icons (admin/web: `lucide` / `lucide-react`; Flutter: `lucide_icons_flutter` or Material outlined).
- Logo: green rounded square (`#0E9623`) with a white shopping bag containing a green lightning "S", speed lines on the left; wordmark "QwikMart" in near-black `#111827`, semi-bold, rounded geometric. Ship an SVG at `backend/public/images/logo.svg`, `logo-icon.svg` and copy to web/apps.
- Currency default ₹ (INR); multi-country supports others.

## 3. Roles & demo credentials (seeders MUST create these)

| Panel | URL (backend) | Email | Password |
|---|---|---|---|
| Super Admin | `/admin/login` | admin@gmail.com | 123456 |
| Store Panel | `/store/login` | mumbai@store.com | Mumbai@1 |
| Delivery Boy Panel | `/delivery/login` | alex@gmail.com | Alex@1234 |
| Customer (app/web) | API | customer@gmail.com | 123456 (phone +91 9876543210, OTP in demo mode = `123456`) |

Login page = screenshot 46 (illustration left, card right, "Store Panel" + "Delivery Boy Panel" soft-green buttons below "or").

## 4. Database schema (MySQL, Laravel migrations). All tables have `id` bigint PK + `timestamps()` unless noted.

Translatable text columns are JSON `{"en":"...","ar":"...","hi":"..."}` (use `spatie/laravel-translatable`). Marked **(T)**.

**Geography & settings**
- `countries`: name, iso2 (`IN`), dial_code (`+91`), currency_code (`INR`), currency_symbol (`₹`), timezone, date_format, flag (emoji or path), is_default bool, status bool.
- `zones`: country_id, name, city, polygon JSON (array of `{lat,lng}`), fulfillment_type enum(`quick`,`ecommerce`,`both`), base_charge decimal, base_distance_km decimal, per_km_charge decimal, free_delivery_above decimal null, min_order decimal, surge_slots JSON (`[{from:"18:00",to:"21:00",amount:10}]`), additional_charges JSON, delivery_time_minutes int (quick ETA, e.g. 8), status.
- `stores`: zone_id, country_id, name, slug, email, phone, password (store owner login lives in `users`), address, city, lat, lng, logo, banner, opening_time, closing_time, fulfillment_type enum(quick,ecommerce,both), commission_percent, status, is_open bool.
- `settings`: key (unique), value (longText), group (`general`,`payment`,`sms`,`firebase`,`smtp`,`ai`,`app`,`referral`,`wallet`). Typed accessor `Setting::get('key', default)`.
- `languages`: name, code (`en`), is_rtl bool, is_default bool, status; `translations`: language_id, platform enum(`customer_app`,`delivery_app`,`website`,`admin`), data JSON.

**Users & access**
- `users`: name, email unique null, phone unique null, country_code, password, avatar, type enum(`admin`,`staff`,`store`,`customer`,`delivery_boy`), store_id null (for store owner/store staff), role_id null, referral_code unique, referred_by null, wallet_balance decimal(12,2) default 0, fcm_token null, status bool, email_verified_at, last_login_at, softDeletes.
- `roles`: name, guard enum(`admin`,`store`), permissions JSON (array of permission keys, e.g. `order.list`,`order.update`,`category.create`, … — see screenshot 40); `staff` users get role_id.
- `delivery_boys`: user_id, zone_id, country_id, dob, address, vehicle_type, vehicle_number, driving_license, id_proof, bank_name, bank_account, ifsc, commission_type enum(`fixed`,`percent`), commission_value, salary, cash_in_hand decimal, is_online bool, current_lat, current_lng, location_updated_at, approval_status enum(`pending`,`approved`,`rejected`), status.
- `addresses`: user_id, label (`Home`/`Work`/`Other`), name, phone, address_line, landmark, city, state, pincode, country_id, lat, lng, is_default.
- `otps`: phone, code, expires_at.

**Catalog**
- `categories`: parent_id null, name (T), slug, image, icon, banner, header_color (hex for app top tab), sort_order, status, show_in_quick bool, show_in_ecommerce bool. Top-level categories = home tabs ("All, Grocery, Beauty, Pharmacy, Kids, Summer…").
- `brands`: name, slug, logo, status.
- `attributes`: name (T) (Size, Color, Flavor, Kg); `attribute_values`: attribute_id, value, color_hex null.
- `products`: store_id null (null = global catalog), category_id, sub_category_id null, brand_id null, name (T), slug, short_description (T), description (T, HTML), images JSON, thumbnail, product_type enum(`simple`,`variable`), tax_id null, is_veg null bool, return_allowed bool, return_days int, cancelable bool, cod_allowed bool, max_qty_per_order, fulfillment_type enum(quick,ecommerce,both), seo_title (T), seo_description (T), seo_keywords (T), schema_markup text, tags JSON, rating_avg decimal(2,1), rating_count int, is_featured, status enum(`draft`,`active`,`inactive`,`pending_approval`), softDeletes.
- `product_variants`: product_id, name ("500 g", "1 kg", "XL / Red"), sku, attribute_value_ids JSON, price decimal (MRP), sale_price decimal null, stock int, low_stock_alert int default 5, weight, image, status.
- `store_stocks`: store_id, product_variant_id, stock, price null, sale_price null (per-store override) — unique(store_id, product_variant_id).
- `taxes`: name, percent, status.
- `product_relations`: product_id, related_product_id, type enum(`cross_sell`,`up_sell`).
- `reviews`: product_id, user_id, order_item_id, rating tinyint, comment, images JSON, status.
- `favorites`: user_id, product_id (unique pair).

**Cart / orders / money**
- `carts`: user_id null, guest_token null, product_variant_id, store_id, qty, mode enum(`quick`,`ecommerce`).
- `promo_codes`: code unique, title, description, image, banner_color, discount_type enum(`percent`,`fixed`,`free_delivery`), discount_value, max_discount, min_order, usage_limit_total, usage_limit_per_user, used_count, starts_at, ends_at, is_permanent bool, applies_to enum(`all`,`categories`,`products`,`stores`), applies_to_ids JSON, audience enum(`all`,`new`,`existing`), channels JSON (`["quick","ecommerce"]`), platforms JSON (`["app","web"]`), zone_ids JSON, country_ids JSON, time_from, time_to, is_instant bool, is_cashback bool, status.
- `orders`: order_number (`SB-ORD-00001`), user_id, store_id, zone_id, country_id, address_id, address_snapshot JSON, mode enum(quick,ecommerce), delivery_type enum(`delivery`,`self_pickup`), status enum(`payment_pending`,`received`,`processed`,`shipped`,`ready_for_pickup`,`picked_up`,`out_for_delivery`,`delivered`,`cancelled`,`returned`), payment_method (`cod`,`wallet`,`stripe`,`paypal`,`razorpay`,`cashfree`,`phonepe`,`paytabs`,`midtrans`,`paystack`), payment_status enum(`pending`,`paid`,`failed`,`refunded`), transaction_id, subtotal, discount, promo_code_id null, promo_discount, delivery_charge, surge_charge, tax_amount, wallet_used, total, delivery_otp (6 digits), delivery_boy_id null, assigned_at, delivered_at, cancel_reason, cancelled_by, notes, invoice_path, estimated_delivery_at, softDeletes.
- `order_items`: order_id, product_id, product_variant_id, product_name, variant_name, image, price, sale_price, qty, tax_amount, total, status (mirror order status + `return_requested`,`returned`).
- `order_status_histories`: order_id, status, note, changed_by_id, created_at.
- `return_requests`: return_number (`RET-00001`), order_id, order_item_id, user_id, qty, reason, images JSON, status enum(`pending`,`approved`,`rejected`,`pickup_assigned`,`picked_up`,`refund_completed`), refund_amount, refund_method enum(`wallet`,`original`), delivery_boy_id null, admin_remark.
- `wallet_transactions`: user_id, type enum(`credit`,`debit`), amount, balance_after, payment_type (`razorpay`,`paystack`,`wallet`,`cod`,`referral`,`cashback`,`refund`,`admin`,`withdrawal`), txn_id, order_id null, message, status enum(`pending`,`success`,`failed`).
- `withdrawal_requests`: user_id, user_type enum(customer,delivery_boy), amount, message, status enum(`pending`,`approved`,`rejected`), remark, receipt_image, processed_at.
- `cash_collections`: delivery_boy_id, order_id null, amount, type enum(`collected_from_customer`,`submitted_to_admin`), message, status.
- `delivery_boy_earnings`: delivery_boy_id, order_id, amount, type enum(`commission`,`bonus`,`salary`), status.
- `referrals`: referrer_id, referred_id, referrer_reward, referred_reward, status enum(pending,credited), min_order.

**Content / engagement**
- `home_layouts`: zone_id, mode enum(quick,ecommerce), category_id null (null = "All" tab), header_bg_type enum(`color`,`image`), header_bg_value, text_color, is_published bool, draft_sections JSON, published_sections JSON, published_at. Section object: `{id, type, title, is_active, sort, settings:{...}}` where type ∈ `banner_slider`,`category_section`,`product_slider`,`top_brands`,`grid_banner`,`title_image`,`heading_text`.
- `banners`: title, image, link_type enum(`product`,`category`,`url`,`none`), link_value, zone_id null, mode, position, status. (Banner sliders in layouts reference banner ids or inline images.)
- `notifications`: title, message, type enum(`default`,`order`,`promotion`,`product`,`category`), link, image, target enum(`all`,`customers`,`delivery_boys`,`user`), user_id null, sent_at.
- `user_notifications`: user_id, notification_id null, title, message, data JSON, read_at.
- `chats`: user_id, user_type enum(customer,delivery_boy), order_id null, subject, last_message_at, status enum(`open`,`closed`); `chat_messages`: chat_id, sender_id, sender_type enum(`admin`,`customer`,`delivery_boy`,`store`), message, attachment, read_at.
- `blogs`: blog_category_id, title (T), slug, image, excerpt (T), content (T), read_minutes, views, status; `blog_categories`: name (T), slug.
- `faqs`: question (T), answer (T), sort, status.
- `pages`: slug (`about`,`privacy`,`terms`,`refund`), title (T), content (T).
- `email_templates`: key, subject, body; `email_logs`.

## 5. REST API contract (`backend`, prefix `/api/v1`, JSON, Laravel Sanctum bearer tokens)

Envelope for every response:
```json
{ "success": true, "message": "OK", "data": { ... }, "meta": { "current_page":1, "last_page":5, "per_page":20, "total":93 } }
```
Errors: `success:false`, `message`, `errors` (validation map), HTTP 4xx. Headers the clients send: `Authorization: Bearer <token>`, `Accept-Language: en`, `X-Zone-Id`, `X-Mode: quick|ecommerce`, `X-Guest-Token` (guest cart), `X-Country-Id`.

Images are returned as absolute URLs. Money values as numbers. Translatable fields are returned already resolved to the requested language.

### 5.1 Public / customer
| Method | Path | Notes |
|---|---|---|
| GET | `/settings/app` | app name, logo, primary color, currency, countries, languages, payment gateways enabled (+ public keys), referral config, demo_mode, support phone/email, social links, min app version |
| GET | `/countries` | active countries |
| GET | `/zones?country_id=` | list zones |
| POST | `/zones/detect` | `{lat,lng}` → `{zone, store, distance_km, delivery_minutes, deliverable:bool}` (point-in-polygon, nearest store) |
| POST | `/auth/send-otp` | `{phone, country_code}` (demo OTP `123456`) |
| POST | `/auth/verify-otp` | `{phone, country_code, otp, name?, referral_code?, fcm_token?}` → `{token, user, is_new}` |
| POST | `/auth/login` | `{email|phone, password}` → `{token, user}` |
| POST | `/auth/register` | `{name, email, phone, password, referral_code?}` |
| POST | `/auth/logout` | |
| GET/PUT | `/profile` | update name, email, avatar (multipart), fcm_token |
| DELETE | `/profile` | delete account |
| GET | `/home?category_id=` | resolved published home layout for X-Zone-Id + X-Mode: `{header:{bg_type,bg_value,text_color}, categories:[top tabs], sections:[{type,title,items:[...]}]}` — sections already hydrated with banners/categories/products/brands |
| GET | `/categories?parent_id=` | tree when `tree=1` |
| GET | `/brands` | |
| GET | `/products` | filters: `q, category_id, brand_id, min_price, max_price, sort(price_asc,price_desc,newest,popular,rating,discount), attributes[size][]=..., per_page` |
| GET | `/products/{slug}` | full detail incl. variants, images, rating breakdown, reviews (latest 5), similar, cross_sell, up_sell, store, delivery_minutes |
| GET | `/products/{id}/reviews` | paginated |
| GET | `/search/suggestions?q=` | product names + categories; `/search/trending` |
| GET | `/blogs`, `/blogs/{slug}`, `/blog-categories`, `/faqs`, `/pages/{slug}` | |
| GET/POST/PUT/DELETE | `/cart`, `/cart` `{product_variant_id, qty}`, `/cart/{id}` `{qty}`, `/cart/{id}` | works with guest token or auth; GET returns `{items:[...], subtotal, savings, delivery_charge, surge_charge, tax, promo:{...}|null, wallet_balance, total, free_delivery_remaining}` |
| POST | `/cart/sync` | merge guest cart into user after login `{guest_token}` |
| DELETE | `/cart` | clear |
| GET | `/promo-codes` | applicable coupons for current cart |
| POST | `/promo-codes/apply` | `{code}` → discount preview |
| GET/POST/PUT/DELETE | `/addresses` | |
| POST | `/orders` | `{address_id|null, delivery_type, payment_method, promo_code?, use_wallet:bool, notes?}` → order + `payment` object (gateway order id / client secret / redirect url) |
| POST | `/orders/{id}/payment/verify` | gateway callback verification |
| GET | `/orders?status=` | |
| GET | `/orders/{id}` | detail incl. items, status timeline, delivery_otp, delivery_boy `{name, phone, avatar, lat, lng}`, invoice_url, can_cancel, can_return |
| GET | `/orders/{id}/track` | `{status, delivery_boy:{lat,lng,updated_at}, store:{lat,lng}, address:{lat,lng}, eta_minutes}` |
| POST | `/orders/{id}/cancel` | `{reason}` |
| POST | `/orders/{id}/reorder` | adds items to cart |
| GET | `/orders/{id}/invoice` | PDF (barryvdh/laravel-dompdf) |
| POST | `/returns` | `{order_item_id, qty, reason, images[]}`; GET `/returns` |
| POST | `/reviews` | `{order_item_id, rating, comment, images[]}` |
| GET/POST/DELETE | `/favorites`, `/favorites/{product_id}` | |
| GET | `/wallet` | balance + paginated transactions |
| POST | `/wallet/recharge` | `{amount, payment_method}` → gateway payload; `/wallet/recharge/verify` |
| POST | `/wallet/withdraw` | `{amount, message}`; GET `/wallet/withdrawals` |
| GET | `/referral` | `{code, referrer_reward, referred_reward, min_order, total_earned, referrals:[...]}` |
| GET | `/notifications`, POST `/notifications/read-all` | |
| GET/POST | `/chats`, `/chats/{id}/messages` (GET paginated, POST `{message, attachment}`) | support chat (optionally tied to order_id) |

### 5.2 Delivery boy (`/api/v1/delivery/...`, user.type = delivery_boy)
| Method | Path | Notes |
|---|---|---|
| POST | `/delivery/register` | multipart: name, email, phone, password, dob, country_id, zone_id, address, vehicle_type, vehicle_number, driving_license (file), id_proof (file), bank_name, bank_account, ifsc → approval_status pending |
| POST | `/delivery/login` | `{email, password, fcm_token}` |
| GET/PUT | `/delivery/profile` | |
| POST | `/delivery/status` | `{is_online}` |
| POST | `/delivery/location` | `{lat, lng}` (call every ~10s while online/active order) |
| GET | `/delivery/dashboard` | today earnings, cash in hand, pending/active/delivered counts |
| GET | `/delivery/orders?type=available|active|history` | |
| GET | `/delivery/orders/{id}` | pickup info (store), delivery info (customer), items, track timeline, payment method, amount to collect |
| POST | `/delivery/orders/{id}/accept` | / `reject` |
| POST | `/delivery/orders/{id}/status` | `{status: picked_up|out_for_delivery}` |
| POST | `/delivery/orders/{id}/deliver` | `{otp}` must equal order.delivery_otp; if COD records cash_collection + adds to cash_in_hand; credits commission |
| GET | `/delivery/returns` / POST `/delivery/returns/{id}/picked-up` | return pickups |
| GET | `/delivery/earnings` | summary + list |
| GET | `/delivery/cash-collections` | `{cash_in_hand, cash_collected, items:[...]}` |
| GET | `/delivery/wallet` / POST `/delivery/withdraw` | |
| GET/POST | `/delivery/chats`, `/delivery/chats/{id}/messages` | support chat with admin |
| GET | `/delivery/notifications` | |

### 5.3 Admin-only AI
- `POST /admin/ai/product-content` (web route, session auth) `{name, category, keywords, language}` → Google Gemini (`gemini-2.5-flash`, key in settings `gemini_api_key`) returns `{short_description, description, seo_title, seo_description, seo_keywords}`.
- `POST /admin/ai/translate` → translate a field into other active languages.

### 5.4 Integrations
- **FCM**: HTTP v1 API using service account JSON (setting `firebase_service_account`), `App\Services\FcmService::sendToUser($user, $title, $body, $data)` / `sendToTopic`. Triggered on order status change, new chat message, new order assigned, promotions.
- **SMS**: `App\Services\Sms\SmsManager` with drivers `twilio`, `fast2sms`, `2factor`, `msg91`, `firebase` (client-side auth), selected by setting `sms_gateway`. Demo mode → OTP `123456`, no SMS sent.
- **SMTP**: Laravel mail using settings-driven config; order placed/delivered emails; Email module in admin to send bulk emails.
- **Payments**: `App\Services\Payments\PaymentManager` with gateway classes (Stripe, PayPal, Razorpay, Cashfree, PhonePe, PayTabs, Midtrans, Paystack) + Wallet + COD. Keys configured in admin Settings → Payment. Implement Stripe/Razorpay/Paystack fully (create + verify), others as structured stubs with the same interface.
- **Realtime**: chats & tracking are served via REST polling (every 5s) plus FCM data messages to trigger refresh. (Firebase Realtime DB optional later.)

## 6. Admin / Store / Delivery-boy web panels (backend Blade)

Layout = screenshot 47: fixed white left sidebar (logo top, Ctrl+K search, sections MAIN / CATALOG / LOCATIONS / DELIVERY / CUSTOMERS / MARKETING / REPORTS / STORE PANEL / SETTINGS with uppercase muted labels, active item = solid `#0E9623` pill with white text, thin green right border on sidebar), top header (collapse toggle, `DEMO` badge, dark-mode, country/globe, notification bell with badge, language, avatar + name + role dropdown), content bg `#F2F7FF`, page title in navy.

Super Admin sidebar (screenshots 31–41, 48, 49):
- **MAIN**: Dashboard, Orders, Self Pickup, Return Requests, Chat, Home Builder (▸ Quick Layouts, eCommerce Layouts, Banners)
- **CATALOG**: Categories (▸ Add Category, Manage Categories, Category Order), Products (▸ Add Product, Manage Products, Product Ratings, Approve Requests, Attributes, Taxes, Media, Bulk Upload, Bulk Update), Brands, Stock Management
- **LOCATIONS**: Countries, Zones (▸ Add Zone, Manage Zones), Stores (▸ Add Store, Manage Stores)
- **DELIVERY**: Delivery Boys (▸ Manage, Pending Approvals, Cash Collection, Earnings/Payouts, Withdrawal Requests)
- **CUSTOMERS**: Customers (▸ Manage Customers, Wallet Transactions, Withdrawal Requests, Referrals)
- **MARKETING**: Promo Code (▸ Add Promo Code, Manage Promo Codes), Notifications, Email, Blog (▸ Posts, Categories), FAQs
- **REPORTS**: Reports (▸ Sales Report, Product Sales, Store Report, Delivery Boy Report, Tax Report, Quick vs eCommerce)
- **STAFF**: Staff Users, Roles (role permission matrix, screenshot 40)
- **SETTINGS**: System Settings (general, app, payment gateways, SMS gateway, Firebase, SMTP, AI/Gemini, referral, wallet, delivery), Languages (with JSON editors per platform, screenshot 39), Pages (About/Privacy/Terms/Refund)

Store panel (`/store/*`, screenshot 47/48/49): same layout, scoped to its store: Dashboard, Orders, Self Pickup, Return Requests, Chat, Home Builder, Categories, Products, Brands, Stock Management, Delivery Boys, Customers, Promo Code, Notifications, Email, Reports, **STORE PANEL**: Store Users, Store Roles.

Delivery boy web panel (`/delivery/*`): Dashboard, My Orders, Cash Collection, Earnings, Wallet & Withdrawals, Chat with Support, Profile.

Dashboard (screenshot 47/31): greeting "Welcome, <name>" + "Good afternoon · 12 Oct 2026", date range filter (Today/This Week/This Month/This Year/Custom), country + zone filters (super admin), 4 KPI cards (Today Orders blue, Today Revenue green, Today Returns orange, Today Cancelled red — colored rounded icon tile left), "Revenue & Orders Trend" area chart (ApexCharts, two green lines), "Order Status" list with colored progress bars, metric cards (Total Revenue, Total Orders, Delivery Charges, Tax Collected, Units Sold, Active Customers, Active Products, Active Stores, Active Coupons, Delivery Staff) with growth badge, Sales by Category donut, Quick vs eCommerce comparison, Highest Revenue Stores, Top Rated Products, Top Customers, Inventory Health (in stock / low / out), Low-stock list.

Tables everywhere (screenshots 34–38): filter selects (All Countries / All modes / All Statuses), search box, refresh button, sortable headers, status pills, action icons (view/edit/delete), per-page select + pagination — server-side via simple query params (no heavy JS framework). Forms open as full pages or right-side modals. Product create = 5-step tabs (Category → Product Details → Variants → SEO → Review) with per-language tabs and "Generate SEO with AI" + "Translate" buttons (screenshot 33). Zones = Leaflet map with polygon drawing (leaflet-draw, OSM tiles). Promo code form = 9 sections (screenshot 36). Home builder = 3-column editor (sections list w/ toggles + drag reorder | live phone preview | settings panel), Draft/Published, "Publish Changes" (screenshots 9, 37).

Frontend stack for panels: Blade + Tailwind (Vite build, Node 22) + Alpine.js + ApexCharts + Leaflet + SortableJS + lucide icons. Dark mode toggle (class strategy).

## 7. Customer website (Next.js) — screenshots 13–27, 44, 45

- On first visit: "Set Delivery Location" modal (screenshot 44): Use my current location (geolocation → `/zones/detect`), search location (Nominatim/OSM geocoding), OR pick zone by country + zone chips, "Don't see your area?" card. Persist zone/location in cookie + localStorage. Cookie-consent bar at bottom.
- Header (screenshot 45): yellow-green gradient, logo, "Delivery in X minutes · Y km" + address (click → location modal), rotating search placeholder "I am looking for… <product>", Quick / eCommerce segmented toggle (white active pill), cart icon with count, Login/avatar. Category tab strip with icons + underline on active. Header gradient changes per category `header_color` and per mode.
- Home: render `/home` sections (hero banner slider with dots, "Find Your Favorites" category grid, product sliders, grid banners, top brands, title images).
- Pages: `/[zone]` (home; zone slug in URL like `/mumbai`), `/categories`, `/category/[slug]`, `/products?q=` (filters sidebar: categories, brands, color, size, price; sort; grid), `/product/[slug]` (gallery, variants, add to cart/buy now, badges, ratings & reviews, similar products), `/cart`, `/checkout` (address, coupons, wallet toggle, payment method list, place order), `/orders`, `/orders/[id]` (timeline, map tracking with Leaflet, OTP, cancel, return, invoice, reorder), `/wallet`, `/refer-earn`, `/favorites`, `/addresses`, `/profile`, `/notifications`, `/support` (chat), `/blog`, `/blog/[slug]`, `/faq`, `/pages/[slug]`, `/login` (phone + OTP and email/password tabs).
- Product card: image, discount ribbon, ETA "8 mins", name, pack size, price + struck MRP, green outlined "ADD" button that becomes `− qty +` stepper.
- i18n (en/ar/hi) with RTL for ar, light/dark theme, currency from country.
- API base URL from `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000/api/v1`).

## 8. Customer app (Flutter) — screenshots 5, 50, 13–27

Package `com.qwikmart.app`, name "QwikMart". State: `flutter_riverpod`; HTTP: `dio`; routing: `go_router`; storage: `shared_preferences` + `flutter_secure_storage`; images: `cached_network_image`; maps: `flutter_map` + `latlong2` (OSM, no API key); location: `geolocator`; push: `firebase_messaging` + `flutter_local_notifications` (guarded so app runs without google-services.json); carousel: `carousel_slider`; fonts: `google_fonts`; i18n via `flutter_localizations` + JSON strings (en, ar, hi; RTL).
Screens: Splash → Onboarding → Location permission / select location (map pin) → Login (phone + OTP) → Main tabs (Home, Categories, Favourites, Profile — bottom nav like screenshot 5). Home top: Quick/eCommerce toggle, "Delivery in 8 minutes · 2.48 km away" + address, bell, search bar with rotating hint + mic, horizontal category tabs with icons, then sections from `/home`. Also: Category products, Search (with filters/sort), Product detail, Cart/Checkout (screenshot 16/17), Payment methods, Order success, Orders list, Order detail (OTP card, timeline, cancel, return, invoice, reorder, help), Live tracking map, Wallet (history, add money, withdraw), Refer & Earn, Ratings & Reviews, Chat with Support, Notifications, Addresses, Profile/Settings (language, theme), Blog, FAQ.
API base URL in `lib/core/config.dart` (`http://10.0.2.2:8000/api/v1` for Android emulator).

## 9. Delivery boy app (Flutter) — screenshots 28–30

Package `com.qwikmart.delivery`, name "QwikMart Delivery". Same stack. Screens: Splash → Login (email/password, Forgot) / Create Account (multi-step: personal info, country/zone, vehicle, documents upload, bank details) → Pending approval screen → Home (online/offline toggle, today earnings, cash in hand, tabs Available / Active / History) → Order detail guided workflow (Ready for Pickup: pickup info + Get Directions, delivery info + call/directions, track order timeline, buttons Accept → Picked Up → Out for Delivery → Enter OTP → Delivered, collect COD amount) → Returns pickups → Cash Collection (cash in hand, cash collected, list) → Earnings → Wallet (balance, Withdraw, request list) → Chat with Support → Notifications → Profile. Background location updates while online (`geolocator` stream → `/delivery/location`).

## 10. Seed / demo data

Seed: countries (India default, Australia, Canada, UAE, UK, US); zones (Mumbai with polygon around Mumbai, Toronto, Sydney, Dubai, London, New York); stores (Mumbai Store, Toronto Store, Sydney Store, Dubai Store, London Store, New York Store); languages en/ar(rtl)/hi; categories with header colors (Grocery, Beauty, Pharmacy, Kids, Summer, Electronics, Fashion, Mobiles, Snacks, Fresh Fruits & Vegetables, Home & Kitchen, Pet Care) and subcategories (Dal, Bakery & Biscuits, Dairy & Eggs, Dry Fruits, Edible Oils, Chips, Namkeen, Wafers…); brands; ~60 products with variants and stock in Mumbai Store (use placeholder images via `https://placehold.co/600x600/E6F4E9/0E9623?text=...` or local generated SVG placeholders); published home layouts for Mumbai quick + ecommerce; promo codes MUMBAI99, VIP500, HAPPYHOUR, WALLETCASH50; demo orders across statuses spread over the current year; delivery boys (Alex Johnson + 8 more); customers; wallet transactions; return requests; blogs; FAQs; pages; notifications.
