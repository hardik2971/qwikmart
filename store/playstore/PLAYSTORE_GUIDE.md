# QwikMart — Google Play first release guide

Step-by-step guide for the store owner to publish the two Android apps:

| | Customer app | Delivery partner app |
|---|---|---|
| Package | `com.qwikmartapp.customer` | `com.qwikmartapp.delivery` |
| Launcher name | QwikMart | QwikMart Delivery |
| Version | 1.0.1 (versionCode 2) | 1.0.0 (versionCode 1) |
| Signed bundle | `customer/qwikmart-customer-1.0.1+2.aab` | `delivery/qwikmart-delivery-1.0.0+1.aab` |
| Store texts | `customer/listing.md` | `delivery/listing.md` |
| Graphics | `customer/icon-512.png`, `feature-graphic.png`, `01…08-*.png` | `delivery/icon-512.png`, `feature-graphic.png`, `01…08-*.png` |
| Min / target SDK | 24 / 36 | 24 / 36 |

Prepared 2026-10-14. Backend: live Firebase project `qwikmart-37299`.

---

## 0. Before you start (one-time)

1. **Back up the upload keys now.** They are in `C:\Users\di\qwikmart-keys\` (`customer-upload.jks`,
   `delivery-upload.jks`, `KEYS-README.txt` with the passwords). Copy the whole folder to two safe places
   (password manager + encrypted USB). Never put them in git, e-mail or chat.
2. **Website / privacy policy.** Play requires a public privacy-policy URL and (because users can create accounts)
   a public **account-deletion URL**. The customer website (`web/`) is **not hosted yet**; the privacy page already
   exists at `/pages/privacy` (content from Firestore `pages/privacy`, editable in Admin → Pages). Deploy the website
   first (see `DEPLOYMENT_CHECKLIST.md` §6), then use `https://<your-domain>/pages/privacy`. Review the text: it must
   name QwikMart, list the data in §6 below (including delivery-partner location, documents and bank details), the
   purposes, retention, and how to delete an account. Add a page `delete-account` (Admin → Pages) — see §6.6.
3. **Support e-mail.** The listings use `support@qwikmart.app` as a placeholder. Create that mailbox (or use your
   own). The apps themselves still show `support@snapbuy.app` (`lib/core/config.dart` → `supportEmail` in both apps);
   change it and rebuild if that is not your mailbox.
4. **Google Play developer account** (one-time US$25). If you register as an **organization** you need a D-U-N-S
   number; a **personal** account created after Nov 2023 must run a **closed test with at least 12 testers for 14
   days** before it can apply for production access. Plan for this.

---

## 1. Create each app in Play Console

Do this twice (customer, then delivery).

1. Play Console → **Home → Create app**.
2. App name: from `listing.md` (customer `QwikMart: Groceries in Minutes` or `QwikMart`; delivery
   `QwikMart Delivery Partner`). Default language **English (India) – en-IN**. **App** (not game). **Free**.
3. Accept the declarations (Developer Program Policies, US export laws) → **Create app**.

---

## 2. Store listing (Grow users → Store presence → Main store listing)

| Field | What to enter / upload |
|---|---|
| App name | `listing.md` → App name |
| Short description | `listing.md` → Short description |
| Full description | `listing.md` → Full description (paste the text inside the code block) |
| App icon | `icon-512.png` (512×512, 32-bit PNG) |
| Feature graphic | `feature-graphic.png` (1024×500, no alpha) |
| Phone screenshots | `01-….png` to `08-….png` in order (1080×1920, 9:16) |
| 7-inch / 10-inch tablet screenshots | optional — leave empty (the apps are phone-first) |
| Video | optional — leave empty |

Then **Store settings** (Grow users → Store presence → Store settings):

| Field | Customer | Delivery |
|---|---|---|
| App category | **Shopping** | **Business** (see `delivery/listing.md` for why not Maps & Navigation) |
| Tags | from `listing.md` | from `listing.md` |
| Contact e-mail | `support@qwikmart.app` | `support@qwikmart.app` |
| Website | your domain (once hosted) | your domain |
| Phone | optional | optional |

The `raw/` folders contain the unframed app captures — do not upload them; they are there in case you want to
re-frame or localise the screenshots later.

---

## 3. Upload the first build — Internal testing

1. **Test and release → Testing → Internal testing → Create new release.**
2. **Play App Signing**: on the first upload Play asks to set up app signing. Choose **"Use Google-generated key"**
   (recommended). Your file `*-upload.jks` stays the **upload key**; Google holds the **app signing key**.
3. Upload `customer/qwikmart-customer-1.0.1+2.aab` (or the delivery one). The bundle already contains the R8
   mapping file and native debug symbols, so crash stack traces are de-obfuscated automatically.
4. Release name: `1.0.0 (1)`. Release notes: paste `listing.md` → Release notes (language `en-IN`).
5. **Testers** tab: create an e-mail list (yourself + team), save, copy the opt-in link and open it on your phone.
6. **Next → Save → Send for review / Start rollout to Internal testing.** Internal tests are available within minutes.

### 3.1 After the first upload: register the Play signing key in Firebase (needed for phone OTP)

Builds installed from Play are re-signed with Google's app-signing key, so Firebase must know that certificate too.
The **upload** keys are already registered (done 2026-10-14, see §10).

1. Play Console → the app → **Test and release → Setup → App integrity → App signing** tab.
2. Under **App signing key certificate** copy the **SHA-1** and **SHA-256** fingerprints.
3. Add them in Firebase — either:
   - Console: Firebase → Project settings → General → **Your apps** → `com.qwikmartapp.customer` (or `com.qwikmartapp.delivery`)
     → **Add fingerprint** → paste SHA-1 → Save; repeat for SHA-256; or
   - CLI (from `F:\DI_Local_Project\snapbuy\firebase`, logged in):
     ```bash
     npx firebase apps:android:sha:create 1:1054065019133:android:bfabf974129f2cfc4a9694 <SHA1> --project qwikmart-37299     # customer
     npx firebase apps:android:sha:create 1:1054065019133:android:bfabf974129f2cfc4a9694 <SHA256> --project qwikmart-37299
     npx firebase apps:android:sha:create 1:1054065019133:android:443f0d691cf47b284a9694 <SHA1> --project qwikmart-37299     # delivery
     npx firebase apps:android:sha:create 1:1054065019133:android:443f0d691cf47b284a9694 <SHA256> --project qwikmart-37299
     ```
4. Optional: download the refreshed `google-services.json` into `android/app/` for the next build (not required
   for phone auth; it only matters if you later add Google Sign-In).
5. If you enable **App Check / Play Integrity** later, link the Play app (App integrity → Play Integrity API →
   link the Cloud project `qwikmart-37299`).
6. Test phone-number OTP with a **real** number on the internal-testing install. Without the Play fingerprints the
   OTP falls back to a browser reCAPTCHA page.

---

## 4. App content (Policy → App content)

Fill every section; the release cannot go to production until all are complete.

### 4.1 Privacy policy
`https://<your-domain>/pages/privacy` (see §0.2 — the website must be live first).

### 4.2 Ads
**No, my app does not contain ads.** (Neither app includes an ad SDK.)

### 4.3 App access — reviewer credentials
Both apps need a login for most features, so choose **"All or some functionality is restricted"** and give working
credentials. **Do not use the seeded demo accounts** (`customer@gmail.com`, `alex@gmail.com`): they are disabled on
live, their passwords are public in the README, and the customer one owns the Firebase test phone number. Create a
dedicated reviewer account per app on live:

**Customer reviewer (e.g. `play-review-customer@qwikmart.app`)**
1. Install the internal-testing build (or the website once hosted) → onboarding → choose Mumbai → Login →
   **New here? Create an account** → name "Play Reviewer", the e-mail above, a strong password (16+ chars).
   (Alternatively Firebase console → Authentication → Add user, then sign in once in the app so `syncProfile`
   creates the profile.)
2. Optional: Admin → Users → find the reviewer → add some wallet balance so the wallet screen is not empty, and add
   an address in the app.
3. In Play Console → App access → **Add instructions**: name "Customer reviewer", username/e-mail + password, and:
   "Choose Mumbai on the location screen (or allow location). Sign in with E-mail. You can browse, add to cart and
   view checkout. Please do not place orders — they are fulfilled by a real store; if you need to, choose Cash on
   Delivery and cancel it from Orders."
   Phone OTP cannot be tested by reviewers (real SMS) — say "use e-mail login".

**Delivery reviewer (e.g. `play-review-rider@qwikmart.app`)**
1. In the delivery app → **Register** (stepper): name, phone, DOB, India / Mumbai zone, vehicle "Bike", any
   vehicle number, upload two sample images for licence / ID (a photo marked "SAMPLE"), dummy bank details →
   Submit → "Pending approval".
2. Approve it: Admin panel → Delivery boys → the reviewer → **Approve** (zone Mumbai). The admin panel is not hosted
   yet; run it locally against live (`cd admin && npm run dev` without `NEXT_PUBLIC_USE_EMULATORS`) and sign in with
   your real super-admin account.
3. Give the reviewer something to see: place one low-value COD test order as the customer reviewer and assign it to
   the rider reviewer in Admin → Orders (or leave it in Available). Afterwards cancel it.
4. App access instructions: "Sign in with the e-mail/password below. Tap the switch on Home to go online (location
   permission required). Assigned orders appear under Active; open one to see the pickup → delivery workflow. The
   delivery OTP is shown only in the customer app — use the customer reviewer account to read it."
5. Keep both reviewer accounts active and their passwords unchanged until the review is approved (and for future
   updates). Store the passwords in your password manager.

### 4.4 Content rating (IARC questionnaire)
- E-mail: your support address. Category: the closest non-game category offered (store / shopping / "All other app
  types" — the wording varies).
- Violence, fear, sexuality, nudity, profanity, crude humour, drugs/alcohol/tobacco references, gambling, horror:
  **No** to all. (Check your live catalogue: if you add alcohol or tobacco products later, re-answer.)
- **Users can interact or exchange content?** Customer: **Yes** — product reviews with photos are public
  (user-generated content); support chat is only with QwikMart. Delivery: **No** (chat is with support only).
- **Shares the user's current physical location with other users?** Customer: **No**. Delivery: **Yes** — the
  rider's live location is shown to the customer of the order being delivered.
- **Digital purchases?** **No** (physical goods; wallet top-ups are payments for goods, not digital content).
- **Unrestricted internet / web browsing?** No.
- Expected result: rated for everyone / PEGI 3 with "Users Interact" (customer) or "Shares Location" (delivery).

### 4.5 Target audience and content
- Target age: **18 and over** only (both apps). Shopping with payments and a gig-worker app are not for children.
- "Could the app unintentionally appeal to children?" **No**. This keeps the apps out of the Families policy.

### 4.6 News app
**No** (both).

### 4.7 COVID-19 contact tracing / status apps
**No**.

### 4.8 Data safety
See §6 below — answers derived from the code.

### 4.9 Government apps
**No** — not developed on behalf of a government.

### 4.10 Financial features
**My app doesn't provide any financial features.** The QwikMart Wallet is closed-loop store credit (refunds,
cashback, top-ups spent in QwikMart; riders withdraw their earnings to a bank account through admin approval). It is
not a bank, loan, payment-service or investment product. If your legal adviser sees it differently, declare
"Other".

### 4.11 Health apps
**No health features.**

### 4.12 Permissions declarations (Policy → App content → Sensitive permissions)

Merged release manifests (checked in the built bundles):

| Permission | Customer | Delivery | Play declaration needed? |
|---|---|---|---|
| INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, VIBRATE, FCM `c2dm.RECEIVE` | yes | yes | No |
| ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION | yes (zone + address pin, foreground only) | yes (while online) | No form (foreground location) |
| ACCESS_BACKGROUND_LOCATION | **no** | **no** | No |
| FOREGROUND_SERVICE + **FOREGROUND_SERVICE_LOCATION** (`foregroundServiceType="location"`) | no | **yes** | **Yes — Foreground service permissions declaration** |
| POST_NOTIFICATIONS | yes | yes | No (runtime prompt) |
| CAMERA | yes (avatar / review / return photos) | yes (licence / ID photos) | No |
| READ_MEDIA_* / READ_EXTERNAL_STORAGE | no (Android photo picker) | no | No |

**Delivery app — Foreground service (location) declaration** (Policy → App content → Foreground service
permissions):
1. Select **Location** as the foreground service type.
2. Task: "Delivery partner live location during an active shift." Explain: while the rider is online, the app keeps
   a persistent notification and sends the rider's GPS position to QwikMart every ~10 seconds so the platform can
   offer nearby orders and the customer can track the delivery. It starts only when the rider taps **Go online**
   and stops when the rider goes offline or signs out. The user can see and stop it at any time.
3. Impact if deferred/interrupted: customers lose live tracking and order assignment uses a stale position.
4. **Video** (required): record a short screen video (30–90 s) on a real phone with the internal-testing build:
   sign in as the rider reviewer → Home → tap **Go online** → grant location → show the persistent notification →
   switch to another app (notification still visible) → back → open an active order → **Go offline** →
   notification disappears. Upload it to YouTube as **Unlisted** and paste the link.
5. Because the app does **not** request `ACCESS_BACKGROUND_LOCATION`, the separate *Location permissions
   (background)* declaration is **not** required. If you ever add that permission, Play requires the background-
   location form plus a video and a prominent in-app disclosure.
6. Recommended (good practice, reviewers look for it): a short in-app explanation before the location prompt —
   "QwikMart Delivery collects your location while you are online to offer orders near you and let customers track
   their delivery, even when the app is in the background." Today the app shows an explanation only when permission
   is denied.

---

## 5. Pricing and distribution

Monetize → Pricing: **Free**. Countries: **India** (add others where you operate). Devices: phones; leave
tablets / Chromebooks enabled unless you see layout problems in the pre-launch report. Wear OS / TV / Auto: off.

---

## 6. Data safety form (both apps)

Section 1 — "Does your app collect or share any of the required user data types?" **Yes**.
"Is all of the user data collected by your app encrypted in transit?" **Yes** (HTTPS/TLS to Firebase; cleartext is
allowed only in debug builds). "Do you provide a way for users to request that their data is deleted?" **Yes**.

Answers for every type below: **Collected = Yes, Shared = No** (data goes only to QwikMart's Firebase backend and its
service providers — Google Firebase, SMS/e-mail providers and payment gateways acting on QwikMart's behalf, which
Play does not count as "sharing"; data shown to the rider/store/customer to fulfil an order is a user-initiated
transfer). **Processed ephemerally = No** unless stated. Purposes are listed per row (use "App functionality" and
"Account management" as indicated; neither app uses data for advertising or analytics — there is no ads or
analytics SDK and no Crashlytics).

### 6.1 Customer app (`com.qwikmartapp.customer`)

| Data type (Play category) | Collected | Required / optional | Purposes | Where in the app |
|---|---|---|---|---|
| Personal info → **Name** | Yes | Optional (guest browsing possible) | App functionality, Account management | register / profile |
| Personal info → **Email address** | Yes | Optional | Account management, App functionality | e-mail login / register |
| Personal info → **Phone number** | Yes | Optional | Account management (OTP login), App functionality (delivery contact) | phone login, addresses |
| Personal info → **Address** | Yes | Required to order | App functionality | addresses (with map pin) |
| Personal info → User IDs | Yes | Required | Account management | Firebase uid, referral code |
| Location → **Precise location** | Yes | Optional (user can pick a city instead) | App functionality (detect delivery zone, address pin) | location screen / map picker |
| Financial info → **Purchase history** | Yes | Required to order | App functionality | orders, invoices, returns |
| Financial info → Other financial info | Yes | Optional | App functionality | wallet balance, top-ups, withdrawals |
| Financial info → **Payment info** | Yes (since 1.0.1) — card / UPI / netbanking details are entered in the **Razorpay checkout SDK** inside the app and sent straight to Razorpay; QwikMart never stores them. Play counts data collected by SDKs in your app, so declare it | Optional (only when paying online) | App functionality | Razorpay checkout |
| Messages → **Other in-app messages** | Yes | Optional | App functionality, Customer support | support chat |
| Photos and videos → **Photos** | Yes | Optional | App functionality | profile avatar, review photos (public), return photos |
| App activity → Other user-generated content | Yes | Optional | App functionality | product ratings & reviews |
| App activity → In-app search history | No (recent searches stay on the device only) |
| Device or other IDs | Yes | Required for notifications | App functionality (push notifications) | FCM registration token, Firebase installation ID |
| App info and performance → Crash logs / Diagnostics | No (no crash reporting SDK) |

### 6.2 Delivery app (`com.qwikmartapp.delivery`)

| Data type | Collected | Required / optional | Purposes | Where |
|---|---|---|---|---|
| Personal info → **Name** | Yes | Required | Account management, App functionality | registration |
| Personal info → **Email address** | Yes | Required | Account management | login / registration |
| Personal info → **Phone number** | Yes | Required | App functionality (contact by customer/store), Account management | registration |
| Personal info → **Address** | Yes | Required | Account management (partner verification) | registration |
| Personal info → **Other info** (date of birth, vehicle type & number) | Yes | Required | Account management (verification), Fraud prevention | registration |
| Personal info → User IDs | Yes | Required | Account management | uid |
| Location → **Precise location** | Yes — **including while the app is in the background** during an online shift (foreground service) | Required to go online | App functionality (order assignment, customer live tracking) | Go online switch |
| Financial info → **Other financial info** (bank account name/number/IFSC, earnings, cash collected, wallet, withdrawals) | Yes | Required for payouts | App functionality, Account management | registration, earnings, cash, wallet |
| Photos and videos → **Photos** | Yes | Required | Account management (identity / licence verification) | driving licence and ID proof (image or PDF) |
| Files and docs | Yes (ID proof may be a PDF) | Required | Account management | registration |
| Messages → **Other in-app messages** | Yes | Optional | Customer support | support chat |
| Device or other IDs | Yes | Required for new-order alerts | App functionality | FCM token |
| Crash logs / Diagnostics | No |

In the delivery app the **customer's** name, phone and address are displayed to the rider for the orders they
deliver; that data belongs to the customer app's declaration (collected there).

### 6.3 Security practices
- Data encrypted in transit: **Yes**.
- Users can request deletion: **Yes**.
- Committed to Play Families policy: not applicable (18+).
- Independent security review: **No** (unless you commission one).

### 6.4 Account deletion — what really happens (put this on the deletion page)
- **Customer app:** Profile → **Delete account** calls the `deleteAccount` function: the cart, addresses, favourites
  and notifications are deleted; the profile is anonymised (name "Deleted user", e-mail, phone, avatar and push
  tokens removed) and the Firebase Auth login is deleted. **Order records** (with the delivery address and items)
  are **kept** for accounting/tax and dispute handling — say so and state the retention period in the privacy
  policy. Uploaded avatar / review photo files remain in Storage unless removed by an admin (consider adding a
  cleanup).
- **Delivery app:** Profile → **Delete account** (added for v1.0.0) calls the same `deleteAccount` function. It is
  refused while the rider has active orders or unsettled cash in hand; otherwise the rider record is deactivated and
  stripped of personal details (bank, documents, address, location), the profile is anonymised and the Firebase login
  is deleted. Order / payout history stays for accounting.

### 6.5 Deletion URL (Data safety → "Delete account URL")
Play needs a **web** link where users can request deletion without installing the app. Create a CMS page
`delete-account` (Admin → Pages) explaining: how to delete in the app (Profile → Delete account), how to request by
e-mail (`support@qwikmart.app`, from the registered e-mail/phone), what is deleted and what is retained (§6.4) and
how long it takes. URL: `https://<your-domain>/pages/delete-account` (once the website is live).

---

## 7. Pre-launch report (runs automatically on test tracks)

- Play installs the build on ~10 real devices and crawls it. Provide the **reviewer credentials** under
  Test and release → Testing → Pre-launch report → Settings → **Sign-in credentials** so the crawler gets past login
  (e-mail/password field resource names are not fixed; use "Google sign-in disabled, credentials: username/password"
  and accept that the crawler may only reach the login screen on Flutter apps).
- The customer crawler signs in **anonymously as a guest on live** each run → a few anonymous users appear in
  Firebase Authentication (they are harmless; you can delete users with no e-mail/phone periodically).
- Watch out: the crawler logged in as the customer reviewer could **place COD orders on live**. Check Admin → Orders
  after each pre-launch run and cancel crawler orders, or leave the credentials empty for the customer app.
- Expected/benign findings: Flutter accessibility warnings (touch-target size, missing content labels on some
  icons), "uses deprecated API" notes from plugins. Fix anything listed as **Crash** or **ANR** before production.
- Stability: check Android vitals after the internal test (no crash reporting SDK is integrated — consider adding
  Firebase Crashlytics before scaling up).

---

## 8. Roll out

1. **Internal testing** (both apps): install via the opt-in link on 2–3 real phones. Test: phone OTP with a real
   number (after §3.1), e-mail login, location, a COD order end-to-end with a real rider device (accept → picked up
   → out for delivery → OTP from the customer app → delivered), push notifications, wallet, return request.
2. **Closed testing** (required for new personal developer accounts: ≥ 12 testers opted in for 14 continuous days).
   Promote the same release: Internal testing → release → **Promote release → Closed testing**.
3. **Production**: Test and release → Production → **Create new release** → add from library (the same AAB) →
   release notes → **Staged rollout 20 %** → check vitals for 1–2 days → 50 % → 100 %.
4. First review usually takes 1–7 days (longer for apps with location foreground services). Answer policy e-mails
   from Play quickly; the delivery app may be asked for an updated foreground-service video.
5. Every update: increase `version:` in `pubspec.yaml` (e.g. `1.0.1+2`), `flutter build appbundle --release`
   (delivery: `--dart-define=FALLBACK_TO_MOCK=false`, which is also the default), upload the new AAB.

---

## 9. Re-building the bundles

Signing is wired: `android/key.properties` (git-ignored) points to `C:/Users/di/qwikmart-keys/<app>-upload.jks`, and
`android/app/build.gradle.kts` signs `release` with it (without the file it would fall back to the debug key, which
Play rejects).

```bash
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"
cd /f/DI_Local_Project/snapbuy/customer_app && flutter build appbundle --release
cd ../delivery_app && flutter build appbundle --release --dart-define=FALLBACK_TO_MOCK=false
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab   # Owner must be CN=QwikMart…, not Android Debug
```

Built and verified on 2026-10-14:

| Bundle | Size | Signer (upload key) | SHA-1 | SHA-256 |
|---|---|---|---|---|
| `customer/qwikmart-customer-1.0.0+1.aab` | 50.1 MB | `CN=QwikMart, OU=Mobile, O=QwikMart, C=IN` | `F6:FA:25:C4:15:D8:EE:0F:5E:CE:41:D8:39:EF:15:D1:75:3C:5D:8B` | `59:1B:20:8F:87:70:C6:FB:E3:94:E7:0D:66:28:50:99:03:FC:15:CD:1E:0D:46:BA:7D:01:9C:40:F6:83:AC:BD` |
| `delivery/qwikmart-delivery-1.0.0+1.aab` | 50.4 MB | `CN=QwikMart Delivery, OU=Mobile, O=QwikMart, C=IN` | `5D:78:EF:E1:A9:8F:85:48:D6:45:B7:2B:B1:77:4F:56:AB:60:21:8F` | `30:22:34:AA:61:82:F2:F5:DD:88:9E:C2:ED:14:47:5D:8B:8B:4F:82:A2:4E:AB:5A:72:74:D1:52:BE:7A:43:B1` |

Both: versionCode 1, versionName 1.0.0, minSdk 24, targetSdk 36, R8 enabled (mapping + native symbols embedded).
`*.aab` files under `store/playstore/` are git-ignored (root `.gitignore`).

## 10. Firebase fingerprints status

| Firebase Android app | Upload key SHA-1 + SHA-256 | Play app-signing key |
|---|---|---|
| `1:1054065019133:android:bfabf974129f2cfc4a9694` (`com.qwikmartapp.customer`) | **registered** 2026-10-14 | **to do after first upload** (§3.1) |
| `1:1054065019133:android:443f0d691cf47b284a9694` (`com.qwikmartapp.delivery`) | **registered** 2026-10-14 | **to do after first upload** (§3.1) |

Also still open from `DEPLOYMENT_CHECKLIST.md`: the Firebase test phone number `+91 9876543210 → 123456` gives
anyone access to the (currently disabled) demo customer — remove it before launch; restrict the Android API key to
the two package names + SHA-1s (Google Cloud → Credentials) after adding the Play signing fingerprints.

---

## 11. Known issues found while preparing the listing (fix or verify before production)

1. ~~Delivery app — account deletion missing in-app~~ — **fixed** (Profile → Delete account, §6.4).
2. **Delivery app — dashboard stat tiles, History list and Notifications stayed in "loading"** in the Flutter web
   build against live data, while Active orders, order detail, Earnings, Cash and Wallet loaded and the same
   Firestore queries returned data through the JS SDK. It may be web-only; verify Home stats / History /
   Notifications on a real Android device in internal testing.
3. Delivery app profile shows the phone as `+91 +919811111111` (dial code added to an E.164 number) and rating 0.0.
4. Customer home banner artwork is cropped on the left (banner text cut off) at phone width.
5. Live data contains QA leftovers that reviewers may see in the demo history: orders cancelled with reason
   "Smoke test", a pending withdrawal "smoke test", rider support chat full of "Smoke test message".
6. Web builds (`flutter build web --release`, default `-O4`) of both apps fail at start-up against live Firebase
   (`Unsupported operation: Int64 accessor not supported by dart2js`; the optimised build appears to fall back to
   the method-channel Firestore codec; `-O2` fails too, `--profile` works). Android bundles are unaffected.
   Investigate before hosting the Flutter web builds.
7. Screenshot 07 (customer tracking) shows the 6-digit delivery OTP of demo order SB-ORD-00597 (demo customer,
   disabled account). Harmless, but you may cancel that demo order in Admin.
