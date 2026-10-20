# QwikMart — Deployment checklist (project `qwikmart-37299`)

Ordered steps from zero to live for the backend, admin panels, customer website and the two Android apps.
Review date: 2026-10-13. Run commands from Git Bash with Node 22:

```bash
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH"
cd /f/DI_Local_Project/snapbuy
```

---

## 0. Blocking issues (fix before going live)

| # | Issue | Where | Owner |
|---|---|---|---|
| B1 | **Production migration imports the demo accounts with known passwords** (`admin@gmail.com / 123456` = super admin, `mumbai@store.com / Mumbai@1`, `alex@gmail.com / Alex@1234`, `customer@gmail.com / 123456`, every seeded user `123456` / `Store@123`) **and `settings/public.demo_mode = true`** (copied from MySQL, `firebase/tools/migrate-from-mysql.ts:353`). With demo mode on, `/admin/login` **pre-fills working super-admin credentials** (`admin/src/components/shell/LoginPage.tsx:14-16,97`). | migration + data | Ops (you) — step 4.4 below |
| B2 | Delivery app **falls back to fake mock data in production**: `FALLBACK_TO_MOCK` defaults to `true` (`delivery_app/lib/core/config.dart:39`); a network error at sign-in logs the rider into the in-memory demo (`delivery_app/lib/providers/auth_provider.dart:94,101,125`). Workaround now: build with `--dart-define=FALLBACK_TO_MOCK=false` (step 6). Proper fix: default `false`. | delivery_app | Delivery app QA |
| B3 | Delivery app pushes a **fake location (Mumbai 19.1112, 72.8641)** to `delivery_boys/{uid}.location` when location permission is denied/unavailable (`delivery_app/lib/core/location_service.dart:53-54`) → wrong auto-assign + wrong customer tracking. Should refuse to go online without a real fix. | delivery_app | Delivery app QA |
| B4 | Customer app **silently switches to offline demo data** whenever `Firebase.initializeApp` fails (`customer_app/lib/main.dart:18-20`); `AppSettings.demoMode` defaults to `true` when `demo_mode` is absent (`customer_app/lib/models/user.dart:282`, `login_screen.dart:349`). On Android with `google-services.json` init normally succeeds, but a failure would show fake products/orders instead of an error. Gate the fallback to `kDebugMode` and default `demoMode` to `false`. | customer_app | Customer app QA |
| B5 | Demo credentials shown **unconditionally** on production login screens: website `web/src/app/login/page.tsx:179` (text) and `:291-300` ("Use demo credentials" button); delivery app `delivery_app/lib/features/auth/login_screen.dart:164-177` ("Use demo" chip, `config.dart:45-46`). Gate them on `settings/public.demo_mode` / mock mode like the admin panel does. | web, delivery_app | Web QA, Delivery app QA |
| B6 | Website runs **Next.js 14.2.35** (out of support): `npm audit --omit=dev` reports **2 critical** (next — DoS advisories; swiper ≤12.1.1 prototype pollution) + 5 high. Upgrade `next` to a patched 15.5.x/16.x line and `swiper` to a fixed major, then re-test. | web | Web QA |

Fixed in this review (config only): Android release signing via `key.properties`, launcher icons, cleartext HTTP
restricted to debug builds, `web/apphosting.yaml` created (without it the site would build **without Firebase config
and serve mock data**), `.gitignore` files, Node 22 engines, README release/deploy sections.

---

## 1. Repository hygiene (once)

1. The root is not a git repo, and `web/` contains a **nested `.git`** (only the "Initial commit from Create Next App").
   Remove it, then make the root one repository (App Hosting deploys from GitHub):
   ```bash
   rm -rf web/.git
   git init && git add -A && git status   # check: no .env.local, no *-debug.log, no node_modules, no key.properties
   git commit -m "QwikMart initial import"
   git remote add origin git@github.com:<org>/qwikmart.git && git push -u origin main
   ```
   The root `.gitignore` keeps out `.env*` (except `.env.example`), `node_modules`, `.next`, `functions/lib`, `build`,
   `*-debug.log`, keystores, `key.properties`, service-account JSON files.
2. Committed on purpose: Firebase **web** config / Android `google-services.json` (public identifiers, not secrets —
   restrict the API key in step 2.9), `firebase/tools/emulator-data/` (dev-only seed with demo users; it is **never
   deployed** — `firebase deploy` uploads only rules, indexes and `functions/lib`).
3. No private keys, service accounts, `sk_live`/`rzp_live` keys or passwords for real systems were found in the tree;
   `settings/private_*` in the emulator export contain empty values only.

## 2. Firebase console setup (once)

1. **Upgrade to Blaze** (Usage and billing). Then **Budgets & alerts** in Google Cloud Billing: e.g. ₹5,000/month with
   alerts at 50 / 90 / 100 % (Functions, Firestore reads from the 10 s rider location writes, App Hosting, Storage egress).
2. **Firestore**: confirm the default database exists in `asia-south1` (Native mode). Enable **Point-in-time recovery**
   (Firestore → Disaster recovery) and **scheduled backups** (daily, 7-day retention + weekly, 14 weeks):
   ```bash
   gcloud firestore backups schedules create --project=qwikmart-37299 --database='(default)' --recurrence=daily --retention=7d
   gcloud firestore backups schedules create --project=qwikmart-37299 --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=14w
   gcloud firestore databases update --project=qwikmart-37299 --database='(default)' --enable-pitr
   ```
3. **Storage**: default bucket `qwikmart-37299.firebasestorage.app` (create it in Storage → Get started, location `asia-south1`).
4. **Authentication → Sign-in method**: enable Email/Password, Phone, Anonymous.
   - Settings → **SMS region policy**: allow India (+ other selling countries only).
   - Phone test numbers: keep `+91 9876543210 → 123456` **only until launch** (anyone can sign in to that account).
   - Settings → **User actions**: consider enabling email enumeration protection.
   - **Templates**: set the sender name/reply-to and customise the password-reset email; set the action URL domain.
   - Settings → **Authorized domains**: add the App Hosting domains (`*.hosted.app` URLs of both backends) and the
     custom domains (step 5/6). Remove nothing else you still need (`localhost` is for dev).
5. **Android apps** (already registered: `com.qwikmartapp.customer`, `com.qwikmartapp.delivery`): SHA fingerprints come in step 7.
6. **iOS**: **not registered** — the Flutter apps have no iOS Firebase options; iOS is **not deployable** yet.
7. **Cloud Messaging**: (website push, optional) Web Push certificates → generate key pair → put the public key in
   `web/apphosting.yaml` (`NEXT_PUBLIC_FIREBASE_VAPID_KEY`).
8. **App Check** (recommended before launch, see §9): register the Android apps with **Play Integrity** and the web apps
   with **reCAPTCHA Enterprise**; start in *monitor* mode.
9. **API key restriction** (Google Cloud → APIs & Services → Credentials): restrict the Android key to the two package
   names + SHA-1s, and the browser key to your web domains (HTTP referrers). Keep Identity Toolkit, Firestore, Storage,
   FCM, Firebase Installations, App Check APIs allowed.

## 3. Backend: rules, indexes, functions

```bash
cd firebase
npm ci && npm --prefix functions ci
npm --prefix functions test            # 61 tests on the emulators (needs Java)
npx firebase login
npx firebase use qwikmart-37299
# optional warm instances for detectZone/getHome/cartSummary (billed while idle):
#   echo "HOT_MIN_INSTANCES=1" > functions/.env.qwikmart-37299
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project qwikmart-37299
npx firebase deploy --only functions --project qwikmart-37299     # predeploy runs `npm run build` (tsc → lib/)
```

Config verified: `firebase.json` → functions `source: functions`, `runtime: nodejs22`, predeploy build, ignore list
excludes `src`, `test`, `*.log`, tsconfig/vitest files; all functions in `asia-south1` (`setGlobalOptions({region, maxInstances: 20})`, AI callables
`timeoutSeconds: 120`); Firestore location `asia-south1`; emulator block is ignored by deploy. `functions/.env.local`
is emulator-only (not used on deploy). Indexes take several minutes to build — wait until all are **Enabled**
(Firestore → Indexes) before opening the apps.

After the first deploy:
1. IAM → grant the Functions runtime SA `<project-number>-compute@developer.gserviceaccount.com` the role
   **Service Account Token Creator** on itself (signed invoice/export URLs):
   ```bash
   PN=$(gcloud projects describe qwikmart-37299 --format='value(projectNumber)')
   gcloud iam service-accounts add-iam-policy-binding $PN-compute@developer.gserviceaccount.com \
     --member="serviceAccount:$PN-compute@developer.gserviceaccount.com" --role=roles/iam.serviceAccountTokenCreator --project=qwikmart-37299
   ```
2. Functions → check every function is green; Logs Explorer → no deploy errors.

Rollback: `npx firebase deploy --only functions` from the previous git tag (functions), or redeploy the previous
`firestore.rules` / `storage.rules` (Console → Rules → history also allows restoring a previous version).

## 4. Data migration (one time, production)

1. Decide the source: the migration copies **everything** from MySQL `snapbuy` (catalog, users, orders, settings).
   Use the **production** MySQL dump, not the local dev database with seeded demo data.
2. Create a dedicated service account key **only for this run** (IAM → Service accounts → `firebase-adminsdk` → Keys →
   Add key → JSON). Store it **outside the repo**.
3. Dry run, then the real run, then verify:
   ```bash
   cd firebase/tools && npm ci
   export GOOGLE_APPLICATION_CREDENTIALS=/c/secure/qwikmart-migration.json
   export MYSQL_HOST=… MYSQL_USER=… MYSQL_PASSWORD=… MYSQL_DATABASE=snapbuy
   npx tsx migrate-from-mysql.ts --dry-run
   npx tsx migrate-from-mysql.ts --prod --yes-i-mean-production            # --demo-accounts=disable is the prod default
   npx tsx verify-migration.ts   --prod --yes-i-mean-production
   ```
   In `--prod` the migration forces `settings/public.demo_mode = false` and imports every account that still uses a known
   demo password (`123456`, `Mumbai@1`, `Store@123`, `Alex@1234`) **disabled**; it prints the list (`=== Demo accounts … ===`).
   Options: `--demo-accounts=disable` (default) | `reset-passwords` (no password; needs a reset) | `keep` (not recommended).
4. **Immediately after the migration (B1):**
   - Check Admin → Settings → General: Demo Mode is OFF (the migration writes `demo_mode = false` in `--prod`).
   - Review the printed demo-account list. They are disabled (default). To get a first admin login: Firebase Console →
     Authentication → enable **one** admin account, sign in, create your real super-admin with a strong password
     (Admin → Users), sign out, and disable / delete the demo admin again. Re-enable real store/staff accounts only after
     their owners have set new passwords (Console → Authentication → *Reset password*).
   - Admin → Settings → Payment / SMS / SMTP / AI: enter the **live** keys (`settings/private_*` are empty in the dev data).
     Check `settings/public.payment_methods[].mode` = `live` for enabled gateways.
5. **Delete the service-account key** (IAM → Keys → delete) and `unset GOOGLE_APPLICATION_CREDENTIALS`.

Rollback: the migration is re-runnable (full `set()` per document). To undo, restore the PITR/backup taken before the
run (take a manual backup first: `gcloud firestore export gs://<backup-bucket>/pre-migration --project=qwikmart-37299`),
and delete imported Auth users (`npx firebase auth:export` before the run to have a record).

## 5. Admin panels (Firebase App Hosting, app root `admin/`)

1. `admin/apphosting.yaml` already has the `NEXT_PUBLIC_FIREBASE_*` env and `NEXT_PUBLIC_USE_EMULATORS="false"`;
   Node 22 via `engines.node`; no `output: 'export'` (App Hosting Next.js adapter compatible); images `unoptimized`.
2. Create the backend (pick the closest available region to `asia-south1`):
   ```bash
   cd firebase
   npx firebase apphosting:backends:create --project qwikmart-37299
   #   GitHub repo: <org>/qwikmart · app root directory: admin · live branch: main
   ```
3. Push to `main` (automatic rollout) or `npx firebase apphosting:rollouts:create <backend-id> --project qwikmart-37299`.
4. Optional custom domain (App Hosting → Settings → Domains), then add it to **Authorized domains**.
5. Smoke test: `/admin/login` (no prefilled credentials once demo mode is off), dashboard, an order status change.

Rollback: App Hosting → Rollouts → pick the previous rollout → **Roll back**.

## 6. Customer website (Firebase App Hosting, app root `web/`)

1. `web/apphosting.yaml` (created in this review) sets `NEXT_PUBLIC_USE_MOCK=false`, emulators off and the full
   web config. Without it the site silently serves demo data.
2. Fix **B5/B6** first (demo credentials on `/login`, Next.js/swiper upgrade).
3. Create the backend with app root `web`, live branch `main` (same commands as step 5), add the domain to
   **Authorized domains**, set `minInstances: 1` in `web/apphosting.yaml` at launch if cold starts matter.
4. Smoke test: home loads real zones/products (no "DEMO DATA" badge), phone OTP login, place + cancel a COD order.

## 7. Android apps (Google Play)

Requirements verified: compileSdk/targetSdk **36** (Flutter 3.41 defaults) — meets Play's rule that new apps and updates
target API 36 from 31 Aug 2026; minSdk 24; versions `1.0.0+1`; app names "QwikMart" / "QwikMart Delivery"; launcher icons
generated from `docs/brand/logo-icon.svg` (adaptive + round); `google-services.json` contains both
`com.qwikmartapp.customer` and `com.qwikmartapp.delivery`; R8 + Firebase consumer rules (Flutter default).

For **each** app (`customer_app`, `delivery_app`):

1. Upload keystore (once per app, back it up securely):
   ```bash
   keytool -genkey -v -keystore /c/secure/qwikmart-customer-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. `android/key.properties` (git-ignored):
   ```properties
   storePassword=…
   keyPassword=…
   keyAlias=upload
   storeFile=C:/secure/qwikmart-customer-upload.jks
   ```
3. Build:
   ```bash
   cd customer_app && flutter pub get && flutter build appbundle --release
   cd ../delivery_app && flutter pub get && flutter build appbundle --release --dart-define=FALLBACK_TO_MOCK=false
   ```
   Never pass `USE_EMULATORS` / `USE_MOCK` to release builds (both default `false`).
4. Play Console: create the app → enrol in **Play App Signing** → upload the `.aab` to *Internal testing* first.
5. Firebase console → Project settings → each Android app → **Add fingerprint**: SHA-1 + SHA-256 of the upload key
   (`keytool -list -v -keystore … -alias upload`) **and** of the Play app-signing key (Play Console → Test and release →
   App integrity). Download the new `google-services.json` into `android/app/` and rebuild. Needed for phone-auth
   (Play Integrity / SafetyNet replacement) — without it OTP falls back to a reCAPTCHA browser flow.
6. Play Console declarations:
   - **Data safety**: location, phone number, email, name, photos, payment info (via gateways), device IDs (FCM).
   - **Permissions**: location is foreground-only (no `ACCESS_BACKGROUND_LOCATION`, no foreground service) — rider
     tracking stops when the app is backgrounded; if continuous tracking is required add a foreground service
     (`FOREGROUND_SERVICE_LOCATION`) + the Play location declaration and video. Camera (document/review photos),
     POST_NOTIFICATIONS (runtime prompt on Android 13+).
   - Account deletion URL (Play policy): the apps call `deleteAccount`; also publish a web page/URL describing it.
   - Privacy policy URL (`pages/privacy-policy` on the website).
7. Promote Internal → Closed → Production after testing on real devices.

**iOS: not deployable** — no iOS app in Firebase, no `GoogleService-Info.plist`, no APNs key. Requires a Mac:
`flutterfire configure` (add iOS), signing team, push capability, App Store Connect listing.

## 8. Go-live day

1. Firebase phone test number removed or kept only for review accounts; demo mode off; demo passwords rotated (B1).
2. `settings/public.maintenance` off; `app_versions.customer_min/delivery_min` = `1.0.0`.
3. Place a real low-value online payment (each enabled gateway) and refund it.
4. Watch Functions logs / error rate for the first hours.

## 9. Recommended before launch (not blocking)

- **App Check**: functions have `enforceAppCheck: false` (`firebase/functions/src/shared/firebase.ts:69`). Register Play
  Integrity (Android) + reCAPTCHA Enterprise (web), add the App Check SDK to clients (Backend QA / client owners), monitor
  metrics for a week, then enforce for Firestore, Storage and Functions.
- **Monitoring**: Cloud Monitoring alert policies on function error rate (`cloudfunctions.googleapis.com/function/execution_count` status≠ok),
  5xx on App Hosting, Firestore read spikes; enable Crashlytics in both apps (not integrated yet).
- **Functions sizing**: defaults (256 MiB, 60 s) except AI (120 s); consider `memory: '512MiB'` for `getInvoiceUrl`
  (pdfkit) and `exportReport`/`bulkImportProducts` (`timeoutSeconds: 300`); `HOT_MIN_INSTANCES=1` at launch.
- **Cost**: riders write `location` every 10 s → `onDeliveryBoyLocation` invocation per write; watch the bill.
- **Security headers**: neither Next app sets headers. Add at least `X-Frame-Options: DENY` (admin),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS; a CSP must allow
  Razorpay/Stripe/Cashfree scripts, OSM tiles and `firebasestorage.googleapis.com`.
- `web/next.config.mjs` `remotePatterns` allows any host (`**`) — harmless while `images.unoptimized: true`; restrict it
  to `firebasestorage.googleapis.com` / `*.firebasestorage.app` / `placehold.co` if image optimisation is ever enabled.
- Admin `npm audit --omit=dev`: 5 high (postcss via next → upgrade `next` to ≥ 15.5.27; `firebase` → `@grpc/grpc-js`
  advisory, Node-only, not exploitable in the browser bundle) + 27 moderate. Functions / firebase / tools: 0 vulnerabilities.
- Flutter `pub outdated`: no security-relevant items; FlutterFire packages current; riverpod 3 / go_router 18 are
  optional major upgrades.
- Admin and website share one Firebase web app (`…:web:c7bbf751…`); register a second web app for separate analytics /
  App Check keys.
- Debug logging: Flutter `debugPrint` is a no-op cost in release but still prints to logcat (FCM token at
  `customer_app/lib/core/push.dart:58`) — wrap in `kDebugMode`.
- Legacy absolute `http://` image URLs in MySQL (if any) will not load in release apps (cleartext is now debug-only).
- Delete `firebase/firebase-debug.log` (1.7 MB) and other `*-debug.log` files (ignored by git).
