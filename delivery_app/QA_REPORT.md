# QwikMart Delivery – QA report

Date: 2026-10-13 · App: `delivery_app` (Flutter 3.41.4, Firebase only) · Backend: Firebase Emulator Suite
(default ports 9099/8080/5001/9199, preview data incl. migrated MySQL riders/orders) · UI: Flutter **web** build
(`--dart-define=USE_EMULATORS=true`) driven by headless Chrome at **390×844** through the semantics tree.
Scripts and screenshots: session scratchpad `qa-delivery/` (`a_logins`, `c_orders`, `e_more`, `f_register`,
`g_intents`), not part of the repo.

## Verdict: **GO** for the app (all flows pass, all deploy blockers fixed)

One release-ops item remains: **`android/key.properties` (upload keystore) is missing**, so
`flutter build apk --release` is signed with the **debug key** (`CN=Android Debug`). Play will reject that
upload. Provide the keystore before you publish. The code does not need to change.

## Deploy blockers

| # | Blocker | Status |
|---|---|---|
| B2 | `FALLBACK_TO_MOCK` defaulted to `true`, so a network or sign-in error could log the rider in to mock data | **Fixed**: default is `false` (`core/config.dart`). With the default, the login surfaces the error ("Sign-in is not available" or the network message) and the app never enters mock mode. Mock mode is reachable only with `USE_MOCK=true` or an explicit `FALLBACK_TO_MOCK=true` |
| B3 | When permission was denied, the app wrote a fake Mumbai location every 10 s | **Fixed** (`core/location_service.dart`): only real GPS fixes are uploaded, and the demo position is used in mock mode only. `setOnline(true)` now checks permission first. Without permission the rider **stays offline** and sees a red snack: "Location access is off – allow location …". If a rider is restored or signed in while still `is_online` but has no permission, the app sets them offline |
| B5 | Demo credentials were always shown on the login screen | **Fixed**: the "Use demo account" chip appears only when `settings/public.demo_mode == true` or in mock mode (`demoModeProvider`) |
| P1 | Emulator web build could reach **production** Auth (see incident below) | **Fixed**: in emulator builds on the web (`USE_EMULATORS && kIsWeb`), the app wipes the persisted Auth state (IndexedDB `firebaseLocalStorageDb` and `firebase:*` keys) **before** `Firebase.initializeApp` (`core/emulator/web_auth_reset*.dart`). A failure to connect an emulator now disables Firebase instead of falling through to production. FCM registration is skipped in emulator builds. Verified: login, reload and every E2E run made **zero** requests to `*.googleapis.com` (the harness logs and blocks any such request) |

### Production-touching incident (resolved, read-only, nothing created)
Before the fix (around 2026-10-13 04:50–05:40 UTC), a few of my emulator-web test runs **reloaded the page** while
signed in. FlutterFire web restores the persisted user inside `Firebase.initializeApp`, before `useAuthEmulator`
runs. It therefore sent `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyC39HUD-GT9zC2wtKBkz4mRgXspm40Vzvw`
(the web API key of `qwikmart-37299`) carrying an **emulator-issued** ID token for alex (emulator uid
`NcgYw4wjSTRuPJZRwx1TWN2Mrh92`). Production answered **400 INVALID_ID_TOKEN**.

- These were rejected, read-only lookups. No production user was created, signed in or modified.
- The delivery app never signs in anonymously.

Since then, the harness reroutes and blocks Google endpoints, and the app wipes persisted Auth first (P1). The final
runs logged no production request.

## Pass / fail matrix (final runs)

| Area | Check | Result |
|---|---|---|
| Login | alex@gmail.com / Alex@1234 → Home | PASS |
| Login | rahul / vikram / suresh (`…delivery@gmail.com` / 123456) → Home → logout | PASS |
| Login | wrong password → "Invalid email or password" | PASS |
| Login | customer@gmail.com refused: "This is a QwikMart customer account, not a delivery partner account…" (previously the app offered "Register now") | PASS (fixed) |
| Login | admin@gmail.com refused: "This account is not a delivery partner account." | PASS |
| Login | inactive/rejected manoj refused · pending rohit → Pending Approval, no Home | PASS |
| Login | forgot password → reset e-mail (Auth-emulator OOB code created) | PASS |
| Login | change password (re-auth) → new password works → reverted · wrong current password refused | PASS |
| Login | logout → login screen, `is_online=false`, reload stays logged out | PASS |
| Login | session restore after reload | PASS (restore logic verified while routed to the Auth emulator). Emulator web builds now deliberately start signed out (P1). Native and production builds restore normally |
| Register | 5-step stepper (personal, country/zone, vehicle, licence **PNG** via image_picker, ID **PDF** via file_picker, bank) → Pending | PASS: `delivery_docs/{uid}/driving_license_*.png`, `id_proof_*.pdf` (application/pdf) in Storage. Doc fields, zone, vehicle and bank are correct |
| Register | pending rider cannot go online (`setOnline` → "pending approval"), no Home | PASS |
| Register | admin `approveDeliveryBoy` → app opens Home by itself (claims refreshed) → Go Online works, location written | PASS |
| Register | admin rejects → live red message with remark ("Documents unclear"), signed out; next login shows rejection + remark | PASS (fixed: before the fix the app signed out silently) |
| Home | stat tiles = Firestore (cash in hand, rating, today earnings, deliveries today) | PASS |
| Home | Go Online → `is_online`, location `{lat,lng,updated_at}` refreshed every ~10 s · Go Offline → `is_online=false`, writes stop (25 s check) | PASS |
| Orders | customer COD order appears in Available **without refresh** | PASS |
| Orders | Accept from card → detail. A second rider's accept fails: "already been accepted by another delivery partner" | PASS (fixed: navigation used to be lost when the realtime list removed the card first) |
| Orders | Mark Picked Up → Out for Delivery → wrong OTP "Invalid delivery OTP." | PASS |
| Orders | COD, "Customer paid less?" → ₹524 of ₹574 → `cash_collections/cod_{id}` amount 524 / expected 574 / **short 50**, order `cod_collected` 524, `cash_in_hand` +524, commission 30 → wallet +30 and `earnings_total` +30, Delivered screen shows **Short amount ₹50** | PASS (new feature: previously impossible from the app) |
| Orders | prepaid (wallet) order: no cash section, OTP → delivered, `cash_in_hand` unchanged, no cash entry | PASS |
| Orders | Reject → hidden for this rider (`rejected_by`), still accepted by another rider | PASS |
| Orders | delivered order in History tab | PASS |
| Orders | auto-assign (`settings/public.delivery.auto_assign` set true temporarily, then restored) → nearest online rider assigned | PASS (user_14 and user_16 are equidistant; user_16 was assigned) |
| Returns | admin `processReturn` approved → pickup_assigned → rider sees customer **name, phone, address** for an order delivered by *another* rider → Mark Picked Up → `picked_up` | PASS (fixed: before the fix, name, phone and address were blank because the rider cannot read that order) |
| Cash | cash in hand / collected / per-order list incl. short amount | PASS |
| Earnings | today / week / month = `delivery_earnings` sums | PASS |
| Wallet | below-minimum (₹50 < `min_withdraw` ₹100) blocked in-app · ₹100 request → pending, wallet −100 · 3 pending → warning + Submit disabled (backend agrees) | PASS (min and pending limit are new in the app) |
| Notifications | admin `sendNotification` appears live · Mark all read sets `read_at` only | PASS |
| Chat | rider → admin (chat summary updated) and admin `startChat` reply → rider, realtime | PASS |
| Invoice | in-app invoice + Open PDF (`getInvoiceUrl`) returns `application/pdf` | PASS |
| Intents | Get Directions → `https://www.google.com/maps/dir/?api=1&destination=lat,lng&travelmode=driving` (store and customer). Call → `tel:+912226401234` / `tel:+919820277165`. Returns call → `tel:+919876543210` | PASS |
| Profile | details shown | PASS |
| i18n | Arabic (RTL mirrored layout, no English left) · Hindi · back to English | PASS (fixed: 25 keys were missing in ar/hi, plus hard-coded English strings) |
| Theme | Dark mode via Profile → Theme, then System | PASS |
| Smoke | `dart run tool/firebase_smoke_test.dart` (default ports) | **59/59 passed** |
| Build | `flutter analyze` | 0 issues |
| Build | `flutter test` (new: models / workflow / URL builders / l10n parity) | 9/9 passed |
| Build | `flutter build web` (production defaults) | OK |
| Build | `flutter build apk --release` | OK, 63.6 MB, **debug-signed** (no `key.properties`) |
| Prod defaults | USE_EMULATORS=false, FALLBACK_TO_MOCK=false, USE_MOCK=false · Firebase options `qwikmart-37299` (android app id for `com.qwikmart.delivery` is in google-services.json) · label **QwikMart Delivery** · applicationId **com.qwikmart.delivery** · `debugShowCheckedModeBanner:false` · iOS location / background / camera strings present · cleartext HTTP in debug manifest only | PASS |

## Bugs fixed (delivery_app/**)

1. **B2 / B3 / B5 / P1**: see the blocker table above (`core/config.dart`, `core/location_service.dart`, `providers/online_provider.dart`, `features/auth/login_screen.dart`, `core/auth_service.dart`, `core/emulator/`, `core/push_service.dart`).
2. **Customer accounts were offered rider registration**, which would have converted them through `registerDeliveryBoy`. Such accounts are now refused with a clear message. A registration whose e-mail and password match an existing account checks that account first (`data/firebase/firebase_data_source.dart`, `providers/auth_provider.dart`).
3. **A rider rejected or blocked while signed in was signed out silently.** The app now shows a red message with the admin remark (`providers/auth_provider.dart`).
4. **Return pickup showed no customer name, phone or address** when the rider had not delivered the original order. The app now uses the `customer`/`address` that `processReturn` copies onto the return (`firebase_data_source.dart`).
5. **COD short collection**: added "Customer paid less?" with an amount field (0 ≤ x < payable) → `deliverOrder.cash_collected`. The short amount appears on the Delivered screen and in Cash Collection. A COD order already marked paid no longer asks for cash (`otp_sheet.dart`, `delivered_screen.dart`, `order_detail_screen.dart`, `cash_collection_screen.dart`, `models/finance.dart`).
6. **Accept from the Available card often did nothing visible**: the card was disposed by the realtime update before the callable returned. The fix captures the router and messenger before the await (`order_card.dart`).
7. **Online state drifted from the server.** After logout and login as another rider, or with a slow `setOnline`, the switch disagreed with `is_online`. The switch now adopts and follows the server flag. Concurrent and cancelled location starts are serialised, so the app never tracks while offline (`online_provider.dart`, `location_service.dart`).
8. **No location while the app was in the background**: geolocator now runs as an Android foreground service (persistent notification) or with iOS background updates. Manifest adds `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` and `WAKE_LOCK`.
9. **Withdraw**: the app now shows and enforces `settings/public.wallet.min_withdraw` and the 3-pending-requests limit (`wallet_screen.dart`, new `minWithdraw()` data call).
10. **Deep links / cold-start notification taps were lost** behind the splash redirect. The requested page is now kept (`?from=`), and back navigation from a deep-linked page goes Home instead of crashing (`router.dart`, `canPop` guards).
11. **"Chat with customer" button** opened a support thread under the customer's name. It is relabelled "Chat with support about this order" (there is no rider ↔ customer channel).
12. **i18n**: 25 keys were missing in ar and hi, and several strings were hard-coded (pending steps, online message, camera/gallery/PDF, invoice headers). The "Forget Password?" typo is fixed. ar/hi/en now have the same key set (test added).
13. Profile document tiles tried to load Storage paths and PDFs as images; they now show a placeholder. Icon-only buttons now expose their tooltip as an accessibility label.
14. The `test/` directory was empty, so `flutter test` could not pass. Added `test/models_test.dart` and `test/l10n_test.dart`.

## Backend findings (for the backend owner – `firebase/**` untouched)

1. **`registerDeliveryBoy` converts any existing non-panel account into a rider** (it overwrites `users/{uid}.type`, `name`, `phone`). A shopper who signs up as a rider with the same e-mail loses their customer type. Suggest refusing `type == 'customer'` accounts that have orders, or keeping a separate role. The app now refuses this, but the callable remains open.
2. **`syncProfile({app:'delivery'})` from a customer or panel account has side effects** before the app refuses it: it appends the FCM token and updates `language` / `last_login_at` on that user's doc. Consider returning early when `app=='delivery'` and the account is not a rider.
3. **`requestReturn`** returned "This item is not eligible for return." for every seeded delivered product. That is expected data (`return_allowed=false`). E2E seeded a return directly in the emulator and used `processReturn` for the rest.
4. Environment note: on this machine the functions emulator needs `FUNCTIONS_DISCOVERY_TIMEOUT≥120`, and cold callables can exceed the app's 60 s callable timeout under heavy load. When that happens the app reverts the toggle; it now re-syncs from the server flag.

## Not covered or limitations

- Real FCM push delivery (skipped in the emulator; web push is not configured), physical-device GPS and background tracking. The foreground-service config is verified only by build and manifest.
- iOS: Firebase iOS app is not registered (documented in README). The login reports "Sign-in is not available" because mock fallback is off.
- Emulator web builds start signed out after a reload (by design, P1).
