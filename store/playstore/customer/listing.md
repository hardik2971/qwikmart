# QwikMart — Google Play store listing (customer app)

Package `com.qwikmartapp.customer` · version **1.0.1 (versionCode 2)** · default language **English (India) – en-IN**.
Character counts below are Unicode characters as Play Console counts them (checked by script).

## App name (max 30)

```
QwikMart: Groceries in Minutes
```
30 / 30 characters. Fallback if you prefer the plain brand: `QwikMart` (8 / 30).

## Short description (max 80)

```
Groceries & essentials delivered in minutes. Track live, pay by COD or Wallet.
```
78 / 80 characters.

## Full description (max 4000)

```
QwikMart brings your neighbourhood store to your phone. Order fruits, vegetables, dairy, snacks, household and personal-care essentials and get them delivered in minutes from the QwikMart store closest to you. Need something bigger? Switch to eCommerce mode and shop a wider catalogue with standard delivery.

WHY QWIKMART
• Quick delivery from the nearest store: the app detects your delivery zone and shows the estimated delivery time and distance.
• Two ways to shop: Quick mode for daily needs, eCommerce mode for everything else, in one app and one cart experience.
• Live order tracking: follow your order from "received" to "delivered" and watch your delivery partner on the map.
• OTP-secured handover: your order is only marked delivered when you share the one-time code with the delivery partner.

SHOP THE WAY YOU LIKE
• Browse categories and sub-categories, or search with suggestions and recent searches.
• Sort by popularity, price, newest, rating or discount, and filter by category, price and brand.
• Product pages with pack sizes and variants, MRP and offer price, ratings, reviews with photos, "frequently bought together" and similar products.
• Save favourites for later.

EASY CHECKOUT
• See the full bill before you pay: item total, delivery fee, applicable charges, coupon savings.
• Apply coupons and see which offers you are close to unlocking.
• Choose home delivery or self pickup from the store.
• Save multiple addresses and pick the delivery location on a map.
• Pay with Cash on Delivery or your QwikMart Wallet. Online payment methods appear at checkout where the store has enabled them.

AFTER YOUR ORDER
• Order history with a step-by-step status timeline.
• Cancel an order before it is dispatched, or request a return for eligible items with photos.
• Rate and review products you received.
• Download your invoice and reorder past orders in one tap.
• Chat with QwikMart support right from the app.

WALLET & REWARDS
• QwikMart Wallet: see your balance and every transaction; refunds and cashback land here.
• Refer & Earn: share your referral code and earn rewards when friends join.
• Notifications for order updates and announcements.

MADE FOR YOU
• Available in English, Hindi and Arabic (with right-to-left layout).
• Light and dark theme.
• Sign in with your mobile number and OTP, or with email and password. You can browse and fill your cart as a guest.
• Manage your profile, addresses and notifications, and delete your account from the app at any time.

Delivery availability, delivery times, products, prices and payment methods depend on your location and the serving store.

Questions or feedback? Write to support@qwikmart.app.
```
2,681 / 4,000 characters.

## Release notes — 1.0.0 (max 500)

```
Welcome to QwikMart 1.0!
• Groceries and essentials delivered in minutes from your nearest store
• Quick and eCommerce shopping modes
• Live order tracking with OTP-secured delivery
• Cash on Delivery and QwikMart Wallet
• Coupons, Refer & Earn, ratings and reviews
• English, Hindi and Arabic, light and dark theme
```
315 / 500 characters.

## Category and tags

| Field | Value |
|---|---|
| App or game | App |
| Category | **Shopping** |
| Tags (pick up to 5 in Play Console → Store settings → Tags) | Grocery delivery · Online grocery · Shopping · Quick commerce / Food & drink delivery (choose the closest tags Play offers) |

## Contact details (Store settings → Store listing contact details)

| Field | Value |
|---|---|
| Email (required, public) | `support@qwikmart.app` *(placeholder — use a mailbox you monitor)* |
| Phone (optional) | leave empty or use your support line |
| Website | `https://<your-domain>/` *(placeholder — the customer website `web/` is **not hosted yet**)* |
| Privacy policy URL | `https://<your-domain>/pages/privacy` *(placeholder — the page exists in the website at `/pages/privacy`, content from Firestore `pages/privacy`; it becomes reachable once the website is deployed)* |
| Account deletion URL (Data safety) | `https://<your-domain>/profile` (signed-in users can delete the account there) **or** a dedicated page that explains how to delete the account and data — see `PLAYSTORE_GUIDE.md` §6 |

Note: the app itself still shows `support@snapbuy.app` as the support e-mail (`customer_app/lib/core/config.dart`
`supportEmail`). Change it to your real support address before the production build if it is not the one you use.

## Graphics (this folder)

| Play Console field | File | Spec |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512, 32-bit PNG |
| Feature graphic | `feature-graphic.png` | 1024 × 500, 24-bit PNG, no alpha |
| Phone screenshots (2–8) | `01-home.png` … `08-wallet.png` | 1080 × 1920 (9:16), 24-bit PNG |
| Raw captures (not for upload) | `raw/` | real app UI, live Firebase data |
