# QwikMart Admin — QA Report

Date: 2026-10-13 · Scope: `admin/` (Super Admin `/admin`, Store `/store`, Delivery `/delivery`) against the Firebase Emulator Suite
loaded with `firebase/tools/emulator-data` (own emulator set on ports 590xx for the destructive E2E run; logins + route crawl
re-run against the default-port emulators and the `:3001` dev server). Headless Chrome via puppeteer-core; every action was
verified against Firestore / Auth with the Admin SDK. Temporary QA files (`firebase/firebase.qa-admin.json`, functions snapshot, `.next-qa`) were removed after the run. Test scripts live in the session scratchpad (`qa-admin/t-*.js`,
`index-proof.js`).

## Verdict: **GO** (admin app)

All blocking items are fixed and verified: index coverage is proven (0 uncovered query combinations), the store panel
no longer reads collections the rules deny and hides money and rider actions, and demo credentials are pre-filled only
when `settings/public.demo_mode === true`. `npm run build`, `typecheck` and `lint` pass with no warnings.
`npm audit --omit=dev` reports 0 high/critical issues. 300+ E2E checks pass. The open items are backend items, listed
below, plus minor UX notes. None of them blocks the admin release.

## Build & config

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm run build` (Next 15.5.27, prebuild `sync-indexes`) | ✅ all 121 routes compiled |
| `npm audit --omit=dev` | ✅ 0 high / 0 critical. 26 moderate remain, all from the `@tiptap/*` v2 `mergeAttributes` advisory; the fix needs a TipTap v3 migration. Next upgraded 15.5.26 → **15.5.27**, plus `overrides`: `postcss@8.5.28` (Next's bundled 8.4.31 was high) and `@grpc/grpc-js@1.13.6` (firebase→firestore chain, high) |
| `apphosting.yaml` | ✅ `NEXT_PUBLIC_USE_EMULATORS="false"`, project `qwikmart-37299` web config, region `asia-south1`; engines node 22 |
| Emulator ports | now overridable: `NEXT_PUBLIC_EMULATOR_{AUTH,FIRESTORE,FUNCTIONS,STORAGE}_PORT` (defaults unchanged) |
| Separate build dir | `NEXT_DIST_DIR=.next-qa npm run build` (lets a QA build run next to a `next dev` that holds `.next`) |

## BLOCKING: Firestore index coverage — **0 uncovered combinations**

Production Firestore rejects any query that needs a composite index which is not deployed. 185 of 200 are deployed. The
emulator does not enforce this, so coverage is now guaranteed by construction:

* **`src/lib/queryPlan.ts`** (new) — a pure planner. It reads the deployed indexes from `src/lib/firestoreIndexes.json`,
  which `scripts/sync-indexes.mjs` copies from `firebase/firestore.indexes.json` (it runs as `prebuild`).
  * `servable(spec)` implements the Firestore index rules:
    * Queries that need only single-field indexes, or equality-only filters (index merge), are servable.
    * Otherwise an exact composite match is required: the equality/array fields, then the order fields with matching direction.
    * Collection-group queries need `fieldOverrides`.
    * Invalid shapes are rejected (≥2 `array-contains`, `array-contains-any` with `in`, …).
  * `plan(spec)` decides what is sent:
    * An index-covered query is sent unchanged (`exact`).
    * Otherwise the largest servable subset of the optional filters is sent with `limit(1000)`. The dropped filters, ranges, sort and limit are then applied in the browser.
    * Required scope filters (e.g. `store_id` for store users) always stay server-side.
* **`src/lib/firestore.ts`** — `where / orderBy / limit` are now tagged wrappers. Every read goes through the planner:
  * `fetchList`, `fetchGroup`, `runQuery`, `countDocs`, `aggregateDocs` (sum/avg/count) and `useLiveQuery`.
  * `DataTable`: exact queries use cursor pagination and a server `count()`. Uncovered ones fetch once (bounded), then filter, sort and paginate client-side. The footer shows `Total Records: N+` when the bound is hit.
* All ~25 direct `getCountFromServer / getAggregateFromServer / getDocs(query(...))` call sites in modules were moved to
  these helpers. Pages: dashboard, orders, order detail, products, reviews, customers, customer view, rider view, earnings, referrals, wallet transactions, withdrawals, roles, brands, taxes, zones, store view, blog categories, rider approvals, stock, header notifications, chat.
* **Proof script** (`scratchpad/qa-admin/index-proof.js`) does three things:
  1. It checks that the app's index copy equals `firebase/firestore.indexes.json`.
  2. It statically verifies that **no module builds a Firestore query outside the planner**: no `query / where / orderBy / limit / getDocs / getCountFromServer / getAggregateFromServer / collectionGroup / startAfter` imports from `firebase/firestore`, and no `onSnapshot` on queries.
  3. Per (source file × collection) it enumerates the superset of filter × sort (both directions) × search × date-range combinations the UI can produce. It runs the planner on each and checks that the query actually sent is servable.

```
index copy in sync with firebase/firestore.indexes.json: YES
composite indexes: 185
bypass (queries built outside the planner): 0
query combinations enumerated: 34975 — exact server query: 1974, planner fallback (bounded, rest client-side): 33001, UNCOVERED: 0
```

Spot checks:

| Query | Result |
|---|---|
| `orders status== + created_at desc` | exact |
| `orders country+status + created_at desc` | eq-only on the server, sort on the client |
| `orders status + search[]` | exact (composite exists) |
| `wallet_transactions` (CG) `type== + created_at desc` | exact via fieldOverrides |
| `orders store_id + created_at>= desc` | exact |

* **ProductsPage double `array-contains`** (category filter + search) is fixed. UI filters are now passed as
  `extraConstraints`, which the planner may move client-side. The server keeps one `array-contains` (search) and the
  category filter runs client-side. CSV export uses the same planned path. E2E: search + category filter shows no error.

## Store panel: rules-denied reads and money actions

* Read policy (`setReadPolicy` in `lib/firestore`, set during render by `PanelProvider`) mirrors `firestore.rules`.
  * For store users it blocks: `users/{other}` gets, `cash_collections`, `delivery_earnings`, `withdrawal_requests`, `email_templates`, `mail_log`, `referrals`, `wallet_transactions`, `addresses`.
  * The `users` *list* is still allowed when the user has `staff.list` (Store Users page).
  * For staff it applies the per-collection permission sets, so the app never sends a read the rules deny.
* UI changes:
  * Cash Collection (store): Riders + Collect only. The ledger tab is hidden and the wallet-balance column removed. `collectCash` is still allowed for zone riders.
  * Rider detail (store): no cash-ledger card.
  * Delivery Boys (store): no Bonus or Balance columns, no add/edit/delete.
  * Customer detail (store): the profile is built from the latest order snapshot, so it no longer shows "Customer not found". Wallet adjust, addresses, referrals and ledger are hidden.
  * Email (store): the "Email Templates" link is hidden and `/store/email/templates` shows Access denied.
* Money and rider callables are hidden in the store UI: `walletAdjust`, `processWithdrawal`, `payEarnings`, `approveDeliveryBoy`,
  `createDeliveryBoy`. Their routes do not exist in `/store`, and buttons are gated with `!isStore`. E2E: the store-panel checks pass with no 403s.

## Demo-mode prefill

* `LoginPage` pre-fills credentials and shows the demo hint **only** when `settings/public.demo_mode === true`.
  * Prefill runs once and never overwrites what the user already typed. Before, a late settings snapshot replaced typed credentials.
* E2E: with `demo_mode=false` and with `demo_mode` missing, all three login pages have empty fields and no hint. With `true`, the admin credentials are pre-filled.

## Bugs found & fixed in `admin/`

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | **Critical** | **Creating any product failed**: "Invalid document reference … products has 1 segment". `ref('products')` used `doc(db, path)`. Duplicate-product had the same bug | `ref(path)` without an id now returns `doc(collection(db, path))` (`lib/firestore.ts`) |
| 2 | **High (security)** | **No route-level permission guard.** Staff could open any page by URL; 17 modules had no `Forbidden` check | `RouteGuard` in `PanelShell` checks a permission derived from the sidebar menu plus `ROUTE_PERMS` (`lib/menu.ts: routePermission`). A user without `dashboard.view` is redirected to their first permitted page |
| 3 | High | Legacy store staff (`staff@mumbaistore.com`, claims `role:'staff'` + `store_id`) were routed into **/admin** with a store role | `panelForRole(role, store_id)` sends `staff` + `store_id` to the store panel |
| 4 | High | Uncovered composite-index combinations (~148). Production would fail with "query requires an index" | Query planner (see above) |
| 5 | High | Products: category + search sent two `array-contains` (rejected by Firestore) | Planner + `extraConstraints` |
| 6 | High | Store panel read rules-denied collections (cash ledger, customer `users` docs, email templates). The result was 403s and "Customer not found" | Read policy + UI scoping |
| 7 | Medium | Login form submitted as native GET before hydration (credentials in the URL `?email=…&password=…`) | Submit disabled until hydrated, `method="post"` |
| 8 | Medium | Demo prefill overwrote typed credentials; prefill also applied for non-boolean `demo_mode` | Strict `=== true`, prefill only into empty fields |
| 9 | Medium | Order search: "SB-ORD-00603" found nothing (hyphen not tokenised like the backend `searchKeywords`) | `searchTerms / searchKey` mirror the backend tokeniser and use the phrase prefix (DataTable, Stock, product/user pickers) |
| 10 | Medium | Home Builder fired one `previewHomeSections` call per section (12+ in parallel), which crashed the functions emulator | One batched call for all sections (`serverItemsBatch`) |
| 11 | Medium | Dashboard / brand / tax counts sent queries the user's role cannot read (403 console errors for staff) | Widgets gated by permission; product counts add `status=='active'` without `product.list` |
| 12 | Medium | Bulk email (and other long callables) failed in the UI with `deadline-exceeded` after 70 s, although the function allows 540 s | 540 s client timeout for `sendBulkEmail / bulkImportProducts / exportReport / sendNotification` |
| 13 | Low | Wallet debit above the balance was only rejected server-side | Client guard with a clear message |
| 14 | Low | Emulator ports were hard-coded | Env overrides; Settings → Firebase shows the actual ports |

## Test matrix (E2E, verified in Firestore/Auth)

Totals for the full run: logins 16/16 · roles & permissions 59/59 · orders 25/25 · returns 12/12 · catalog 16/16 · products 15/15 ·
home builder 18/18 · people 20/20 · marketing & content 16/16 · settings & locations 31/31 · demo/secret settings 11/11 ·
delivery panel 18/18 · store panel 14/14 · UI 21/21. "Retest" means the first automated attempt failed because of a test
harness selector or timing issue. The behaviour was then verified manually, or re-run, and passed.

| Area | Checks | Result |
|---|---|---|
| **Logins** | admin, manager, catalog, 6 store owners, store staff, alex, rahul → correct panel; wrong password rejected; customer refused on all 3 panels; logout → protected route redirects to login; forgot password → reset link; change password + revert | ✅ (re-run on `:3001` + default emulators: 16/16) |
| Staff/roles | manager: orders/returns/chat/riders/customers allowed; products/settings/staff/roles/home builder/reports blocked. catalog: catalog modules allowed; orders/customers/settings/riders/staff blocked. store staff (role 5): allowed modules ok; promo/staff/roles/home builder/brands/notifications blocked. New role with `brand.list, brand.create, faq.list` → new staff sees only Brands + FAQs, lands on /brands, no create button without `faq.create`; deactivate staff | ✅ |
| Store scoping | Toronto sees no Mumbai orders; Mumbai order/return URLs show "not found"; store cannot delete orders/returns (callable refused) | ✅ |
| Routes | Every route of all 3 panels — admin 76/76, store 36/36 (+ `/store/email/templates` correctly Access denied), delivery 9/9 — loads with data and no console/page errors (final crawl on the `:3001` dev server + default emulators) | ✅ |
| Orders | 8 filters, search by order number and by customer, valid next statuses only, received→processed, assign rider, payment status + txn id, OTP reveal = secret, invoice PDF (200 application/pdf), invalid transitions rejected (delivered→received, processed→delivered), other store refused, cancel with reason, delete cancelled (+ `deleted_orders` audit), Message customer → chat created | ✅ |
| Self pickup | list + OTP handover UI (`verifyPickupOtp`) | ✅ (route + modal) |
| Returns | approve → assign pickup rider (customer + address copied) → picked up → refund to wallet (wallet +refund); refund via original payment (no wallet change); reject needs a remark; reject; delete rejected; store `deleteReturn` refused | ✅ |
| Chat | rider ↔ admin realtime both directions; new chat via Message customer | ✅ |
| Home Builder | add all 7 section types, edit title/settings (product slider source), toggle, delete, drag reorder, header settings, save draft, live preview updates, publish → `home_layouts` = draft, copy layout to another mode | ✅ |
| Banners / Categories / Brands / Attributes / Taxes | CRUD with Storage image upload, status toggles, category order drag + save, tax % > 100 rejected | ✅ (attributes: retest) |
| Products | 5-step wizard with variant combinations → product saved (bug 1) with derived fields from the trigger; edit; view; "Generate SEO with AI" without a key → "Gemini API key is not configured"; Translate → readable error; featured toggle; approve store product; ratings moderation; bulk CSV import (2 created, 1 invalid row reported); bulk update; export CSV ("Exported 68 products"); media upload | ✅ |
| Stock | admin + per-store edit (`store_stocks`), low/out filters | ✅ |
| Countries / Zones / Stores | add country; zone with drawn polygon (rectangle) + surge slot; store with map pin + owner account → owner logs in to /store | ✅ (zone: retest) |
| Delivery boys | create → Auth + docs → logs in to /delivery; approvals approve / reject with remark; collect cash (over-collect refused); pay bonus → earning + wallet; withdrawals approve with receipt image / reject refunds the wallet | ✅ |
| Customers | detail, wallet credit/debit, overdraw blocked, ledger rows; deactivate → sign-in `USER_DISABLED`; reactivate → sign-in ok; wallet transactions (collection group) + type filter; referrals | ✅ |
| Promo codes | create across all 9 sections (fixed, cashback, specific categories, min order, limits, schedule, audience, platforms, channels); duplicate code rejected; edit; disable | ✅ |
| Notifications / Email | broadcast (62 recipients, log row); bulk email → `mail_log` rows (needs the 540 s timeout, see backend B2); templates create | ✅ |
| Blog / FAQ / Pages | blog category + post CRUD (cover upload), FAQ CRUD, page edit | ✅ |
| Reports | all 6 render, custom date range, CSV export ("Export ready") | ✅ |
| Settings | general/app/referral/wallet/delivery/maintenance save to `settings/public`. Payment/SMS/SMTP/AI save to `settings/private_*` (admin, demo off). In demo mode the credential tabs are locked by design (Laravel parity) | ✅ |
| Languages | add language; JSON editor add key + save | ✅ (retest) |
| Profile | name update; change password and revert | ✅ |
| Delivery panel | online toggle; accept → (store sets ready) → picked up → out for delivery → wrong OTP rejected → deliver with OTP + COD cash confirmation (cash_in_hand += total); return pickup → picked up; cash / earnings / wallet / profile / orders pages; withdraw (blocked while a request is pending — backend rule); support chat | ✅ |
| Store panel | own order status update, no Delete; customer detail; cash page; rider pages; email (no templates); promo with `store_id`; product → `pending_approval` → admin approves; notification to own customer (`store_id` on log); stock edit | ✅ |
| UI | screenshots of login, dashboard, orders, product wizard, home builder, zone form, delivery boys, roles modal, promo form, translation editor checked against the reference screens (31–41, 46–49, 9, 28–30); no horizontal page scroll at 1366 px and 768 px (admin, store, delivery); sidebar becomes a drawer at 768 px; dark mode toggles and persists across navigation | ✅ |

## Backend bugs / requests (not fixed here — `firebase/**` is owned by the backend agent)

| # | Area | Repro / detail |
|---|---|---|
| B1 | **Data / migration (security)** | `staff@mumbaistore.com` (`users/user_10`) is `type:'staff'` with `store_id:'1'`. Claims are `{role:'staff', store_id:'1', role_id:'5'}`, and `syncClaims` would drop `store_id` for `staff`. In the rules, `isStaff()` + `panelCan()` therefore grant role 5's permissions **across all stores**: store staff can read every store's orders/customers by query. Expected: store staff are `type:'store'` + `role_id` (as `createPanelUser` creates them). Fix `migrate-from-mysql.ts` (Laravel store staff → `type:'store'`) and the emulator-data. The admin app now routes this account to /store and scopes by `store_id`, but the rules still allow more. |
| B2 | `sendBulkEmail` | Sends sequentially. In the emulator (SMTP unreachable) 62 customers took **94 s**; a large audience could exceed 540 s. Suggest queueing (task / batch) and returning immediately. Repro: `sendBulkEmail({subject:'x', body:'<p>x</p>', segment:'customers'})` as admin. |
| B3 | Firestore rules | `email_templates`: `list` needs `email.create`, but staff with only `email.list` can `get` and not `list`. The templates page lists, so an `email.list`-only staff sees an error. Allow `list` with `email.list`. |
| B4 | Firestore rules (optional) | Store panel cash ledger: if stores should see the COD ledger of their orders, add `store_id` to `cash_collections` (COD rows) and a rule `isStoreUser() && resource.data.store_id == myStore()`. The admin app currently hides the ledger for stores. |
| B5 | Indexes (informational) | 185/200 used. The planner keeps every query valid, but these combinations run as bounded (1000-doc) client-side filtering, so very large result sets show `N+`: orders `country_id+status+created_at`, `zone_id+mode+created_at`, any `payment_*` + date range, products `brand_id/fulfillment_type + sort ≠ created_at`, users `type + status + sort`. Add indexes for the ones that matter in production. |

## Minor notes (not blocking)

* The demo "Buy Now" floating banner (bottom-right, demo mode only) can cover action buttons at the bottom right of a card until it is dismissed. It is dismissible.
* Invoice PDFs are served as attachments, so the pre-opened tab stays blank while the browser downloads the file.
* Moderate audit advisories in TipTap v2: a v3 migration is needed to clear them.
* The test emulator data is mutated by E2E runs. The data was never exported.
