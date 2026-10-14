# QwikMart — MySQL → Firebase migration tools

One-time import of the Laravel/MySQL database (`snapbuy`) into Firestore + Firebase Auth + Cloud Storage,
following `docs/FIREBASE_BACKEND.md` §3 (collections) and §7 (migration).

```
firebase/tools/
  migrate-from-mysql.ts   the migration (MySQL is opened READ ONLY)
  verify-migration.ts     counts / spot checks / demo logins
  lib/common.ts           arg parsing, Firebase init (emulator by default), value + keyword helpers
  lib/stats.ts            stats_daily contribution rule (same rule the onOrderWritten trigger should use)
  .emulator/              private emulator config used for testing (auth + firestore + storage only)
  emulator-data/          emulator export of a full migration run (import it, see below)
```

## Setup

```bash
export PATH=/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH                    # Node 22
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"           # Java (emulators)
cd firebase/tools && npm install
```

MySQL connection defaults: `127.0.0.1:3306`, user `root`, no password, db `snapbuy`
(override with `MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE`).

## Start emulators with the migrated data (for other packages)

```bash
cd firebase
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data
#   add --export-on-exit=<dir> if you want to keep your changes (do not overwrite tools/emulator-data by accident)
```

The export contains **auth, firestore and storage** data. Storage download URLs inside documents point to
`http://127.0.0.1:9199/...` (default storage emulator port). Demo logins (email/password) that work in the emulator:

| email | password | role claim |
|---|---|---|
| admin@gmail.com | 123456 | admin |
| mumbai@store.com | Mumbai@1 | store (store_id 1) |
| alex@gmail.com | Alex@1234 | delivery_boy (zone_id 1) |
| customer@gmail.com | 123456 | customer |

(All other seeded users also use their seeder passwords: `123456`, store owners `Store@123`, Mumbai staff `Mumbai@1`.)

## Regenerate `emulator-data/`

```bash
rm -rf emulator-data
STORAGE_PUBLIC_HOST=127.0.0.1:9199 npm run rebuild-data
```

`rebuild-data` uses `emulators:exec` with `.emulator/firebase.test.json` (alternate ports 18080/19099/19199, hub 14400 —
no clash with emulators other packages run on the default ports), runs migrate + verify against a **fresh** emulator,
exports to `emulator-data/` and shuts the emulators down.

## Run the migration

Emulators must be running (any config with auth + firestore + storage; the tool's own:
`npx firebase emulators:start --project qwikmart-37299 --config .emulator/firebase.json`).

```bash
npx tsx migrate-from-mysql.ts                         # everything → emulators (127.0.0.1:8080/9099/9199)
npx tsx migrate-from-mysql.ts --dry-run               # read + map only; prints per-collection counts, writes nothing
npx tsx migrate-from-mysql.ts --only=products,orders  # selected steps only (names below)
npx tsx migrate-from-mysql.ts --skip-storage          # do not upload files; keep relative paths
npx tsx migrate-from-mysql.ts --emulator-passwords=pw1,pw2   # extra plaintext candidates for the emulator login shim
npx tsx verify-migration.ts                           # checks (exit 1 on failure)
```

Non-default emulator ports: set `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`.
`STORAGE_PUBLIC_HOST` (default = storage emulator host) controls the host written into download URLs — set it to
`127.0.0.1:9199` when migrating into emulators on other ports but exporting for default-port use.

Re-runnable: every document is written with a full `set()` through a BulkWriter; accounts that already exist are
deleted and re-imported with the same uid (`importUsers` cannot overwrite) — i.e. a re-run resets those Auth accounts
to the MySQL state; storage objects are overwritten with deterministic download tokens (same URLs every run).

Steps (`--only`): `settings countries zones stores languages translations roles auth users addresses cart favorites
user_notifications wallet_transactions delivery_boys categories brands attributes taxes products store_stocks reviews
banners home_layouts promo_codes orders return_requests withdrawal_requests cash_collections delivery_earnings referrals
chats notifications blogs blog_categories faqs pages email_templates mail_log counters stats_daily`.
Derived values (counters, sold_count, stats) are always computed from the full MySQL data, so `--only` is safe.

### Production (never run casually)

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npx tsx migrate-from-mysql.ts --prod --yes-i-mean-production
npx tsx verify-migration.ts   --prod --yes-i-mean-production   # read-only checks
```

Without **both** `GOOGLE_APPLICATION_CREDENTIALS` and `--yes-i-mean-production`, `--prod` refuses to start.
In production mode the emulator env vars are cleared and download URLs use `firebasestorage.googleapis.com`.
Bucket: `qwikmart-37299.firebasestorage.app` (override `STORAGE_BUCKET`).

## Catalog images (`assets/`)

MySQL only has `placehold.co` tiles. `assets/` holds real artwork that the migration uses instead:

```
assets/
  sources.json        photo picks (Unsplash License): source page + images.unsplash.com URL per key (products / categories / hero)
  build-catalog.ts    builds everything below with sharp (+ opentype.js for text): npx tsx assets/build-catalog.ts [--only=products,banners,...]
  lib/compose.ts      background removal, banner composer, text-to-path helpers
  fonts/              Plus Jakarta Sans TTF (OFL) — banner/brand text is rendered to vector paths
  catalog/            products/<slug>.webp (800², + -thumb 400², -2 alt), categories/<slug>.webp (400²) + -icon (128²),
                      banners/*.webp (1600×600 hero art, 800×400 grid tiles, category banners), blogs/ (1200×630),
                      stores/ (logo 400², banner 1200×400), brands/ (wordmark tiles 400×200, no real logos), promos/ (600×300)
  ui/                 app/web illustrations (admin login, empty states, onboarding, hero fallback) — copied into the apps
  manifest.json       MySQL ids -> files (products incl. variant images, categories, brands, banners, blogs, stores, promo_codes,
                      notifications, home-layout placeholder URL -> art)
  CREDITS.md          every photo -> source page + license
  .raw/               download cache of the source photos (not needed in git; re-downloaded from sources.json)
```

`migrate-from-mysql.ts` uploads each manifest file to Storage at the same path (`catalog/...`, deterministic token) and writes
its download URL; the MySQL value is only the fallback. `--no-catalog-images` disables this. `verify-migration.ts` checks that
no `placehold.co` URL is left where the manifest has a file and that a product thumbnail downloads.

## Mapping decisions

**IDs.** MySQL ids → string doc ids for every collection, except: `users/{uid}`, `delivery_boys/{riderUid}`,
`languages/{code}`, `translations/{code}_{platform}`, `pages/{slug}`, `email_templates/{key}`,
`store_stocks/{storeId}_{variantId}`, `home_layouts/{zoneId}_{mode}_{categoryId|'all'}`, `settings/*`, `counters/*`,
`stats_daily/{scope}_{yyyy-mm-dd}`. All foreign keys are strings; every user reference is a uid; every
`delivery_boy_id` (MySQL `delivery_boys.id`) becomes the rider's uid.

**uid** = `users.firebase_uid` if set, else `user_<mysqlId>`. `users/{uid}.mysql_id` keeps the old id
(useful for `syncProfile` legacy linking).

**Auth.** `importUsers` in batches of ≤1000, `hash: {algorithm: 'BCRYPT'}`, `passwordHash = Buffer(<hash with $2y$→$2a$>)`.
Phone = E.164 from `country_code + phone` (invalid/duplicate phones and duplicate emails are dropped from the Auth
record, logged). `disabled = !status`. Claims `{role: users.type, store_id?, role_id?, zone_id? (approved riders)}`.
Soft-deleted users are skipped (Auth + users doc + their subcollections).
*Emulator caveat:* the Auth emulator cannot verify imported BCRYPT hashes (it only understands its own fake hash
format). In emulator mode only, after the import the tool bcrypt-checks each user's hash locally against known demo
passwords (`123456, Mumbai@1, Store@123, Alex@1234` + `--emulator-passwords`) and re-sets the matching plaintext with
`updateUser`, so logins work locally. Production keeps the real BCRYPT hashes (verified offline by `verify-migration.ts`).

**Production safety (`--prod`).** `settings/public.demo_mode` is always written as `false`. *Demo accounts* = users whose
BCRYPT hash matches a known demo password (`123456, Mumbai@1, Store@123, Alex@1234` + `--emulator-passwords`), e.g.
`admin@gmail.com / 123456`. `--demo-accounts=keep|disable|reset-passwords` decides what happens to them (prod default
**`disable`**: imported with `disabled: true`; `reset-passwords`: imported without a password — sign-in only after a
password reset; `keep`: unchanged, prints a warning). The run prints the affected accounts (`[type] uid email`). Emulator
runs are unchanged (default `keep`). Because the demo super-admin is disabled too, create / enable your real admin as
described in `DEPLOYMENT_CHECKLIST.md` step 4.4.

**Settings.** Laravel `settings` (key/value/group, values cast like `Setting::castValue`) →
`settings/public` (spec fields + extras: `logo_icon, primary_color, currency_*, timezone, company{}, delivery{},
ai_features{}, firebase_web{}`, `app_versions` incl. store URLs, `wallet.enabled/withdraw_enabled`) and
`settings/private_payment|private_sms|private_smtp|private_ai` (all keys of that group, raw).
`firebase_service_account` (group `firebase`) is not migrated (Functions use ADC).
`default_country_id` = `is_default` country; `default_zone_id` = first active zone of it.

**Geography.** zones: `slug` = slugified name, `center` = polygon vertex average, `default_store_id` = first active
store of the zone, `additional_charges[].name` → `{en}`, `refundable` false. stores: `owner_uid` = the `type=store`
user of that store; `orders_count`/`revenue` computed.

**Catalog.** Translatable JSON (spatie) → `{en, ar, hi}` maps; plain strings → `{en}` (banner/promo titles, section
titles). Products: soft-deleted products are skipped; `variants[]` embedded with `attrs` (`{size: 'XL'}`, key = lowercase
English attribute name), `attributes:[{name, values}]` derived from the variants, `category_ids` = ancestors+self of
`category_id` and `sub_category_id`, `brand_name`, `tax_percent`, `min_price` (min effective price over active variants),
`max_discount_percent`, `cross_sell_ids/up_sell_ids` (product_relations), `in_stock_store_ids` (stores with stock>0 of an
active variant), `sold_count` (Σqty of orders not in payment_pending|cancelled|returned), `search_keywords`. Categories also get `ancestor_ids`, `depth`,
`product_count` (active products incl. descendants). Home layouts: section `settings` kept; `banner_ids, category_ids,
product_ids, brand_ids, category_id, parent_id, link_value` converted to strings; images uploaded if relative.

**Orders.** `items[]` embedded (+ `unit_price, tax_percent, category_id, stock_source, return_allowed/return_days/
cancelable, is_reviewed, return_status`, `id` = old order_items.id), `totals{subtotal, savings (=discount + non-cashback
promo_discount), discount, promo_discount, delivery_charge, surge_charge, additional_charges:0, tax_amount, wallet_used,
total (payable), grand_total (= total + wallet_used)}`, `timeline` from `order_status_histories` (`by` = uid),
`customer` + `delivery_boy` snapshots, `rider` location only for active orders, OTP moved to `orders/{id}/secret/otp`.
`counters/orders|returns.value` = highest existing sequence (619 / 125).

**Users subcollections.** addresses (phone → E.164 when possible), cart (only lines of real users; guest-token carts
dropped; lineId `${mode}_${storeId|'central'}_${variantId}`), favorites, `user_notifications` → `notifications`
(type from `data.type` or parent notification, image from parent), `wallet_transactions`.

**Riders.** `delivery_boys/{uid}`: `bank{}`, `location{lat,lng,updated_at}`, `earnings_total` = Σ earnings,
denormalised `name/phone/email/avatar`. Rider documents (`driving_license`, `id_proof`) that are local files are
uploaded to `delivery_docs/{uid}/<file>` and the **storage path** is stored (spec: "storage path"; private bucket area).

**Files.** Absolute URLs (placehold.co, ui-avatars, …) are kept. Relative Laravel paths are read from
`legacy-files/storage/app/public/<path>` (or `legacy-files/public/` for `images/…`; copied from the removed Laravel `backend/`) and uploaded: public/catalog images →
`catalog/<path>`, user-owned files → `users/{uid}/…` (withdrawal receipts → `users/{uid}/withdrawals/`), each with a
`firebaseStorageDownloadTokens` token; the download URL is stored.

**stats_daily** — binding rule of `docs/FIREBASE_BACKEND.md` §8 (= old Laravel dashboard), implemented in
`lib/stats.ts`: bucket = order `created_at` in Asia/Kolkata (day + hour); scopes `all`, `store_{id}`, `zone_{id}`;
`orders` = all orders except `payment_pending`; `revenue` (= `grand_total`), `delivery_charges`, `tax`, `units`,
`by_category{catId:{revenue,units}}`, `by_mode.*.revenue`, `by_hour.*.revenue` count every order whose status is **not**
in `payment_pending | cancelled | returned` (NON_REVENUE_STATUSES); `cancelled`/`returned` = orders currently in those
statuses; `by_status` = count per current status. The same revenue-status rule is used for product `sold_count`,
user `total_spent` and store `revenue`; user/store `orders_count` = orders except `payment_pending`.
`verify-migration.ts` cross-checks the totals and the per-day / per-hour / per-mode buckets against
DashboardService-style SQL (`SUM(total + wallet_used) … WHERE status NOT IN (…)`).

Also migrated: `email_logs` → `mail_log/{id}`, notifications `sent_count` (= number of user notifications).
Not migrated: `sessions, cache, jobs, personal_access_tokens, password_reset_tokens, otps, migrations`.
