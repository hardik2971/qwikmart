# QwikMart — Customer Website (Next.js 15)

Customer storefront for QwikMart (Quick Commerce + eCommerce). The backend is **Firebase only** — Auth, Firestore,
Cloud Functions (callables, region `asia-south1`) and Storage. There is no REST API. Contract:
[`../docs/FIREBASE_BACKEND.md`](../docs/FIREBASE_BACKEND.md) (incl. *Deviations*), rules `../firebase/firestore.rules`,
indexes `../firebase/firestore.indexes.json`.

## Run

```bash
export PATH=/c/Users/di/AppData/Roaming/nvm/v22.22.3:$PATH   # Node 22
cp .env.example .env.local        # Firebase web config (or NEXT_PUBLIC_USE_MOCK=true for a standalone demo)
npm install
npm run dev                        # http://localhost:3000
npm run build && npm start         # production
```

### Against the local Emulator Suite (migrated MySQL data)

```bash
cd ../firebase
npm --prefix functions run build
npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data
# then in web/.env.local:
NEXT_PUBLIC_USE_EMULATORS=true      # + NEXT_PUBLIC_EMULATOR_HOST / *_EMULATOR_PORT (defaults 127.0.0.1, auth 9099,
                                    #   firestore 8080, functions 5001, storage 9199)
```

With emulators the Firebase web config may be left empty (a placeholder config for `qwikmart-37299` is used).
Demo login: `customer@gmail.com` / `123456` (accounts imported from MySQL keep their passwords).

Stack: Next.js 15.5 (App Router) · React 19 · Firebase JS SDK 12 · Swiper 12 · react-leaflet 5. Demo credentials on /login are
shown only when `settings/public.demo_mode` is `true` (or in mock mode).

## Modes

| `NEXT_PUBLIC_USE_MOCK` | Firebase config | Data layer |
|---|---|---|
| `false` | set | Firebase (`src/lib/fb`) |
| `true` (or config missing in `next dev`) | – | in-browser demo data (`src/lib/mock`, localStorage `sb-mock-state-v1`, "DEMO DATA" badge, OTP `123456`) |
| `false` + config missing in a production build | – | **no silent demo fallback** — Firebase calls fail visibly and a console error names the missing config |

## Data layer (`src/lib`)

- `api.ts` — picks the implementation; the UI only uses `api` (surface in `api-types.ts`).
- `firebase.ts` — lazy browser-only init of Auth / Firestore / Functions (`getFunctions(app, 'asia-south1')`) /
  Storage, emulator wiring.
- `fb/` — Firebase implementation:
  - `catalog.ts` — `settings/public`, countries, zones, `detectZone`, `getHome` (sections renderer unchanged),
    categories/brands/attributes, product listing, detail (+ reviews, cross/up-sell, similar), search suggestions.
    Listing uses one server-side `array-contains` per query (`search_keywords` first search term → `category_ids` →
    quick-mode `in_stock_store_ids`) + `status == 'active'` + the sort field, over a 300-doc window; mode, store stock,
    brands, price, attributes and the remaining search terms are filtered on the client, then paginated. Quick-mode
    prices/stock come from `store_stocks` (store = detected store, else `zone.default_store_id`).
  - `cart.ts` — lines in `users/{uid}/cart/{mode}_{store|central}_{variant}`; totals from `cartSummary`;
    `listCoupons`; the applied promo code is kept client-side and sent with every summary / `placeOrder`.
  - `orders.ts` — `placeOrder` (COD / wallet / online gateways), `verifyPayment`, order list/detail with **live
    `onSnapshot`** (status, timeline, rider position `rider` for the tracking map, delivery OTP from
    `orders/{id}/secret/otp`), `cancelOrder`, `reorder`, `getInvoiceUrl`, `requestReturn` (photos uploaded to Storage
    `users/{uid}/returns/…`), `submitReview`.
  - `account.ts` — profile (`users/{uid}`: only `name`/`avatar`/`language`/`fcm_tokens` are client-writable; avatar
    upload to `users/{uid}/avatar/…`), `syncProfile`, `deleteAccount`, addresses CRUD, wallet ledger +
    `walletRecharge` / `verifyWalletRecharge` / `walletWithdraw`, referrals, notifications (mark read).
  - `chats.ts` — support chat: creates `chats/{id}` + `messages` per the rules, live lists via `onSnapshot`.
  - `content.ts` — blogs, blog categories, FAQs, `pages/{slug}`.
- `payments.ts` — gateway hand-off for `placeOrder` / `walletRecharge` payloads: Razorpay Checkout, Stripe Payment
  Element, Cashfree SDK, or `redirect_url` (Paystack, PayPal, PhonePe, PayTabs, Midtrans) → return page
  (`/checkout/success?pay=1`, `/wallet?recharge_return=1`) verifies the pending payment.
- `push.ts` — optional FCM web push (`NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `public/firebase-messaging-sw.js`); the token
  is stored in `users/{uid}.fcm_tokens` and removed on logout.

## Authentication (`src/lib/auth.ts`)

- First visit: **anonymous sign-in** — guests have a real uid and their cart lives in `users/{anonUid}/cart`.
- **Phone + OTP**: invisible reCAPTCHA → `PhoneAuthProvider.verifyPhoneNumber` → the phone credential is
  **linked** to the anonymous user (`linkWithCredential`, uid and cart kept). If the number already has an account
  (`auth/credential-already-in-use`) the site signs in to it and calls `mergeGuestCart({guest_uid})`.
- **Email register**: email/password credential linked to the anonymous user (uid kept).
- **Email login**: `signInWithEmailAndPassword` + `mergeGuestCart` (linking an email credential would *create* an
  account for an unknown email, which a login form must not do).
- After every sign-in: `syncProfile({name?, email?, referral_code?, language, app:'customer'})` (creates/links
  `users/{uid}`, referral, claims) then `getIdToken(true)`. Blocked/inactive profiles are signed out.
- On reload `onAuthStateChanged` restores the profile from `users/{uid}`. Logout → `signOut` → new anonymous guest.
- Forgot password: `sendPasswordResetEmail`; change password (profile): re-authenticate + `updatePassword`.

### Firebase console setup

1. **Authentication → Sign-in method**: enable **Anonymous**, **Email/Password** and **Phone**.
2. **Authorized domains**: add the website domain(s) (`localhost` is allowed by default).
3. **SMS region policy**: allow the countries you sell in (blocked regions surface as *"SMS login is not available
   for this region yet"*). Optional test number `+91 9876543210` → `123456`.
4. Deploy rules + indexes (`cd ../firebase && npx firebase deploy --only firestore,storage`) — the listing / search /
   chat queries rely on the composite indexes in `firestore.indexes.json`.

## Structure

- `src/app` — routes: `/`, `/[zone]` (e.g. `/mumbai`), `/categories`, `/category/[slug]`, `/products?q=`,
  `/product/[slug]`, `/cart`, `/checkout`, `/checkout/success`, `/orders`, `/orders/[id]`, `/wallet`, `/refer-earn`,
  `/favorites`, `/addresses`, `/profile`, `/notifications`, `/support`, `/blog`, `/blog/[slug]`, `/faq`,
  `/pages/[slug]`, `/login`.
- `src/store` — zustand stores (location, auth profile cache, cart owner/summary, ui) persisted to localStorage.
- `src/components` — layout, home section renderer, product card/listing, checkout pieces, Leaflet maps.
- `src/lib/i18n.ts` — en / ar (RTL) / hi; `next-themes` for light/dark.

## Deploy (Firebase App Hosting)

`web/apphosting.yaml` holds the runtime config and the public `NEXT_PUBLIC_FIREBASE_*` build env with
`NEXT_PUBLIC_USE_MOCK=false` / `NEXT_PUBLIC_USE_EMULATORS=false`. **Do not remove the Firebase web config** — when it is
missing the site silently serves the in-browser demo data (`src/lib/api.ts` → `FORCE_MOCK`).

```bash
cd firebase
npx firebase apphosting:backends:create --project qwikmart-37299
#   app root directory: web   ·   live branch: main   ·   region: same as the admin backend
```

Push to the live branch (or `npx firebase apphosting:rollouts:create <backend-id> --project qwikmart-37299`), then add the
App Hosting / custom domain to **Authentication → Settings → Authorized domains** (phone reCAPTCHA, password reset).
Node 22 (`engines.node`), `next build` / `next start` via the App Hosting Next.js adapter (no `output: 'export'`).
