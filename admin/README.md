# QwikMart Admin (Next.js + Firebase)

The Super Admin (`/admin`), Store (`/store`) and Delivery Boy (`/delivery`) web panels. Replaces the Laravel Blade panels and talks **only**
to Firebase: Auth (email/password), Cloud Firestore, Cloud Storage and callable Cloud Functions (`asia-south1`). The backend contract is
[`docs/FIREBASE_BACKEND.md`](../docs/FIREBASE_BACKEND.md); the look was ported 1:1 from the former Laravel views (`backend/resources/views`, since removed;
`backend/tailwind.config.js`, `resources/css/app.css`).

Stack: Next.js 15 (App Router, all pages client-rendered), React 19, TypeScript, Tailwind 3, Firebase JS SDK 12, TanStack Query,
react-hook-form + zod, ApexCharts, Leaflet + leaflet-draw (OSM tiles), dnd-kit, TipTap, PapaParse, lucide-react.

## Run locally

```bash
export PATH=/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH    # Node 22
cd admin
cp .env.example .env.local      # already points at the emulators
npm install
npm run dev                     # http://localhost:3001  → /admin/login, /store/login, /delivery/login
```

Start the Firebase Emulator Suite with the migrated data (separate terminal):

```bash
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"   # Java for the emulators
cd firebase
npm --prefix functions run build
npx firebase emulators:start --import tools/emulator-data --project qwikmart-37299
```

Demo logins (when `settings/public.demo_mode` is true the login form is pre-filled):

| Panel | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/admin/login` | admin@gmail.com | 123456 |
| Store | `/store/login` | mumbai@store.com | Mumbai@1 |
| Delivery Boy | `/delivery/login` | alex@gmail.com | Alex@1234 |

Other scripts: `npm run build` (runs `sync-indexes` first), `npm run start`, `npm run lint`, `npm run typecheck`, `npm run sync-indexes`.
Set `NEXT_DIST_DIR=.next-qa` to build into a separate folder (e.g. a QA build next to a running `next dev`).

## Environment

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` | web app config of project `qwikmart-37299` (see `.env.example`) |
| `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` | `asia-south1` |
| `NEXT_PUBLIC_USE_EMULATORS` | `true` → connect Auth 9099, Firestore 8080, Functions 5001, Storage 9199 |
| `NEXT_PUBLIC_EMULATOR_HOST` | `127.0.0.1` |
| `NEXT_PUBLIC_EMULATOR_AUTH_PORT` / `_FIRESTORE_PORT` / `_FUNCTIONS_PORT` / `_STORAGE_PORT` | optional emulator port overrides (defaults 9099 / 8080 / 5001 / 9199) |

All variables are public (`NEXT_PUBLIC_*`); there are no server secrets in this app. Secrets (payment keys, SMTP, Gemini) live in
`settings/private_*`, which only Cloud Functions read.

## How it works

- **Auth & routing** — Firebase email/password. The guard in `src/components/shell/PanelShell.tsx` reads the custom claim `role`
  (`admin|staff` → `/admin`, `store` → `/store` (needs `store_id`), `delivery_boy` → `/delivery`) and redirects other roles. Staff / store
  staff permissions come from `roles/{role_id}.permissions` (same keys as Laravel `Role::MODULES`); the sidebar and buttons use `can()`.
- **Data** — direct Firestore reads everywhere; catalog/config writes go straight to Firestore (guarded by `firestore.rules`, triggers derive
  computed fields); everything trusted (order status, rider assignment, returns, wallet, payouts, users/claims, publishing, AI, imports,
  notifications, emails) goes through the typed wrappers in `src/lib/callables.ts`.
- **Tables** — `src/components/ui/DataTable.tsx`: Firestore cursor pagination (`limit` + `startAfter`), `count()` totals, equality filters,
  sortable columns, search via `search_keywords array-contains` (first term server-side, the rest client-side).
- **Realtime** — chat threads/messages, order detail, rider online state and header notifications (`users/{uid}/notifications`) use `onSnapshot`.
- **Store panel** shares the admin modules; queries and writes are scoped by `claims.store_id`.

Layout: `src/app/{admin,store,delivery}/(panel)/**` are one-line route files that re-export modules from `src/modules/**`;
shared UI lives in `src/components/**`, Firebase helpers in `src/lib/**`.

## Deploy (Firebase App Hosting)

1. Create the backend once (Blaze plan):
   ```bash
   cd firebase
   npx firebase apphosting:backends:create --project qwikmart-37299 --location asia-south1
   # app root directory: admin   ·   live branch: main
   ```
2. `admin/apphosting.yaml` sets the runtime config and the `NEXT_PUBLIC_*` build env (emulators off). Commit and push — App Hosting builds
   with `npm run build` and serves with the Next.js adapter. Or roll out manually:
   `npx firebase apphosting:rollouts:create <backend-id> --project qwikmart-37299`.
3. Add the App Hosting domain to **Authentication → Settings → Authorized domains** (needed for password-reset links).
4. Deploy rules, indexes and functions from `firebase/` (`npm run deploy`). The composite indexes the panels need are listed below.

## Firestore composite indexes used by the panels

**Query planner.** Every Firestore query goes through `src/lib/queryPlan.ts` (via the tagged `where/orderBy/limit` and `fetchList / runQuery / countDocs / aggregateDocs / useLiveQuery / DataTable` in `src/lib/firestore.ts`). It knows the deployed composite indexes (`src/lib/firestoreIndexes.json`, copied from `firebase/firestore.indexes.json` by `npm run sync-indexes` / prebuild): an index-covered query is sent as-is (cursor pagination, server counts); any other filter × sort × search × date-range combination is sent as the largest covered subset with a bounded limit (1000) and the rest is filtered / sorted / paginated in the browser (`Total Records: N+` when the bound is hit). Modules must not import `where/orderBy/limit/query/getDocs/getCountFromServer/getAggregateFromServer` from `firebase/firestore`. A read policy (`setReadPolicy`, set by `PanelProvider`) mirrors `firestore.rules` so the store panel / limited staff never issue reads the rules deny.

The emulator doesn't enforce indexes; production does. These are the composite indexes the panel queries need — all of them
are merged into `firebase/firestore.indexes.json` (both sort directions where the table can toggle them, plus
`notifications (store_id, sent_at desc)` / `(store_id, type, sent_at desc)` for the store history and the
`wallet_transactions` collection-group field overrides). A query that hits a missing index shows "needs a Firestore index" in the
table instead of crashing.

| Collection | Fields |
|---|---|
| `orders` | (`store_id`,`created_at` desc/asc) · (`country_id`,`created_at` desc/asc) · (`zone_id`,`created_at` desc) · (`status`,`created_at` desc) · (`mode`,`created_at` desc) · (`payment_method`,`created_at` desc) · (`payment_status`,`created_at` desc) · (`delivery_type`,`created_at` desc) · (`delivery_boy_id`,`created_at` desc) · (`user_id`,`created_at` desc) · (`user_id`,`store_id`,`created_at` desc) · (`store_id`,`totals.total`) · (`zone_id`,`delivery_boy_id`,`status`) · (`delivery_boy_id`,`status`) · (`store_id`, `search_keywords` array-contains) |
| `return_requests` | (`store_id`,`created_at` desc/asc) · (`status`,`created_at` desc) · (`zone_id`,`created_at` desc) |
| `chats` | (`store_id`,`last_message_at` desc) |
| `stats_daily` | (`scope`,`date`) |
| `products` | (`store_id`,`created_at`) · (`store_id`,`min_price`) · (`status`,`created_at`) · (`status`,`min_price`) · (`status`,`rating_avg` desc) · (`status`,`max_discount_percent` desc) · (`category_ids` array-contains,`created_at`) · (`brand_id`,`created_at`) · (`fulfillment_type`,`created_at`) · (`store_id`,`status`,`created_at`) · (`category_ids` array-contains,`status`,`created_at`) · (`search_keywords` array-contains,`store_id`) · (`search_keywords` array-contains,`status`) · (`in_stock_store_ids` array-contains,`status`) |
| `reviews` | (`product_id`,`created_at` desc) · (`status`,`created_at` desc) · (`rating`,`created_at` desc) · (`rating`,`status`,`created_at` desc) |
| `users` | (`type`,`created_at` desc/asc) · (`type`,`status`,`created_at` desc) · (`type`, `search_keywords` array-contains) · (`type`,`name`) · (`type`,`orders_count`) · (`type`,`total_spent` desc) · (`type`,`wallet_balance`) |
| `stores` | (`zone_id`,`revenue` desc) · (`country_id`,`revenue` desc) |
| `delivery_earnings` | (`delivery_boy_id`,`created_at` desc) · (`type`,`created_at` desc) · (`status`,`created_at` desc) |
| `cash_collections` | (`delivery_boy_id`,`created_at` desc) · (`type`,`created_at` desc) · (`delivery_boy_id`,`type`,`created_at` desc) |
| `withdrawal_requests` | (`user_id`,`created_at` desc) · (`user_type`,`created_at` desc) · (`user_type`,`status`,`created_at` desc) |
| `wallet_transactions` (collection group) | single-field CG overrides on `created_at`, `type`; (`type`,`created_at` desc) · (`payment_type`,`created_at` desc) |
| `referrals` | (`status`,`created_at` desc) |
| `notifications` | (`type`,`sent_at` desc) · (`target`,`sent_at` desc) · (`type`,`target`,`sent_at` desc) |
| `mail_log` | (`status`,`created_at` desc) |
| `blogs` | (`category_id`,`created_at` desc) · (`status`,`created_at` desc) · (`category_id`,`status`,`created_at` desc) |

## Rules / backend features the panels rely on (all in place)

- Collection-group read on `wallet_transactions` (`match /{path=**}/wallet_transactions/{id}`) for admin / staff with `wallet.list` or
  `customer.list` (store users are not granted — ledger rows carry no store).
- System Settings reads and writes `settings/private_payment|sms|smtp|ai` directly — **role admin only** (staff see the secret tabs
  locked). Keys are the canonical ones listed in `firebase/README.md`; legacy `mail_*` / `sms_gateway` values are shown in the
  canonical fields. The Delivery tab has the **Auto-assign delivery boy** toggle (`settings/public.delivery.auto_assign`).
- Store panel: notification history (`notifications.store_id`, written by `sendNotification`), chats of the store's orders
  (`chats.store_id`, set by `onChatCreated`/`startChat`; store users can also mark them read), Home Builder drafts of the store's zone.
- Home Builder edits `home_layout_drafts/{id}` (panel-only); **Publish** (`publishHomeLayout`) copies sections + header into the
  public `home_layouts/{id}`.
- Order detail: editable payment status (`updatePaymentStatus`), **Delete** for cancelled / payment-pending orders (`deleteOrder`,
  admin/staff only), **Message customer** (`startChat`). Chat page: **New Chat** (`startChat`). Return detail: refund method
  (wallet / original payment, `processReturn.refund_method`) and **Delete** for pending / rejected returns (`deleteReturn`).
  Withdrawals: remark / receipt can be edited after processing (`updateWithdrawal`).
- Storage: receipts upload to `withdrawal_receipts/**`, bulk-import CSVs to `imports/{uid}/**`, admin rider documents to
  `delivery_docs/{uid}/**` — all allowed for panel users by `storage.rules`.

## Verification

`npm run lint`, `npm run typecheck` and `npm run build` pass. Headless Chrome (puppeteer-core) logged into all three panels against the
emulators loaded with `firebase/tools/emulator-data` and opened every route (admin 75, store 35, delivery 11) with no console errors except
the wallet-transactions collection-group rule (added since); key actions exercised end-to-end: order status update, rider assignment, OTP view,
brand create, home-layout save + publish, wallet adjust, product wizard navigation, rider online toggle.
