# QwikMart — Firebase backend

Firestore + Auth + Cloud Functions (v2, TypeScript, Node 22) + Storage. This replaces the Laravel REST API / MySQL.
The binding contract (collections, claims, callables, triggers, rules) is [`docs/FIREBASE_BACKEND.md`](../docs/FIREBASE_BACKEND.md).

```
firebase/
  firebase.json            emulators (auth 9099, firestore 8080, functions 5001, storage 9199, UI 4000), singleProjectMode
  firebase.test.json       same project on alternate ports (19099/18080/15001/19199) — used by `npm test`
  firestore.rules          §6 rules (field whitelists, permission checks via roles/{role_id}, store scoping)
  firestore.indexes.json   composite indexes for function + client queries
  storage.rules
  functions/
    src/index.ts           exports every callable + trigger
    src/shared/            types.ts (shared contracts), util (money, haversine, point-in-polygon, keywords, i18n, IST time),
                           status (Order::TRANSITIONS etc.), permissions (Role::MODULES), access (panel checks), firebase (admin init, errors, callable wrapper, settings, counters)
    src/services/          cart pricing, promo, zones, wallet ledger, orders lifecycle, notify (FCM/SMTP/SMS), invoice (pdfkit), home, gemini
    src/payments/          Stripe, Razorpay, Paystack, PayPal, Cashfree, PhonePe, PayTabs, Midtrans (+ COD / wallet handled natively)
    src/callables/         account, location, cart, orders, wallet, delivery, panel, ai
    src/triggers/          orders (stats_daily, counters, notifications, delivered side-effects), catalog, engagement
    test/                  vitest suites run against the emulators
  tools/                   MySQL → Firestore migration + seed (separate package)
```

## Prerequisites

- Node 22 (`export PATH=/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH`)
- Java 11+ for the Firestore/Storage emulators (`export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"`)
- `npm install` in `firebase/` (firebase-tools) and in `firebase/functions/`

## Run locally (Emulator Suite)

```bash
cd firebase
npm --prefix functions run build
npx firebase emulators:start --project qwikmart-37299                               # empty data
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data  # migrated MySQL data
```

UI: http://127.0.0.1:4000. Clients connect with `connectAuthEmulator(…9099)`, `connectFirestoreEmulator(…8080)`,
`connectFunctionsEmulator(…5001)` and `getFunctions(app, 'asia-south1')`. Run `npm --prefix functions run build:watch`
in a second terminal — the Functions emulator reloads on rebuild.

## Tests

```bash
cd firebase/functions
npm run build
npm test        # builds, then `firebase emulators:exec --config firebase.test.json …` + vitest
```

The suite uses its own ports (firebase.test.json) so it can run while a dev emulator is up. It seeds its own fixtures
(unique ids per run) and covers: security rules (public vs. owner vs. rider vs. store vs. staff), cart pricing
(per-km delivery, free delivery, surge by IST time, promo percent/fixed/free_delivery/cashback, wallet), placeOrder
(stock, wallet, promo usage, OTP, sequence), cancel refunds/restock, rider accept → pickup → out for delivery → OTP deliver
(COD cash + commission), returns & refunds, stats_daily, chat trigger, detectZone, getHome, panel permissions, Gemini errors,
and (`gaps.test.ts`, `rules-panel.test.ts`) updatePaymentStatus, deleteOrder (stats correction), deleteReturn, startChat,
updateWithdrawal, refund_method, return pickup snapshot, cash_collected, rider invoice access, rider auto-assign,
home layout drafts/publish, store-scoped notifications/chats, guest → real account upgrade, SMTP key fallback, and the
rules for wallet_transactions collection-group reads, admin-only private settings, drafts and store scoping.

Smoke test against the migrated data (places and cancels one COD order as customer@gmail.com and checks stats_daily):

```bash
cd firebase
AUTH_PORT=19099 FUNCTIONS_PORT=15001 npx firebase emulators:exec --config firebase.test.json --project qwikmart-37299 \
  --only auth,firestore,functions,storage --import tools/emulator-data "node functions/scripts/smoke-imported.mjs"
```

## Deploy

Requires the **Blaze (pay-as-you-go) plan** (Cloud Functions, outbound network calls to payment gateways / Gemini / SMTP).

```bash
cd firebase
npx firebase login
npx firebase deploy --only functions,firestore,storage --project qwikmart-37299
```

- Region: every function runs in **asia-south1** (Firestore DB location `asia-south1`). Clients must call
  `getFunctions(app, 'asia-south1')`.
- After the first deploy, grant the Functions runtime service account (`<project-number>-compute@developer.gserviceaccount.com`)
  the **Service Account Token Creator** role on itself so `getSignedUrl()` works for invoices/exports
  (otherwise the functions fall back to Firebase download-token URLs).
- Firestore composite indexes deploy with `--only firestore` (can take a few minutes to build).

## Secrets & configuration (Firestore)

`settings/private_*` are readable/writable by **role `admin` only** (the admin System Settings page edits them directly);
staff, stores and app clients are denied, functions read them with the Admin SDK. The key names below are canonical — the
admin Settings page, the functions and the MySQL migration all use them (functions still accept the Laravel names as a fallback).

| Doc | Keys |
|---|---|
| `settings/public` | see spec §3 (`payment_methods[{key, enabled, mode, public_key}]` turns gateways on, `cod{enabled,max_amount}`, `wallet{min_recharge,max_recharge,min_withdraw}`, `referral{…}`, `tax_inclusive`, `delivery{auto_assign}` (rider auto-assign on placement), optional `currency_code`/`currency_symbol`) |
| `settings/private_payment` | `stripe_key, stripe_secret` · `razorpay_key, razorpay_secret` · `paystack_public_key, paystack_secret_key` · `paypal_client_id, paypal_secret` · `cashfree_app_id, cashfree_secret` · `phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index` · `paytabs_profile_id, paytabs_server_key, paytabs_region` · `midtrans_server_key, midtrans_client_key` (+ `{gateway}_enabled`, `{gateway}_mode`) |
| `settings/private_smtp` | `host, port, username, password, encryption ('tls'/'ssl'/'none'), secure, from_email, from_name` — fallbacks `mail_host, mail_port, mail_username, mail_password, mail_encryption, mail_from_address, mail_from_name`, `from_address` |
| `settings/private_sms` | `gateway` (`twilio`/`msg91`/`fast2sms`/`2factor`/`firebase`/`log`; fallback `sms_gateway`), `twilio_sid, twilio_token, twilio_from`, `msg91_auth_key, msg91_template_id, msg91_sender`, `fast2sms_key`, `twofactor_key, twofactor_template` |
| `settings/private_ai` | `gemini_api_key`, `gemini_model` (default `gemini-2.5-flash`) |

### Cold starts

`detectZone`, `getHome` and `cartSummary` read `minInstances` from the `HOT_MIN_INSTANCES` parameter (default `0`, i.e. no
idle cost). To keep warm instances in production put `HOT_MIN_INSTANCES=1` in `functions/.env.qwikmart-37299` (or answer
the prompt on deploy). Billing applies to idle instances.

A gateway is usable when its `settings/public.payment_methods` entry is `enabled` **and** its required private keys exist.
FCM uses the Admin SDK (no key needed); in the emulator pushes are skipped unless `FCM_IN_EMULATOR=1`.
