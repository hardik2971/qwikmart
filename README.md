# QwikMart — Hyperlocal Quick Commerce & eCommerce

Multi-store Quick Commerce + eCommerce platform on a **Firebase-only backend** (project `qwikmart-37299`):
Super Admin / Store / Delivery-boy panels, customer website, customer app and delivery boy app.

| Folder | Stack | What |
|---|---|---|
| `firebase/` | Cloud Functions (TypeScript, Node 22, `asia-south1`) · Firestore · Storage rules | Backend: callables + triggers, security rules, indexes, emulator config |
| `firebase/tools/` | TypeScript | One-time MySQL → Firestore + Auth migration, verifier, emulator seed data |
| `admin/` | Next.js 15 · Tailwind · Firebase SDK | Admin (`/admin`), Store (`/store`), Delivery boy (`/delivery`) panels |
| `web/` | Next.js 14 · Tailwind · Firebase SDK | Customer website |
| `customer_app/` | Flutter · FlutterFire | Customer app (Android `com.qwikmartapp.customer`) |
| `delivery_app/` | Flutter · FlutterFire | Delivery boy app (Android `com.qwikmartapp.delivery`) |
| `docs/` | — | `FIREBASE_BACKEND.md` (binding backend spec), `SPEC.md` (product/UI spec, design tokens), reference screenshots, brand assets |

Firebase services: Auth (phone OTP, email/password, anonymous guests), Cloud Firestore, Cloud Functions,
Cloud Storage, Cloud Messaging, App Hosting. Integrations run inside Functions: Gemini AI, SMTP email, SMS
gateways (Twilio, MSG91, Fast2SMS, 2Factor), payments (Stripe, PayPal, Razorpay, Cashfree, PhonePe, PayTabs,
Midtrans, Paystack, Wallet, COD). Secrets live in `settings/private_*` (admin-only), edited in Admin → Settings.

## Run locally (emulators)

```bash
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH"

# 1. Backend: build functions, start emulators with the migrated data
cd firebase && npm install && (cd functions && npm install && npm run build)
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data   # UI: http://127.0.0.1:4000

# 2. Admin panels
cd ../admin && npm install && NEXT_PUBLIC_USE_EMULATORS=true npm run dev

# 3. Website
cd ../web && npm install && NEXT_PUBLIC_USE_EMULATORS=true npm run dev

# 4. Apps (Android emulator reaches the host at 10.0.2.2)
cd ../customer_app && flutter run --dart-define=USE_EMULATORS=true
cd ../delivery_app && flutter run --dart-define=USE_EMULATORS=true
```

Tests: `cd firebase/functions && npm test` (61 tests on the emulators) ·
`cd delivery_app && dart run tool/firebase_smoke_test.dart` (rider flow, 59 checks) ·
`customer_app/tool/firebase_smoke_test.dart` (customer flow, see its README).

## Deploy (first time)

1. Firebase console: upgrade to **Blaze**; Authentication → enable Email/Password, Phone, Anonymous;
   SMS region policy → allow India; test number +91 9876543210 → 123456; add Android SHA-1/SHA-256.
2. `cd firebase && npx firebase login && npx firebase deploy --only functions,firestore,storage`
3. Import the data once: `cd firebase/tools && GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> npx tsx migrate-from-mysql.ts --prod --yes-i-mean-production`
4. Admin + website on Firebase App Hosting (see `admin/README.md`, `web/README.md`); apps via the stores.

## Demo credentials

| Panel / app | Email | Password |
|---|---|---|
| Super Admin `/admin/login` | admin@gmail.com | 123456 |
| Store `/store/login` | mumbai@store.com | Mumbai@1 |
| Delivery boy (panel + app) | alex@gmail.com | Alex@1234 |
| Customer (app + website) | customer@gmail.com · or phone +91 9876543210 | 123456 · OTP 123456 |
