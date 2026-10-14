# QwikMart — Customer App (Flutter)

Customer mobile app for **QwikMart**, the hyperlocal Quick Commerce + eCommerce platform.
Android applicationId: `com.qwikmart.app` (Kotlin namespace `com.qwikmart.app`) · App name: **QwikMart** · Platforms: Android, iOS, Web.

The app follows `../docs/SPEC.md` (design tokens §2, customer app §8) and the reference screenshots in
`../docs/reference`. **Backend: Firebase only** — Auth, Cloud Firestore, Cloud Functions (`asia-south1` callables) and
Cloud Storage, per the binding contract `../docs/FIREBASE_BACKEND.md`. The app makes no REST calls (the Laravel API
client and its base-URL config were removed).

## Quick start

```bash
flutter pub get
flutter run                                     # device / emulator → Firebase project qwikmart-37299
flutter run -d chrome                           # web
flutter run --dart-define=USE_EMULATORS=true    # local Firebase Emulator Suite (see below)
flutter run --dart-define=USE_MOCK=true         # offline demo data, no Firebase calls
```

Demo login (migrated users keep their passwords — they were imported into Firebase Auth with BCRYPT hashes):

| Method | Credentials |
|---|---|
| Email | `customer@gmail.com` / `123456` |
| Phone + OTP | `+91 9876543210`, OTP `123456` — only once this number is a Firebase *test phone number* (mock mode: always) |

Build: `flutter build web` · `flutter build apk --debug` · `flutter build ios` (macOS).

## Configuration

`lib/core/config.dart` (override with `--dart-define`):

| Define | Default | Notes |
|---|---|---|
| `USE_EMULATORS` | `false` | Connect Auth / Firestore / Functions / Storage to the Firebase Emulator Suite. |
| `EMULATOR_HOST` | `10.0.2.2` on Android, `127.0.0.1` on web/desktop | Use your LAN IP for a real device. |
| `AUTH_PORT` / `FIRESTORE_PORT` / `FUNCTIONS_PORT` / `STORAGE_PORT` | `9099` / `8080` / `5001` / `9199` | Emulator ports (`firebase/firebase.json`). |
| `USE_MOCK` | `false` | In-app offline demo data (`lib/data/mock/`). Also used automatically when Firebase cannot start on the platform (e.g. iOS before it is registered). |

Callables always use `FirebaseFunctions.instanceFor(region: 'asia-south1')`. Debug Android builds allow cleartext
HTTP (`android/app/src/debug/AndroidManifest.xml`) so the emulators on `10.0.2.2` are reachable.
Profile → footer shows the backend in use (Firebase / emulators / demo data).

### Firebase emulators with the migrated data

```bash
cd ../firebase
npm --prefix functions run build
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data
cd ../customer_app
flutter run -d chrome --dart-define=USE_EMULATORS=true     # Android emulator: host 10.0.2.2 is the default
# Web + emulators: the persisted Auth session is cleared at start-up (FlutterFire would otherwise restore it against
# the production Auth endpoint before the emulator is connected), so a reload starts a new guest session.
```

## Data layer (Firebase)

`lib/repositories/repositories.dart` defines the contracts (`CatalogRepository`, `CartRepository`, `OrderRepository`,
`AccountRepository`, `ContentRepository`); `lib/repositories/firebase/` implements them with Firestore + callables +
Storage and `lib/repositories/mock/` with the offline demo data. Providers pick one (`AppConfig.useMock`). Errors
surface as `AppException` (`lib/core/errors.dart`, mapped from `FirebaseFunctionsException` / `FirebaseException`
codes). Firestore timestamps and callable `{_seconds}` timestamps are normalised in `firebase/fs_json.dart` / `models/json.dart`.

| Feature | Firebase |
|---|---|
| Settings, countries, zones | `settings/public`, `countries`, `zones` reads; `detectZone` (zone + serving store → session `storeId`) |
| Home | `getHome({zone_id, mode, category_id, lang})` |
| Categories / brands | `categories` / `brands` (`status == active`; tree and quick/eCommerce flags built client-side) |
| Product listing | always `status == active`. Category: `category_ids array-contains`; quick mode without a category: `in_stock_store_ids array-contains zone.default_store_id`; sort = indexed field (`sold_count`, `min_price`, `created_at`, `rating_avg`, `max_discount_percent`). Brand / price / mode filters client-side. Quick-mode prices & stock come from `store_stocks` (store override, same rule as the backend `pricingFor`). |
| Search | `search_keywords array-contains <longest term>` + `sold_count desc`; other terms and the chosen sort applied client-side |
| Product detail | `products where slug ==` + variants (+ `store_stocks/{store}_{variant}`), `reviews` (product, active, newest first), cross/up-sell by id ("Frequently bought together"), similar by category |
| Cart | lines in `users/{uid}/cart/{mode}_{storeId or central}_{variantId}` (`product_id, variant_id, store_id, mode, qty`); prices and the bill always come from `cartSummary`, re-run after every change and when the lines change elsewhere (snapshot listener) |
| Coupons | `listCoupons`; apply = `cartSummary({promo_code})` → `promo` or `promo_error` |
| Checkout | `placeOrder` → COD / wallet done; online gateways open `payment.redirect_url`, then `verifyPayment` |
| Orders | list: `orders where user_id == uid` (+ status) `orderBy created_at desc`; detail + tracking: realtime `onSnapshot` (rider position from `orders/{id}.rider`), OTP from `orders/{id}/secret/otp`; `cancelOrder`, `reorder`, `getInvoiceUrl` |
| Returns / reviews | photos uploaded to Storage `users/{uid}/returns/{orderId}/…` (paths → `requestReturn`) and `users/{uid}/reviews/…` (download URLs → `submitReview`, because reviews are public) |
| Wallet | `users/{uid}.wallet_balance` + `wallet_transactions`; `walletRecharge` → hosted checkout → `verifyWalletRecharge({recharge_id})`; `walletWithdraw` + `withdrawal_requests where user_id ==` |
| Referral | `users/{uid}.referral_code` + `referrals where referrer_id ==` + `settings/public.referral` |
| Addresses / favourites / notifications | `users/{uid}/addresses` CRUD (single default), `users/{uid}/favorites/{productId}`, `users/{uid}/notifications` (mark read = `read_at` only) |
| Support chat | create a `chats` doc (rules-whitelisted fields) + `chats/{id}/messages` docs (`sender_id == uid`); realtime snapshots; `unread_user` reset |
| Content | `blogs`, `blog_categories`, `faqs`, `pages/{slug}` |
| Profile | `users/{uid}` `name` / `avatar` (Storage `users/{uid}/avatar/…`, public) / `fcm_tokens` (arrayUnion); the email can only be set once via `syncProfile`; `deleteAccount` |

Every query is covered by `../firebase/firestore.indexes.json` (this app added `store_stocks (store_id, product_id)`
for the quick-mode price lookup).

## Architecture

```
lib/
  core/          config, firebase (init + emulators + callables), errors, auth_service, theme, router (go_router),
                 l10n (JSON strings, RTL), location helper, push (FCM, optional), utils
  models/        Product, Variant, Category, Brand, HomeData/HomeSection/BannerItem, Cart/CartItem/Coupon,
                 Order/OrderItem/TrackInfo, Address, Zone, AppUser, WalletTxn, Referral, Review, Blog,
                 Faq, ChatThread/ChatMessage, AppNotification … (lenient fromJson)
  repositories/  contracts + firebase/ (Firestore, callables, Storage) + mock/ (offline demo) implementations
  providers/     Riverpod: session (zone/store/mode/locale/theme), auth (guest + sign-in), cart, data providers
  data/mock/     mock_seed.dart (Mumbai grocery catalog, zones, promos, blogs…) + mock_backend.dart
                 (stateful in-memory demo data source: cart, orders with simulated status
                 progression & moving rider, wallet, chat auto-replies, …)
  features/      splash, onboarding, location (+ map pin picker), auth, shell (bottom nav), home
                 (section renderer), categories, search (+ filter/sort sheet), product, cart (checkout,
                 coupons, payment methods, success), orders (list, detail, tracking, review, cancel/return),
                 wallet (+ refer & earn), support chat, notifications, addresses, favourites, profile,
                 content (blog, FAQ, CMS pages)
  widgets/       ProductCard (discount ribbon, ETA, pack size, price+MRP, ADD → stepper), FloatingCartBar,
                 BannerCard, SectionHeader, AppButton, AppImage (emoji fallback), states, HtmlText…
```

State: `flutter_riverpod` · Backend: `cloud_firestore`, `cloud_functions`, `firebase_storage` · Routing: `go_router` (StatefulShellRoute for the 4 tabs; auth-guarded
routes redirect to `/login`) · Auth: `firebase_auth` · Storage: `shared_preferences` (session cache, no token) · Maps: `flutter_map`
+ OSM tiles (no API key) · Location: `geolocator` + `geocoding` (reverse geocoding on mobile only).

### Screens

Splash → Onboarding (3 slides) → Location (current location / map pin → `detectZone`, or choose a city) →
Login (phone + country code + 6-box OTP, or email/password, register) → Main tabs **Home / Categories / Favourites /
Profile** with a floating "N items · ₹X → View cart" bar.

- **Home** — Quick/eCommerce toggle (yellow-green vs peach gradient), "Delivery in 8 minutes · 2.48 km away",
  address, bell (unread badge), search with rotating hint + mic, category tabs that change the header color,
  sections from `getHome`: `banner_slider`, `category_section`, `product_slider`, `top_brands`, `grid_banner`,
  `title_image`, `heading_text`.
- **Categories** (left rail + subcategory grid) · **Category products** (subcategory rail + grid, sort/filter).
- **Search** — recent + trending, live suggestions, results grid, filter sheet (category, price, brands), sort.
- **Product detail** — image pager, variant chips, rating, add-to-cart/stepper, description, ratings breakdown
  + reviews, frequently bought together, similar products, share, favourite.
- **Checkout** — item steppers, free-delivery progress, coupon unlock card + coupons sheet, delivery / self pickup,
  address picker, wallet toggle, bill details, payment method picker, place order.
- **Payment methods**, **Order success**, **Orders** (tabs), **Order detail** (status card, Delivery Verification
  OTP with copy/share, rider card with call, items with Rate/Return, timeline, bill, Cancel with reasons, invoice,
  reorder, Help → chat; realtime), **Live tracking** (store/rider/home markers, realtime rider position).
- **Wallet** (balance, add money, withdraw, history with search/filter) · **Refer & Earn** · **Write review**
  (stars + photos) · **Chat with Support** (realtime) · **Notifications** · **Addresses** (list + map form)
  · **Profile** (avatar upload, language en/ar/hi with RTL, theme system/light/dark, support, blog, FAQ,
  About/Privacy/Terms, logout, delete account) · **Blog** list/detail · **FAQ**.

Mock-mode demo tips: order **#112** is "out for delivery" with a rider moving on the map; **#111** shows the
OTP card `675048`; newly placed Quick orders advance received → preparing → picked up → out for delivery →
delivered over ~4 minutes. Support chat auto-replies after ~3 s.

## Localization

Strings live in `assets/l10n/{en,ar,hi}.json` (keys are identical across files; `{placeholders}` are
substituted). Arabic switches the whole UI to RTL. Use `context.tr('key', {'n': 3})`.
To add a language: add `assets/l10n/<code>.json`, add the locale to `AppLocalizations.supportedLocales`
and `AppLocalizations.languages`.

## Authentication (Firebase)

Code: `lib/core/auth_service.dart` (Firebase calls + error messages), `lib/providers/auth_provider.dart`
(`AuthActions`: sign-in completion / logout / delete, `AuthSync`: guest session + start-up restore),
`lib/features/auth/login_screen.dart`, `lib/firebase_options.dart` (Android + Web; iOS throws `UnsupportedError` until
the iOS app is registered — the app then runs on demo data).

Flow:
- **Guest** — at first launch (and after logout) the app signs in **anonymously**; the guest cart lives in
  `users/{anonUid}/cart`. `syncProfile` is not called for anonymous users, so guests get no profile doc.
- **Phone** — Android/iOS: `verifyPhoneNumber` → OTP → `PhoneAuthProvider.credential` → **`linkWithCredential`** on the
  anonymous user (same uid, cart kept). If the number already has an account (`credential-already-in-use`) the app
  signs in with `e.credential` and calls **`mergeGuestCart({guest_uid})`**. Web: `signInWithPhoneNumber`
  (invisible reCAPTCHA) + `mergeGuestCart` — FlutterFire web does not expose the credential of a failed link, so the
  guest is not linked on web.
- **Email login** — `signInWithEmailAndPassword` (migrated users already exist in Firebase Auth with their BCRYPT
  password hashes; the old `/auth/legacy-login` call is gone), then `mergeGuestCart({guest_uid})`. The email credential
  is intentionally *not* linked on login: linking an unknown email would silently create a new account.
- **Register** — `linkWithCredential(EmailAuthProvider.credential)` on the guest (uid + cart kept) + `updateDisplayName`.
  **Forgot password** — `sendPasswordResetEmail`. **Change password** — `reauthenticateWithCredential` + `updatePassword`.
- After every real sign-in (and on restore at start-up): **`syncProfile({name, email, referral_code, fcm_token, language,
  app:'customer'})`** → profile stored in the session; blocked accounts are signed out. The FCM token is also added to
  `users/{uid}.fcm_tokens` (arrayUnion) whenever FCM issues / refreshes it.
- Logout: remove this device's token from `fcm_tokens` → `signOut()` → a new anonymous guest. Delete account:
  `deleteAccount` callable → `signOut()`.
- **Mock mode** (`USE_MOCK=true`): the login screen uses the in-app demo data only (no Firebase calls); demo OTP `123456`.

### Firebase console checklist (project `qwikmart-37299`)

1. **Authentication → Sign-in method**: enable **Email/Password**, **Phone** and **Anonymous** (guest cart).
2. **SMS region policy** (Authentication → Settings → SMS region policy): allow **India (IN)** (and any other
   countries you serve). While India is blocked, real numbers fail with a "region" error and the app shows
   "SMS verification is not available for this region yet".
3. **Phone numbers for testing** (Sign-in method → Phone): add `+91 9876543210` → code `123456` (demo; no SMS sent).
4. **Android phone auth** needs the signing certificates: Project settings → Your apps → `com.qwikmart.app` →
   *Add fingerprint* for the **debug** and **release/upload** keystores (SHA-1 and SHA-256), plus the Play App Signing
   key when publishing, then download the new `google-services.json` into `android/app/`. Print them with:
   ```bash
   cd android && ./gradlew signingReport
   # or
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
   Debug keystore of the dev machine used for this setup:
   - SHA-1 `BA:10:7F:0F:BA:67:82:BE:40:AE:94:DF:1B:7B:C4:8E:1B:3F:57:C6`
   - SHA-256 `B5:EA:D5:5D:55:61:E3:31:F9:8C:8B:3D:35:8E:6E:30:F8:86:A1:D6:A3:C1:2C:84:C5:8E:1C:0B:8D:BD:EE:4F`

   Without them Android falls back to a browser reCAPTCHA (and Play Integrity fails on release builds).
5. **Authorized domains** (Authentication → Settings): add the domains hosting the Flutter web build
   (`localhost` is allowed by default) — required for web phone sign-in / reCAPTCHA.
6. **iOS** (not registered yet): add an iOS app, put `GoogleService-Info.plist` in `ios/Runner/`, run
   `flutterfire configure` to regenerate `lib/firebase_options.dart`, add the reversed client id URL scheme and
   upload the APNs key (silent push for phone auth).

## Push notifications (FCM — optional)

Firebase is initialised in `main()` (`Fb.init()` via `AuthService.initFirebase()`, never fatal). `PushService.init()`
(`lib/core/push.dart`) enables FCM on Android/iOS only and logs instead of failing.

- **Android**: `android/app/google-services.json` is present; the Google Services Gradle plugin is applied
  automatically when that file exists (see `android/app/build.gradle.kts`).
- **iOS**: enable *Push Notifications* and *Background Modes → Remote notifications* and upload your APNs key.
- **Web** push is not enabled (needs `web/firebase-messaging-sw.js`).
- The FCM token is passed to `syncProfile` and stored in `users/{uid}.fcm_tokens` (arrayUnion; refreshed tokens too);
  logout removes it. Cloud Functions send pushes with the Admin SDK.

Foreground messages are shown with `flutter_local_notifications` (channel `qwikmart_default`).

## Payments

Checkout calls `placeOrder`. COD / wallet complete immediately (`payment == null`). For online gateways the order is
`payment_pending`; the app opens `payment.redirect_url` (hosted checkout) and then calls `verifyPayment`. Native SDK
sheets (Razorpay `gateway_order_id` + `public_key`, Stripe `client_secret`, Paystack) can be plugged into
`_completeGatewayPayment` in `lib/features/cart/cart_screen.dart`. Wallet top-ups use `walletRecharge` → checkout →
`verifyWalletRecharge({recharge_id})`. In mock mode online payments succeed instantly.

## Tests

```bash
flutter analyze
flutter test        # widget smoke test on demo data (every route, LTR/light + RTL/dark) + model parsing tests
```

**Firebase emulator smoke test** — `tool/firebase_smoke_test.dart` is a Flutter web entrypoint that drives the app's
real providers / repositories (real FlutterFire web plugins) against the emulators loaded with the migrated data:
anonymous guest → add to cart → email login `customer@gmail.com` → guest cart merged → cartSummary / coupons → address
add → `placeOrder` COD → realtime order + OTP → cancel (realtime) → orders list → reorder → invoice → wallet + withdrawal
→ favourites → notifications → chat (realtime) → profile + avatar upload → referral → content → logout. It prints
`SMOKE PASS/FAIL …` lines and a final `SMOKE RESULT`, and refuses to run without `USE_EMULATORS=true`.

```bash
cd ../firebase && npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data   # no --export-on-exit
cd ../customer_app
flutter run -d chrome -t tool/firebase_smoke_test.dart --dart-define=USE_EMULATORS=true
# headless: flutter build web -t tool/firebase_smoke_test.dart -o <dir> --dart-define=USE_EMULATORS=true (+ port defines),
# serve <dir>, open it in headless Chrome (e.g. puppeteer) and wait for the "SMOKE RESULT" console line.
```

## Notes / known gaps

- Voice search and chat attachments show "coming soon".
- Reverse geocoding is unavailable on web (coordinates / zone address are shown instead).
- Product/category/banner images fall back to emoji tiles when there is no image (mock data has none).
- On Flutter web, `ui-avatars.com` avatars fail CORS (that service sends a duplicate `Access-Control-Allow-Origin`),
  so the illustrated avatar fallback is shown; mobile builds are unaffected.
- Invoices open the URL from `getInvoiceUrl`; when unavailable an in-app invoice summary (shareable) is shown.
- Product listings fetch one page (up to `perPage`; 100 docs for category/search before client-side filters) — no
  cursor pagination yet.

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
   flutter build appbundle --release
   # → build/app/outputs/bundle/release/app-release.aab
   ```
5. Firebase console → Project settings → `com.qwikmart.app` → add the **SHA-1 and SHA-256** of the upload key
   (`keytool -list -v -keystore ~/qwikmart-upload.jks -alias upload`) **and** of the Play App Signing key
   (Play Console → Setup → App integrity), then download the refreshed `google-services.json` into `android/app/`.
   Required for phone auth / Play Integrity.

Release config: applicationId `com.qwikmart.app`, targetSdk/compileSdk 36 and minSdk from the Flutter SDK (3.41: min 24),
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
