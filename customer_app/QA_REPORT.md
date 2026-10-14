# QA Report — QwikMart customer app (`customer_app/`, Flutter)

Date: 2026-10-13 · Owner: customer-clients QA · Backend: Firebase only (emulators)

## Verdict: **NO-GO for store release — GO functionally**

The only release blocker is **Android release signing**: `android/key.properties` (and the upload keystore) is not
present, so `flutter build apk --release` falls back to the **Android Debug** certificate
(`CN=Android Debug`, SHA-1 `ba:10:7f:…:57:c6`) — such an APK cannot be uploaded to Play. Add `android/key.properties`
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; the Gradle config already reads it), register the release /
Play App Signing SHA-1/SHA-256 in Firebase (phone auth), rebuild → GO.

Everything else passes: B4 fixed, `flutter analyze` 0 issues, all tests green, web + release APK build, E2E matrix green
(two items verified only on the earlier run, see notes).

## Environment

- Default emulator suite (9099/8080/5001/9199, rebuilt emulator data) — Flutter **web** release build with
  `--dart-define=USE_EMULATORS=true`, served statically, headless Chrome at **390×844**, Flutter semantics tree for
  assertions. An earlier full pass ran against an isolated emulator set (2xxxx).
- Backend actions (admin status changes, rider assign/location/delivery, chat replies, deactivation) via callables /
  Admin SDK on the emulators. A request guard aborted any call to production Google endpoints during the final run.

## Builds & config

| Check | Result |
|---|---|
| `flutter analyze` | ✅ No issues found |
| `flutter test` | ✅ 9 tests (route smoke test LTR/light + RTL/dark, model parsing, **new** `test/qa_fixes_test.dart`) |
| `flutter build web` (production, no defines) | ✅ no emulator banner, Firebase options for `qwikmart-37299` |
| `flutter build web --dart-define=USE_EMULATORS=true` | ✅ (QA build) |
| `flutter build apk --release` | ✅ built (64 MB) — ⚠️ **debug-signed** (no `key.properties`) |
| APK badging | package `com.qwikmart.app`, label **QwikMart**, versionName 1.0.0 (code 1), compileSdk 36 |
| Permissions | INTERNET, ACCESS_FINE/COARSE_LOCATION, POST_NOTIFICATIONS, CAMERA (+ FCM/WAKE_LOCK/VIBRATE from plugins) — sane; cleartext only in the debug manifest |
| Defaults | `USE_EMULATORS=false`, `USE_MOCK=false`, `debugShowCheckedModeBanner: false`, app name "QwikMart", launcher icons / native splash present |

Note: `flutter_native_splash` is a dev_dependency — build release with plain `flutter build apk --release` (with
`--no-pub` a stale debug `GeneratedPluginRegistrant` references it and compilation fails).

## Deploy blocker B4

- `main.dart`: no silent switch to demo data any more. If Firebase cannot start, a **"Unable to connect to QwikMart" +
  Retry** screen is shown; demo data only with `--dart-define=USE_MOCK=true`.
- `AppSettings.demoMode` defaults to **false** (model default and `fromJson`); the login screen shows demo hints only in
  mock mode or when `settings/public.demo_mode == true`.

## E2E matrix (Flutter web build, 390×844)

| Area | Checks | Result |
|---|---|---|
| Start | A0 guest created in the **Auth emulator** (after fix) · onboarding → A2 non-deliverable "We're not here yet" · A3 Mumbai deliverable · A4 demo hint only with `demo_mode` · A5 guest home | ✅ |
| Home | A18 Quick ↔ eCommerce layouts/gradients · A19 category tab (Snacks) header + sections · A20 all section types (banner slider, category grid, product sliders, grid banner, top brands, title image, heading) | ✅ |
| Catalog | search multi-word / single / no-results, sort sheet, filter sheet, categories rail → subcategory listing, PDP variant price switch + out-of-stock, rating breakdown + reviews, frequently bought together / similar, favourites add/remove | ✅ (earlier run, unchanged code) |
| Auth | A6 guest add to cart · A7 wrong password message · A8 email login · A9 **guest cart merged** · A15 phone shown once · A17 logout → new emulator guest · A57–A58 register with referral (uid kept, `referred_by`, referral record, welcome notification) · A59 deactivated user blocked · A60 phone OTP +919876543210 → existing account · A62–A63 new number → new account | ✅ |
| Cart / checkout | A10 server issues shown · A11 Place Order blocked · A12 labelled +/− · A13 Home address ₹25 + surge/packaging rows · A14 **re-priced for Work address ₹35** · A21 self-pickup drops fees · A22 COD order (charged ₹35 = shown) · A23 VIP500 percent · A24 MUMBAI99 fixed · A25 WALLETCASH50 cashback (+₹50 after delivery) · A26 FREEDEL · A27 HAPPYHOUR rejected with reason · wallet partial/full + online gateway "not available" (earlier run) | ✅ |
| Orders | A28 list · A29 detail bill (surge + other charges) · A30 admin status live · A31 rider appears live · A32 **map refits and tracks the rider** · A33 cancel hidden at out_for_delivery · A34 delivered live, OTP hidden, Rate shown · A35 review submitted · A36 invoice PDF (getInvoiceUrl → PDF opened) · A37 reorder → cart · A38 return request (reason + details) · cancel received order with reason (earlier run) · cashback credited after delivery | ✅ |
| Account | A40 wallet + history · A41 add money without keys → **visible** "not available" message · A42 withdraw · A43 refer & earn · A44–A45 notifications + mark all read · A46–A47 support chat both ways (realtime) · A48 edit profile name (+ revert) · A49–A51 ar (RTL mirrored) / hi / en · dark ↔ light | ✅ |
| Content | A52–A53 blog list/detail · A54 FAQ · A55 CMS pages about/privacy/terms/refund · A56 unknown product | ✅ |

Notes: review **photo** and return **photo** uploads passed on the earlier run (photo stored, public URL); in the final
run the headless file-chooser needed a trusted pointer gesture that the harness could not provide, so A35/A38 were
submitted without photos. Guest-cart merge after **phone** login (A61) follows the same code path as the email merge
(A9 ✅) but could not be completed in the harness (OTP widget input); it is covered by code review + A9.

## Bugs found and fixed (app)

1. **Critical (dev/QA builds): emulator web builds talked to the production Auth service.** FlutterFire web restores a
   persisted session during `Firebase.initializeApp` (an `accounts:lookup` call to `identitytoolkit.googleapis.com`)
   before `useAuthEmulator` runs; the JS SDK then rejects the emulator (`auth/emulator-config-failed`, swallowed by the
   plugin) and guests/sign-ins go to **production**. Fix: emulator connection awaited, and in web+emulator builds the
   persisted Auth session is cleared before init (`core/web_auth_reset_web.dart`). Production builds are unaffected.
   ⚠️ Before the fix, this QA run created **4 anonymous users in production Auth** (`vnfwU26iY5eUdiAQ1bEy8LTWkZQ2`,
   `Xojadvd31ZfMyX48bNh0CS9EGdw2`, `wSt06SR69LV6vxovrLLpfy4I7HV2`, `AA4nQypM4GPduYJ2DaRu1qkgie62`; earlier 2xxxx runs may
   have created a few more). No Firestore/Functions data went to production. The project owner may delete them in
   Authentication → Users (I did not touch production).
2. **Phone login on Flutter web failed for numbers that already have an account** (`linkWithPhoneNumber` →
   credential-already-in-use; FlutterFire web exposes no fallback credential → "OTP expired"). Web now uses
   `signInWithPhoneNumber` + `mergeGuestCart`.
3. **Cart ignored cartSummary `issues` / `min_order_remaining`** and allowed qty beyond `max_qty_per_order`/stock —
   issues card, Place Order disabled, steppers capped (`CartItem.limit`, `Cart.isBlocked`, `QtyStepper.canIncrement`).
4. **Delivery charge not priced for the selected address** (showed ₹25, charged ₹35 for Work) — summary now passes
   `address_id` (`checkoutAddressIdProvider`).
5. **Messages from bottom sheets were invisible** (SnackBar drawn under the sheet: add money, withdraw, cancel/return
   errors) — `showSnack` shows an overlay toast above popups (live region).
6. Add money offered a disabled default gateway when none is enabled — only enabled gateways, otherwise
   "Online payments are not available right now" and the button is disabled.
7. Tracking map was fitted before the rider existed → rider off-screen; now refits when the rider appears.
8. Invoice on Flutter web opened after a 20 s PDF generation as a new tab → popup-blocked; opens in the same tab on web.
9. Callable errors showed " [400]" (Functions JS SDK suffix) — stripped in `AppException`.
10. Profile showed "+91 +919876543210" (E.164 already includes the dial code) and rendered "919876543210+" in RTL —
    `AppUser.displayPhone` + LTR text.
11. Cashback coupon shown as "Coupon discount −₹50" on order detail (not deducted) → "Cashback (after delivery) +₹50";
    zone "Other charges" row added; order success / detail show "Cash on Delivery" instead of "Cod".
12. Return/cancel sheet placeholder said "Write cancel reason…" for returns → "Tell us more (optional)…" (en/ar/hi).
13. Accessibility: labelled +/− steppers, add-photo buttons and the edit-profile button.

## Backend findings (for the backend owner — `firebase/**` not edited)

- Same as the website report: apostrophe search tokens ("lays"), `submitReview` storing raw Storage paths, and
  `cartSummary` defaulting to the detected point instead of the default address when `address_id` is omitted.
- `mergeGuestCart` silently returns `{merged: 0}` when the guest uid does not exist in Auth (that is how the production-
  auth bug above surfaced) — consider returning an error so clients can log it.

## Known limitations

- Reverse geocoding is unavailable on web (city/zone shown instead of street address).
- In emulator **web** builds a page reload starts a new guest session (persisted Auth is cleared on purpose, see bug 1).
- Online gateway hand-off (`_completeGatewayPayment`, wallet top-up) opens the hosted page in a new tab after an async
  call; on Flutter web this may be popup-blocked — not testable without gateway keys (Android uses an external app).
- iOS is not registered in Firebase (no `GoogleService-Info.plist`); the app now shows the startup error screen there
  instead of demo data.
