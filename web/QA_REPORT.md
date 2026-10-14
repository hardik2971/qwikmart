# QA Report — QwikMart customer website (`web/`)

Date: 2026-10-13 · Owner: customer-clients QA · Backend: Firebase only (emulators)

## Verdict: **GO**

All E2E checks pass on the final code (120/120 on the default-port environment, see matrix). Release build, lint
and `npm audit --omit=dev` are clean. Deploy blockers B5, B6 and "no silent mock in production" are fixed.
Open items below are backend / product follow-ups, none blocks the website release.

## Environment

- Default emulator suite (auth 9099, firestore 8080, functions 5001, storage 9199) with the rebuilt
  `firebase/tools/emulator-data` (real catalog photos), `next dev` on :3000 in emulator mode (user preview).
- Earlier passes also ran a production build (`next build && next start`) against an isolated emulator set (4xxxx).
- Headless Chrome (puppeteer-core) at **390×844**; backend actions (admin/rider callables, rider location, chat replies)
  driven through the emulator REST/callable endpoints. No production project access.

## Builds

| Check | Result |
|---|---|
| `npm run build` (production env, no emulator vars) | ✅ 25 routes, Next.js 15.5.27 |
| `npm run lint` | ✅ no warnings/errors (`next lint` prints its Next 16 deprecation notice) |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** (was 2 critical + 5 high) |
| Production bundle | Firebase web config for `qwikmart-37299`; emulators only when `NEXT_PUBLIC_USE_EMULATORS=true`; no demo fallback |

## Deploy blockers

| # | Fix |
|---|---|
| B5 | Demo credentials (left panel + "Use demo credentials") render only in mock mode or when `settings/public.demo_mode === true`. Verified hidden with `demo_mode=false` (W119). |
| B6 | `next` 14.2.35 → **15.5.27**, `react`/`react-dom` 18 → **19.2.8** (Next 15 App Router), `react-leaflet` 4 → **5.0.0** (React 19), `swiper` 11 → **12.2.0** (prototype-pollution fix), `eslint-config-next` 15.5.27, `@types/react*` 19. `overrides`: `@grpc/grpc-js` 1.14.5 (Firestore pins a vulnerable 1.9.x; only used server-side by the SDK) and `postcss` → the patched devDependency 8.5.28 (Next bundles a vulnerable 8.4.31). App Router change: `src/app/[zone]/page.tsx` now awaits its `params` Promise. |
| Mock | `FORCE_MOCK` = `NEXT_PUBLIC_USE_MOCK === 'true'` or (missing config **and not** a production build). A production build without config surfaces errors (console error names the missing config) instead of silently showing demo data; auth mode follows the same flag. |

## E2E matrix (final run, default-port env)

| Area | Checks | Result |
|---|---|---|
| Location | W1 modal on first visit · W2 non-deliverable (28.61, 77.20) → "we do not deliver" · W3 Mumbai (19.076, 72.8777) deliverable · W4 redirect `/mumbai` · W6 persists on reload · W116–W118 zone picker / country switch (`/toronto`, $ currency) / back via GPS | ✅ |
| Guest | W5 anonymous Firebase guest · W24 guest cart lines in `users/{anonUid}/cart` | ✅ |
| Home | W7 products · W8 7 section types (banner slider, category grid, product sliders, grid banner, top brands, title image, heading) · W9 Quick ↔ eCommerce (layout + gradient) · W10 category tab header colour · W11 banner/home links resolve | ✅ |
| Catalog | W12–W13 sort price asc/desc (+ popularity/discount/rating/newest render) · W14 price filter · W15 subcategory · W16 multi-word search · W17 single word · W18 no-results · W19 real product photos · W20 variant switch price + out-of-stock · W21 gallery · W22 ratings breakdown · W23 similar / cross-sell rails · favourites add/remove (earlier run) | ✅ |
| Auth | W25 wrong password · W26 email login customer@gmail.com · W27 guest cart merged · W28 logout → new guest · W29 forgot password (reset OOB code issued) · W30 second customer (ananya.patel0) · W31–W32 change password + revert · W34–W40 register with `?ref=AARAV2026` (uid kept, referral record, `referred_by`, welcome notification, cart kept) · W41–W42 phone OTP +919876543210 → existing account · W43–W45 new number → new account (guest uid kept, profile) · W46 deactivated user blocked; active session ends after deactivation (earlier run) | ✅ |
| Cart | W47 server issues shown (max qty/stock) · W48 checkout blocked · W49 "+" disabled at max · W50 "−" · W51 remove · W52 min order ₹99 blocks · W53 free-delivery progress · W54 clear · W120 eCommerce max_qty_per_order (2) | ✅ |
| Coupons | W55 FREEDEL · W56 surge + zone charges priced · W57 MUMBAI99 (fixed ₹99 — note: seeded as *fixed*, not percent) · W58 VIP500 percent (capped) · W59 WALLETCASH50 cashback · W60 HAPPYHOUR / invalid / NEW100 rejected with reasons · W61 list shows per-coupon reasons | ✅ |
| Addresses | W62 form with map · W63 add with pin lat/lng · W64 edit · W65 single default · W66 delete | ✅ |
| Checkout | W67 summary priced for the selected address · W68–W69 self-pickup drops delivery/surge/zone fees + COD order · W70 COD delivery order with cashback coupon · W71 partial wallet + COD · W72 full wallet (method auto = wallet) · W73 online gateway without keys → "Selected payment method is not available.", no order created · UI totals == charged totals for every order | ✅ |
| Orders | W78 list (wallet order shows order value) · W79 detail OTP + timeline · W80 admin status change live · W81 rider assigned live · W82 tracking map rider marker moves live · W83–W84 cancel hidden + refused at out_for_delivery · W85 delivered live, OTP hidden · W86 cashback credited · W87–W88 review with photo (public URL) · W89 return with photo · W90 review photo on product page · W91 invoice PDF · W92 reorder · W93–W95 cancel allowed (received) + wallet part refunded + live | ✅ |
| Account | W74 wallet recharge without keys handled · W75–W76 withdraw · W77 history · W96 refer & earn · W97 notifications mark all read · W98–W100 support chat both ways (composer visible on mobile) · W101 profile name · W102 avatar upload | ✅ |
| i18n / theme / content | W103–W106 ar (RTL) / hi + persisted + saved to profile · W107–W108 dark / light · W109–W110 blog list/detail · W111 FAQ · W112 CMS pages (footer slugs) · W113 404 route · W114 product not found · W115 no dead `#` footer links | ✅ |

## Bugs found and fixed (website)

1. **Reload of `/[zone]` wiped the detected location** (address, distance, ETA, store) — hydration snapshot raced `useZoneFromSlug`. Now reads the persisted store; switching zones via URL also resets the old point/store (`components/home/HomeView.tsx`).
2. **Zone switch to another country left the URL on `/mumbai`** (redirect only knew the new country's zones) — `LocationModal.tsx`.
3. **Quantity could exceed `max_qty_per_order` / stock** (12 > 10) and cartSummary `issues` were never shown — steppers now cap at `min(max_qty, stock)` (`QtyStepper max`, `useCartLine`), cart/checkout show an issues box and block "Proceed"/"Place order" (`Summary.tsx` `CartIssues`, cart & checkout pages).
4. **Self-pickup total included surge + zone charges** (UI ₹555 vs charged ₹540) — `PriceRows selfPickup`, `pickupFees`.
5. **Checkout delivery charge not priced for the selected address** (UI ₹40/₹190 wallet vs charged ₹25/₹175) — checkout now runs `cartSummary` with `address_id` + `delivery_type` (`useCheckoutCart`, `api.cart(opts)`).
6. **Coupon list hid the real reason** (showed "Add ₹X more" for NEW100 / HAPPYHOUR) and teased non-applicable coupons — server `message` shown; teaser = applicable coupon or one blocked only by min order (`CouponBox.tsx`).
7. **Review photos unsupported** — photo picker in the review modal, upload to `reviews/{uid}/…` (public), download URLs sent to `submitReview`, thumbnails on the product page.
8. **Callable errors displayed with " [400]"** (Firebase JS SDK 12 appends the HTTP status) — stripped in `toApiError`.
9. **Support chat composer below the fold / under the bottom nav on mobile** — card height fits the mobile viewport.
10. **UI language not saved to `users/{uid}.language`** (used by the backend for notifications/emails) — synced on change (`saveLanguage`, `Providers.tsx`).
11. Order detail: ETA "~0 min" → "Arriving soon"; surge and zone charges split ("Surge fee" / "Other charges"); timeline labels consistent ("Preparing"); order list shows the order value for wallet-paid orders (was ₹0).
12. Footer: social icons only for configured networks, App Store badge removed (no iOS app), Google Play links to `com.qwikmart.app` (were dead `#` links).

## Backend findings (for the backend owner — `firebase/**` not edited)

1. **Search keywords drop apostrophe forms**: "lays" finds nothing for "Lay's …" (keywords are `lay`, `s`). Repro: `products where search_keywords array-contains "lays"` → 0. Suggest also indexing the apostrophe-stripped token (`lays`, `haldirams`).
2. **`submitReview` stores Storage paths verbatim** (e.g. `reviews/{uid}/x.png`); public clients need URLs. The website now sends download URLs; consider normalising paths → download URLs server-side.
3. **`cartSummary` without `address_id` prices delivery from `lat/lng` (detected point) while `placeOrder` prices from the address** — clients now pass `address_id`; consider defaulting to the user's default address so other clients can't diverge.
4. `chats.last_message` / `unread_*` sometimes lagged after `onChatMessageCreated` in an overloaded emulator (worker start failures in the log) — not reproduced on a healthy emulator; FYI.
5. `cancelOrder`, `deliverOrder`, coupons, wallet, cashback, referral, merge, invoices, returns all behaved per spec.

## Notes / not fixed

- Mixed branding: logo, metadata and OG images say **QwikMart**, while UI copy and `settings/public.app_name` say **QwikMart** ("Login to QwikMart", "Welcome to QwikMart", footer ©). Product decision — left unchanged.
- Address reverse-geocoding uses public Nominatim (rate-limited); when it fails the user types the address (map pin still saved).
- Online gateways need real keys to E2E-test the hosted checkout; without keys both checkout and wallet recharge show the server's "not available" message.
- Product "not found" pages render client-side with HTTP 200 (unknown routes return 404).
