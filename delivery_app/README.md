# QwikMart Delivery (Flutter)

Delivery partner app for QwikMart (`com.qwikmart.delivery`, label **QwikMart Delivery**).
Follows `docs/SPEC.md` §2 (design tokens) and §9, plus reference screens 28–30.

**Backend: Firebase only** – Firebase Auth, Cloud Firestore, Cloud Functions (`asia-south1`) and Cloud Storage
of project `qwikmart-37299`. There are no REST calls; the contract is
[`docs/FIREBASE_BACKEND.md`](../docs/FIREBASE_BACKEND.md) (incl. its *Deviations* section).

## Run

```bash
cd delivery_app
flutter pub get
flutter run                 # emulator / device → Firebase project qwikmart-37299
flutter run -d chrome       # web
```

Demo login: **alex@gmail.com / Alex@1234** (the login screen offers a "Use demo account" chip only when `settings/public.demo_mode` is true, or in the offline demo).
In the offline demo the delivery OTP is **123456**; with Firebase the customer reads it from their app
(`orders/{id}/secret/otp`, never readable by riders).

Builds:

```bash
flutter analyze
flutter build web
flutter build apk --debug
```

## Configuration (`lib/core/config.dart`, all `--dart-define`)

| Define | Default | Meaning |
|---|---|---|
| `USE_EMULATORS` | `false` | Use the local Firebase Emulator Suite (Auth, Firestore, Functions, Storage) |
| `EMULATOR_HOST` | `10.0.2.2` on Android, `127.0.0.1` on web/desktop | Host running the emulators (use the LAN IP for a real device) |
| `AUTH_EMULATOR_PORT` / `FIRESTORE_EMULATOR_PORT` / `FUNCTIONS_EMULATOR_PORT` / `STORAGE_EMULATOR_PORT` | `9099` / `8080` / `5001` / `9199` | Emulator ports |
| `USE_MOCK` | `false` | Serve everything from the in-memory mock backend (`lib/data/mock`) – fully offline, Firebase is never touched |
| `FALLBACK_TO_MOCK` | `false` | Development only: when Firebase cannot be initialised or is unreachable at sign-in, use the offline demo. Never enable in production builds |

Local development against the emulators with the migrated MySQL data (see `firebase/README.md`):

```bash
cd firebase && npm --prefix functions run build
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data

cd delivery_app
flutter run --dart-define=USE_EMULATORS=true                                  # Android emulator → 10.0.2.2
flutter run -d chrome --dart-define=USE_EMULATORS=true                        # web → 127.0.0.1
flutter run --dart-define=USE_EMULATORS=true --dart-define=EMULATOR_HOST=192.168.1.20   # real device on the LAN
flutter run --dart-define=USE_MOCK=true                                       # offline demo
```

A small "Demo mode · showing sample data" banner appears whenever mock data is in use. In mock mode, going
online makes a simulated "new order" push arrive about 12 s later.

## Architecture

```
lib/
  core/          config (Firebase / emulator defines), theme, auth_service (FirebaseInit + emulator wiring,
                 FirebaseAuthService), app_exception (Firebase/HttpsError → user message), streams (combineLatest),
                 router (go_router + auth redirects), l10n (en / ar (RTL) / hi), storage, push_service (FCM),
                 location_service, launcher
  models/        DeliveryOrder, OrderItem, Store, Customer, TimelineEntry, Earning, CashCollection,
                 WalletTxn, Withdrawal, ReturnPickup, ChatMessage, AppNotification, DeliveryProfile… (String ids)
  data/          DeliveryDataSource contract, firebase/ (Firestore + callables + Storage), mock/ (stateful demo backend)
  repositories/  DeliveryRepository – Firebase, or the mock backend in the offline demo
  providers/     Riverpod: auth (realtime profile), online/location tracking, StreamProviders for all data
  widgets/       shared UI
  features/      splash, auth (login / forgot / register stepper / pending), home, orders
                 (guided workflow, OTP sheet, delivered, invoice, history), returns, cash,
                 earnings, wallet, chat, notifications, profile, shell (bottom nav)
```

### Firebase mapping (`lib/data/firebase/firebase_data_source.dart`)

| Feature | Firebase |
|---|---|
| Session (login / app start) | `signInWithEmailAndPassword` → callable `syncProfile({app:'delivery', fcm_token, language})` → `getIdToken(true)` (claims `role`, `zone_id`) → `delivery_boys/{uid}`: missing = "Register now" dialog, `pending` = Pending Approval screen, `rejected` = signed out with the admin remark, `blocked` / inactive / panel account = signed out with a message |
| Register | `createUserWithEmailAndPassword` → documents uploaded to Storage `delivery_docs/{uid}/driving_license_*.ext`, `id_proof_*.ext` → callable `registerDeliveryBoy({name, phone, dob, country_id, zone_id, address, vehicle_type, vehicle_number, driving_license, id_proof, bank})` → `getIdToken(true)` → Pending Approval. Countries / zones are read from the public `countries` / `zones` collections |
| Profile | realtime `users/{uid}` + `delivery_boys/{uid}` (approval, online flag, cash in hand…); edit = `users/{uid}.name` (the only rider-writable profile field; vehicle / address / bank are managed in the admin panel) |
| Online / location | callable `setOnline({is_online})`; while online `delivery_boys/{uid}.location = {lat, lng, updated_at: serverTimestamp}` every 10 s (the only field the rules let the rider write) |
| Dashboard | realtime: today's `delivery_earnings` (`created_at >= today`), delivered orders today, `cash_in_hand` / `rating_avg` / `is_online` from `delivery_boys/{uid}`, active + available counts |
| Orders | realtime queries – Available: `zone_id == claim.zone_id && delivery_boy_id == null && status in [received, processed, ready_for_pickup]` (self-pickup orders and orders this rider rejected – `rejected_by` – are hidden); Active: `delivery_boy_id == uid && status in [received…out_for_delivery]`; History: `delivery_boy_id == uid && status in [delivered, cancelled, returned] orderBy updated_at desc`. Detail: realtime `orders/{id}` (+ `stores/{store_id}`) |
| Workflow | callables `acceptOrder`, `rejectOrder`, `updateDeliveryStatus({status: picked_up \| out_for_delivery})`, `deliverOrder({order_id, otp, cash_collected})` → Delivered screen (commission + COD cash are written by the functions) |
| Invoice | in-app invoice from the order doc; "Open PDF" → callable `getInvoiceUrl({order_id})` |
| Returns | `return_requests where delivery_boy_id == uid && status in [pickup_assigned, picked_up, refund_completed]`; callable `returnPickedUp({return_id})` |
| Earnings / cash | `delivery_earnings` / `cash_collections where delivery_boy_id == uid orderBy created_at desc`; totals from `delivery_boys/{uid}` (`earnings_total`, `cash_in_hand`) |
| Wallet | `users/{uid}.wallet_balance` + `users/{uid}/wallet_transactions` + `withdrawal_requests where user_id == uid`; callable `walletWithdraw({amount, message})` |
| Support chat | `chats where user_uid == uid`; a new thread is created on the first message (`chats` doc with the whitelisted fields, then `chats/{id}/messages` with `sender_id == uid`); messages are a realtime query `user_uid == uid orderBy created_at` |
| Notifications | realtime `users/{uid}/notifications orderBy created_at desc`; "mark all read" updates `read_at` only |
| Push | FCM token → `syncProfile({fcm_token})` and `users/{uid}.fcm_tokens` (arrayUnion on refresh, arrayRemove on logout) |

All composite indexes used by these queries are in `firebase/firestore.indexes.json`.

Workflow on the order screen: **Accept Order → Mark as Picked Up → Out for Delivery → Deliver Order**.
The last step opens a 6-box OTP sheet; COD orders also need the rider to confirm "I have collected ₹X".

## Authentication – Firebase Authentication (email/password)

| Flow | What the app does |
|---|---|
| Login | see *Session* above. Riders imported from MySQL keep their password (BCRYPT hashes imported into Firebase Auth), so there is no separate legacy flow |
| Register | the stepper creates the Firebase account on Submit; if the upload / callable fails the Firebase user stays signed in and Submit can be retried; leaving the stepper offers to discard the registration, which deletes the Firebase account created for it |
| Forgot password | `sendPasswordResetEmail` |
| Change password | Profile → Change Password: re-authenticate, then `updatePassword` |
| Pending approval | "Check status" re-runs `syncProfile`; the profile is also realtime – when the admin approves, the ID token is refreshed (new `zone_id` claim) and the app opens Home |
| Logout | `setOnline(false)`, FCM token removed from `users/{uid}.fcm_tokens`, `signOut()` |

`Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` runs before `runApp` and never crashes
startup: iOS is not registered yet, so there the login falls back to the offline demo (with
`FALLBACK_TO_MOCK=true`) or reports "Sign-in is not available".

**Firebase console setup**: enable Authentication → Email/Password; add custom web domains under
Authentication → Settings → Authorized domains. To support iOS add an iOS app, put `GoogleService-Info.plist` in
`ios/Runner/` and re-run `flutterfire configure`.

## Firebase push notifications (FCM)

FCM on Android uses `android/app/google-services.json`. Web push is not set up (needs a VAPID key and
`firebase-messaging-sw.js`). Functions send pushes to zone riders for new orders and to the assigned rider
(skipped in the emulator). A push with `order_id` shows a local notification; tapping it opens the order.
Lists are realtime, so no refresh is needed.

## Platform notes

- Android: location (incl. `FOREGROUND_SERVICE_LOCATION` – while online the position is streamed through the geolocator foreground service with a persistent notification), notification and camera permissions are declared. Cleartext HTTP is allowed in debug builds only (emulators). Core library desugaring is enabled for `flutter_local_notifications`.
- Going online requires location permission; without it the rider stays offline with an explanation (no position is ever invented). Emulator builds on the web start signed out (persisted Auth state is wiped before `Firebase.initializeApp`, so nothing is validated against production) and never register for FCM.
- iOS: location, camera and photo usage strings, `LSApplicationQueriesSchemes` (tel/https) and background modes are in `Info.plist`.
- Maps use OpenStreetMap tiles through `flutter_map` (no API key). "Get Directions" opens Google Maps.

## Firebase smoke test

`tool/firebase_smoke_test.dart` runs the rider flow against the Emulator Suite with the migrated data, talking
to the emulators the way the FlutterFire SDKs do (Identity Toolkit sign-in, Firestore `runQuery` / `commit`
with the user's ID token so the security rules apply, the callable protocol) and replaying the app's queries:
alex login → `syncProfile` → claims → online → location write (and a denied `cash_in_hand` write) → FCM token →
customer@gmail.com places a COD order → it appears in Available → accept → picked_up → out_for_delivery →
wrong OTP rejected → rider denied on `orders/{id}/secret/otp`, customer reads the OTP → delivered with COD
cash + `cash_in_hand` → `delivery_earnings/commission_{id}` + wallet credit → dashboard / history / returns
queries → `walletWithdraw` + `withdrawal_requests` → notifications (read_at only) → support chat (+ trigger
summary, no admin spoofing) → reject flow (`rejected_by`) → registration of a new rider (Storage upload,
`registerDeliveryBoy` → pending, cannot go online).

```bash
cd firebase && npm --prefix functions run build
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data
cd ../delivery_app && dart run tool/firebase_smoke_test.dart
# other ports: AUTH_PORT=39099 FIRESTORE_PORT=38080 FUNCTIONS_PORT=35001 STORAGE_PORT=39199 dart run tool/firebase_smoke_test.dart
```

It mutates emulator data only; never point it at production.

## Release build (Google Play)

Android only — iOS is **not registered** in Firebase yet (no `GoogleService-Info.plist`, `firebase_options.dart` has no iOS
options), so the app cannot ship to the App Store until the iOS app is added (`flutterfire configure`) and tested.

1. Create the upload keystore once and keep it (and its passwords) **outside git** (backed up — losing it blocks updates):
   ```bash
   keytool -genkey -v -keystore ~/qwikmart-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Create `android/key.properties` (git-ignored):
   ```properties
   storePassword=<store password>
   keyPassword=<key password>
   keyAlias=upload
   storeFile=C:/Users/<you>/qwikmart-upload.jks
   ```
   `android/app/build.gradle.kts` signs release builds with it (without the file it falls back to the debug key — Play rejects that).
3. Bump `version:` in `pubspec.yaml` (`1.0.0+1` → name `1.0.0`, versionCode `1`; the code must increase on every upload).
4. Build the bundle (production = real Firebase, no emulators, no mock):
   ```bash
   flutter build appbundle --release --dart-define=FALLBACK_TO_MOCK=false
   # → build/app/outputs/bundle/release/app-release.aab
   ```
5. Firebase console → Project settings → `com.qwikmart.delivery` → add the **SHA-1 and SHA-256** of the upload key
   (`keytool -list -v -keystore ~/qwikmart-upload.jks -alias upload`) **and** of the Play App Signing key
   (Play Console → Setup → App integrity), then download the refreshed `google-services.json` into `android/app/`.
   Required for phone auth / Play Integrity.

Release config: applicationId `com.qwikmart.delivery`, targetSdk/compileSdk 36 and minSdk from the Flutter SDK (3.41: min 24),
R8 shrinking is Flutter's default for release (Firebase libraries ship their own consumer ProGuard rules),
cleartext HTTP is allowed in **debug builds only** (`src/debug/AndroidManifest.xml`, for the emulators),
launcher icons are generated from `docs/brand/logo-icon.svg` (adaptive icon: `res/mipmap-anydpi-v26`, background `#0E9623`).

## App icon & splash screen

Source art lives in `assets/icon/` and is generated from the brand mark by
`firebase/tools/assets/build-app-icons.ts` (`cd firebase/tools && npx tsx assets/build-app-icons.ts`).

| File | Use |
|---|---|
| `assets/icon/play_store_512.png` | Google Play listing icon (512×512, 32-bit PNG) |
| `assets/icon/app_icon.png` | Launcher icon source (Android legacy, iOS, web) |
| `assets/icon/app_icon_foreground.png` / `app_icon_monochrome.png` | Android adaptive + themed (Android 13) icon layers, background `#0E9623` |
| `assets/icon/app_icon_round.png` | Legacy round icon (`mipmap-*/ic_launcher_round.png`) |
| `assets/icon/splash_*.png` | Native splash (logo tile, Android 12 icon, bottom wordmark) |

After changing the art: `dart run flutter_launcher_icons` and `dart run flutter_native_splash:create`
(configs: `flutter_launcher_icons.yaml`, `flutter_native_splash.yaml`), then copy
`mipmap-anydpi-v26/ic_launcher.xml` over `ic_launcher_round.xml` and resize `app_icon_round.png` into the
`mipmap-*/ic_launcher_round.png` files (48/72/96/144/192 px).
