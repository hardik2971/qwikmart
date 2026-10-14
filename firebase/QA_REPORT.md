# QwikMart Firebase backend: QA report

Date: 2026-10-13. Scope: `firebase/functions` (Cloud Functions v2, TypeScript, Node 22), `firestore.rules`, `storage.rules`,
`firestore.indexes.json`, `firebase.json` and the migration in `tools/`. Binding spec: `docs/FIREBASE_BACKEND.md` (the
hardening below is recorded under *Deviations*).

**Verdict: GO for the backend**, once the deploy checklist (§6) is done. I found and fixed every critical and high
vulnerability; each fix has a regression test. The remaining risks (§5) are operational or belong to the client apps.
None of them blocks the backend deploy.

## 1. Build and test status

| Check | Result |
|---|---|
| `npm ci` (clean) | OK. npm reports that the postinstall scripts of `protobufjs` and `@firebase/util` are blocked by `allowScripts`. They are harmless (a version notice and a default-config writer), and Cloud Build runs its own install. |
| `rm -rf lib && npm run build` | OK. `lib/` builds from a clean tree. |
| Lint | No linter configured. `tsc` runs `strict` with `noUnusedLocals` and `noImplicitReturns`. |
| `npm test` (emulators: auth, firestore, functions, storage) | **107 tests in 8 files, all passing.** There were 61 tests before QA; 46 new tests are in `security.test.ts` (26) and `rules-security.test.ts` (20). |
| `firebase.json` | `runtime: nodejs22`; predeploy `npm --prefix "$RESOURCE_DIR" run build`; `ignore` excludes `src`, `test`, tsconfig and the vitest config, so only `lib/` and `package*.json` are uploaded; Firestore location `asia-south1`; every function runs in region `asia-south1` (`setGlobalOptions`, `maxInstances: 20`). |
| `firebase deploy --dry-run` | The predeploy build passed. The run then stopped at `serviceusage` with HTTP 401 because nothing is logged in, so the rest is skipped as instructed. Rules compile: the emulators load them in every test run. |
| `tools`: `npx tsc --noEmit` | OK. The `--prod` guard needs both `GOOGLE_APPLICATION_CREDENTIALS` and `--yes-i-mean-production`, and clears the emulator env vars. |

**Running the tests on a busy machine.** Use `QWIKMART_TEST_CONFIG=firebase.qa-backend.json` (ports 51xxx) with
`VITEST_TEST_TIMEOUT`, `VITEST_HOOK_TIMEOUT` and `CALL_TIMEOUT` raised. `scripts/run-tests.mjs` now reads the ports from
the config file and sets `FUNCTIONS_DISCOVERY_TIMEOUT=120`. On this machine (12 GB RAM, about 80% CPU used by other
agents) the functions source took 27–47 s to load, which is longer than the 10 s discovery default.

## 2. Vulnerabilities found and fixed

| # | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | **Critical** | **Payment replay.** All 8 gateway `verify()` functions preferred client-supplied ids (`razorpay_order_id`, `payment_intent_id`, `reference`, …) over the stored gateway order. A client could settle an expensive order, or top up its wallet any number of times, with one cheap payment that had already succeeded. | `verifyPayment(method, payload, expectedId)` overwrites every gateway id key with the server-stored id and fails closed if there is none. The order stores `gateway_order_id`. | `security`: payment ×2 |
| 2 | **Critical** | **Store users could mint money.** A store owner's claims have no `role_id`, so `requirePanel` gave it every permission: `walletAdjust` on any user (including itself), `processWithdrawal`, `payEarnings`, `approveDeliveryBoy`, `createDeliveryBoy`, `testSmtp`, and `sendBulkEmail` to all users. | Store users are refused on these callables. `collectCash` and `assignDeliveryBoy` are limited to riders in the store's zone. `sendBulkEmail` for stores reaches only that store's customers. | `security`: store ×2 |
| 3 | High | **Store promo codes applied platform-wide.** A store could create a 100%-off code and anyone could use it on any order. Duplicate codes could also hijack a platform code. | Store promos only discount that store's items. Duplicate codes resolve to the cart store's promo, then the platform promo. `listCoupons` hides other stores' promos. | `security`: promo |
| 4 | High | **OTP brute force.** The assigned rider (or a store, through `verifyPickupOtp`) could try all 10⁶ OTPs. OTPs came from `Math.random`. | After 5 wrong attempts the order locks for 15 min (`resource-exhausted`). The counter is kept outside the rolled-back transaction. OTPs and referral codes now use `crypto.randomInt`. | `security`: double deliver |
| 5 | High | **Unbounded refund.** `processReturn.refund_amount` had no cap, so a store or staff member could credit any amount to a wallet. | The refund is capped at `unit_price × qty` of the line, and at the order's `grand_total`. | `security`: processReturn |
| 6 | High | **Cancelling delivered or returned orders.** Store and admin cancels use `force`, so a delivered prepaid order could be refunded again, and a returned one refunded twice. | Delivered and returned orders cannot be cancelled by anyone, even with `force`. | `security`: double cancel |
| 7 | Medium | A store could set `payment_status: paid` on an online order that was never paid; the customer's cancel then refunded it to the wallet. | Store users may change the payment status of COD orders only. | `security` |
| 8 | Medium | Checkout accepted an inactive zone, or a zone whose `fulfillment_type` does not serve the mode. | Both now raise checkout issues. | `security`: business rules |
| 9 | Medium | **Rules.** A store could set `products.in_stock_store_ids`, listing its product in other stores. It could write `store_stocks` with negative stock or price 0. It could read every rider's doc, including bank details. Store staff without an order permission could read the OTP. | The rules now block or scope each of these. | `rules-security` (d), (b) |
| 10 | Medium | **Storage.** Any store user could overwrite or delete any `catalog/**` file, including platform images. Users could upload SVG (scriptable). Store users could overwrite rider documents and withdrawal receipts. | Store users may add new catalog files only. SVG is rejected in user uploads. `delivery_docs` and `withdrawal_receipts` can be written by the owner, admin or staff only. | `rules-security` (i) |
| 11 | Low | `syncProfile` legacy linking could copy a legacy **admin** profile (with no Auth user) to whoever verified the same phone number. | Only `customer` and `delivery_boy` profiles are linked. | `security`: anon/account |
| 12 | Low | Trigger re-delivery would double-count `stats_daily` and counters. `set(merge)` recreated deleted products, stores and users as stub docs. | `onOrderWritten` dedupes by event id (`_trigger_events/*`, functions-only) and skips docs that no longer exist. | full suite |
| 13 | Low | `bulkImportProducts` let a store read any file under `imports/`. | Store users can import only from `imports/{uid}/`. | — |
| 14 | **High** (admin QA B1) | **Store staff were platform staff.** Store staff (e.g. `staff@mumbaistore.com`) were stored as `type:'staff'` with a `store_id`, so their role permissions applied to all stores. | Store staff are now `type:'store'` with claims `{role:'store', store_id, role_id}`, limited by their store role; owners (no `role_id`) keep full store access. Changed: `syncClaims` normalises legacy docs on the next `syncProfile`; `createPanelUser` / `updatePanelUser` map staff with a store to store; the rules no longer give platform permissions to a staff token that carries a `store_id`; the migration converts these users. Store staff cannot manage the owner or grant owner access, and can assign only their own store's roles. | `security` store staff ×2, `rules-security` B1 ×2 |
| 15 | Medium (B3) | Staff with `email.list` could not *list* `email_templates`. | Read (get and list) with `email.list`, `email.create` or store `email.list`; write with `email.create`. | `rules-security` |
| 16 | Feature (B4) | Store panel had no readable `cash_collections`. | `cash_collections.store_id` is set from the order's store (COD), the collecting store, or the rider zone's default store (functions and migration). Stores read their rows; queries must filter `store_id`. 2 indexes added. | `rules-security` |
| 17 | Perf (B2) | `sendBulkEmail` sent serially (62 mails took about 94 s). | It now writes `mail_queue` jobs (50 recipients each) and returns immediately with `{queued, jobs, total, sent:0, failed:0, message}`. `onMailQueued` sends 5 at a time and records `status/sent/failed` on the job; deliveries still go to `mail_log`. | `security` mail queue |
| 18 | **High** (delivery QA) | `registerDeliveryBoy` turned an existing customer or panel account into a rider. | Refused unless the caller has no profile yet or is already a rider (pending or rejected re-registration). | `security` QA batch |
| 19 | Medium | `syncProfile` from the wrong app (`delivery` by a non-rider, `customer` by a rider or panel account) wrote fcm tokens and language before the app refused. | Nothing is written; it returns `wrong_app:true` (claims are still synced from the server). | `security` QA batch |
| 20 | Correctness | `cartSummary` priced delivery from the detected location, while `placeOrder` used the address. | Both use the address when given, otherwise the zone/store default; `delivery_basis` is returned. | `security` QA batch |
| 21 | Correctness | `submitReview` stored raw Storage paths. | Paths resolve to download URLs (a missing object is `invalid-argument`); URLs are kept. | `security` QA batch |
| 22 | Correctness | Search: "lays" did not find "Lay's". | Apostrophes are removed and punctuated tokens are also indexed joined. Applied in functions (products, users, orders) and the migration; data rebuilt. | `unit` |
| 23 | Correctness | `mergeGuestCart` silently returned `{merged:0}` for a bad guest uid. | Returns `not-found` for an unknown uid and `failed-precondition` for a non-anonymous source. | `security` QA batch |
| — | Data | MUMBAI99 promo wording | Checked in MySQL: the title is already "Flat ₹99 off in Mumbai" (fixed ₹99), so nothing changed. | — |

Attacks tested that were already blocked (no change needed):
- Reading another user's orders, addresses, wallet, notifications, chats, returns or withdrawals.
- A rider reading the OTP.
- Writing your own role, type, wallet, counters or claims.
- Writing prices, stock, status, ratings, reviews or promo usage.
- A guest placing an order, withdrawing, reviewing or returning.
- Client price or total tampering: the server re-prices every line.
- Reading `settings/private_*` without the admin role.
- Reading invoices or exports directly.
- Self-approval on `registerDeliveryBoy`.

### Business-logic edge cases covered by tests
- Concurrent orders for the last stock unit: exactly one wins and stock ends at 0.
- `usage_limit_total` holds when two orders apply the promo at the same time; the per-user limit also holds.
- Concurrent wallet withdrawals cannot take the balance below zero.
- A second cancel or a second deliver is refused; the refund, rider commission and COD cash are each recorded once.
- Refunds are capped and complete only once.
- COD maximum, minimum order, closed store, inactive product or variant, inactive zone, mode not served, and an address outside the zone are all refused.
- Surge windows that cross midnight are applied correctly (unit test).
- Quick mode uses the store's stock; eCommerce uses the central stock.
- Order numbers stay unique with 5 orders placed at the same time.
- `stats_daily` is correct after a cancel and after `deleteOrder` (existing tests).

## 3. Indexes

I scanned every query in `admin/src` (including the dynamic filter, sort and search combinations of the `DataTable`
wrapper), `web/src`, `customer_app/lib`, `delivery_app/lib` and `functions/src`.
- The web site, both Flutter apps and the functions already had every index they need.
- **Added 59** composite indexes needed by the admin app: products by category with status or store; taxes by status
  and name; per-user `wallet_transactions`; and search (`search_keywords` CONTAINS) combined with each filter on orders,
  products, returns, blogs, taxes and users.
- **Removed 21 indexes** that no query uses (old chats, banners, categories and promo indexes, and a duplicate users
  index), to stay under the **200 composite-index limit**. The file now has 185 indexes (187 after the 2 cash_collections indexes for B4) and 3 field overrides, and its
  structure checks out (scope, order or arrayConfig, no duplicates, no single-field composites).
- **Not added (admin app risk):** about 148 more combinations, mostly ascending sort toggles on filtered columns and
  order search combined with a date range. These would exceed the limit. In production, those clicks will show a
  "query requires an index" error. The admin app should limit sortable columns while a filter is active, or not combine
  search with date ranges. Details are in the coordinator note below.

## 4. Migration (`tools/`)
- `tsc --noEmit` passes, and the `--prod` guard works as described in §1.
- **New:** with `--prod`, `settings/public.demo_mode` is always written as `false`.
- **New:** `--demo-accounts=keep|disable|reset-passwords` controls accounts whose BCRYPT hash matches a known demo
  password. The production default is `disable`. A dry run found 60 such accounts, including `admin@gmail.com`; the run
  prints `[type] uid email` for each one. Emulator behaviour is unchanged.
- Documented in `tools/README.md` and in `DEPLOYMENT_CHECKLIST.md` step 4.
- I did not need to rebuild the data: no change affects the data shape. `gateway_order_id` is a new optional field.

## 5. Remaining risks
1. **App Check is off.** It is now the `ENFORCE_APP_CHECK` env value (default `false`, set in `functions/.env.qwikmart-37299`; read at load time, so there is no deploy-time param warning).
   Until it is on, any client with the public API key can call the callables. The heaviest abuse cost comes from
   `detectZone`, `getHome` and `cartSummary`. Enable it once the apps send App Check tokens.
2. Admin-app index combinations beyond the 200 limit (§3). There is also a ProductsPage bug: searching while a category
   filter is set sends two `array-contains` clauses, which Firestore rejects.
3. The store panel's `cash_collections` query must filter `where('store_id','==',storeId)`; rows without a `store_id` (written before this change) stay hidden. Store reads of customer `users` docs are still denied by the rules.
4. `onDeliveryBoyLocation` runs a query on every rider location write (about every 10 s per online rider). Watch the
   cost, and consider throttling on the client.
5. The refund amount does not take away the promo discount, and a partial return marks the whole line returned. Both
   match Laravel.
6. Invoices are generated once and cached, so a later status change does not appear in the PDF.
7. Signed URLs for invoices and exports need *Service Account Token Creator* on the runtime service account. Without
   it, the code falls back to download-token URLs.

## 6. Deploy checklist
1. **Blaze plan**, with **budget alerts** (for example ₹2k, ₹5k and ₹10k per month) and a Cloud Billing alert to email.
2. **Auth providers:** Email/Password, Phone, and **Anonymous** (guest cart).
   - Phone: set the SMS region policy to **allow India (+91)** only.
   - Add test phone numbers for review and QA.
   - Add **SHA-1 and SHA-256** fingerprints (debug, release and the Play App Signing key) for both Android apps; add the
     iOS APNs key for FCM.
   - Authorized domains: the App Hosting domains for web and admin.
3. **Secrets:** fill in `settings/private_payment`, `private_sms`, `private_smtp` and `private_ai` from Admin → Settings
   (role admin only). Set `payment_methods[].mode = live` only after testing in sandbox.
4. **Params** in `functions/.env.qwikmart-37299`:
   - `HOT_MIN_INSTANCES=1` is recommended for launch. It costs about one idle instance each for `detectZone`, `getHome`
     and `cartSummary`.
   - `ENFORCE_APP_CHECK=true` once App Check is registered (Play Integrity, DeviceCheck/App Attest, reCAPTCHA Enterprise)
     and the clients send tokens. Run App Check in monitor mode first.
5. **Deploy** with `npx firebase deploy --only functions,firestore,storage --project qwikmart-37299`.
   - If discovery times out on a slow machine, set `FUNCTIONS_DISCOVERY_TIMEOUT=120`.
   - Index builds take minutes. Wait until all of them are `READY` in the console before going live.
6. **Firestore TTL policies:** `_trigger_events.expire_at`. Optionally clean up `mail_queue` (done jobs) the same way.
7. **IAM:** grant the functions runtime service account *Service Account Token Creator* on itself, for signed invoice
   and export URLs.
8. **Migration:** follow `DEPLOYMENT_CHECKLIST.md` §4: `--prod --yes-i-mean-production`, demo accounts disabled by
   default, then create the real super-admin.
9. **After deploy:** run a smoke test. Place a COD order, deliver it with the OTP, check `stats_daily`, and run one
   sandbox payment per enabled gateway, which checks the binding to `gateway_order_id`.
10. **Monitoring:** Cloud Logging alerts on `severity>=ERROR` for functions, and Error Reporting on.

## 7. Files changed
- `functions/src`: `payments/gateways.ts`, `services/{orders,cart,promo,notify,invoice}.ts`,
  `callables/{panel,wallet,cart,account,orders}.ts`, `shared/{util,firebase}.ts`, `triggers/orders.ts`
- `functions/test`: `security.test.ts` (new), `rules-security.test.ts` (new), `helpers.ts`
- `functions`: `scripts/run-tests.mjs`, `vitest.config.mts`, `.env.qwikmart-37299` (new), `.env.local`
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.qa-backend.json` (new; QA ports)
- `tools/migrate-from-mysql.ts`, `tools/lib/common.ts`, `tools/README.md`
- `DEPLOYMENT_CHECKLIST.md` (step 4, migration lines only), `docs/FIREBASE_BACKEND.md` (Deviations)

Both heavy dependencies (`pdfkit`, `nodemailer`) are now loaded on first use, which speeds up cold starts and deploy
discovery. Invoice, export, import and bulk-email functions have more memory and longer timeouts
(512 MiB–1 GiB, 120–540 s).
