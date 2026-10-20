# QwikMart Delivery — Google Play store listing (delivery partner app)

Package `com.qwikmartapp.delivery` · version **1.0.0 (versionCode 1)** · default language **English (India) – en-IN**.
Character counts below are Unicode characters as Play Console counts them (checked by script).

## App name (max 30)

```
QwikMart Delivery Partner
```
25 / 30 characters. (Launcher label stays "QwikMart Delivery".)

## Short description (max 80)

```
Deliver QwikMart orders: accept in one tap, deliver with OTP, track earnings.
```
77 / 80 characters.

## Full description (max 4000)

```
QwikMart Delivery is the app for QwikMart delivery partners. Go online when your shift starts, accept orders from stores in your zone, deliver them to customers and keep track of your earnings and cash, all in one place.

This app is for registered QwikMart delivery partners. New partners can apply in the app; accounts are activated after QwikMart approves the documents.

GET STARTED
• Sign in with your partner e-mail and password, or apply in a few steps: personal details, city and zone, vehicle, driving licence and ID proof, and bank details for payouts.
• Track the status of your application; the app opens automatically once you are approved.

YOUR SHIFT AT A GLANCE
• Go online or offline with one switch. While you are online, your location is shared with QwikMart so that nearby orders can be offered to you and customers can follow their delivery. Location sharing stops when you go offline.
• Dashboard with today's earnings, deliveries today, cash in hand and your rating.
• Instant notifications when a new order is available in your zone.

ORDERS, STEP BY STEP
• Available, Active and History tabs that update in real time.
• Accept an order in one tap, or reject it if you cannot take it.
• A guided workflow for every order: accept, mark as picked up, out for delivery, deliver.
• Store and customer details with one-tap call and Google Maps directions.
• Deliver with OTP: the order is completed only with the customer's one-time code.
• Cash on Delivery orders: confirm the cash you collected; short payments are recorded transparently.
• In-app invoice for every order.
• Return pickups assigned to you, with customer details and a "picked up" confirmation.

EARNINGS & CASH
• Earnings for today, this week and this month, with every commission listed.
• Cash collection history, order by order, including expected and collected amounts.
• Wallet with balance and transaction history; request a withdrawal to your bank account.

SUPPORT
• Chat with QwikMart support from the app, including about a specific order.
• Notifications inbox for updates from QwikMart.
• Profile, change password, English / Hindi / Arabic and light or dark theme.

Requirements: an approved QwikMart delivery partner account, a smartphone with GPS and mobile data. Location permission is needed to go online.

Questions? Write to support@qwikmart.app.
```
2,352 / 4,000 characters.

## Release notes — 1.0.0 (max 500)

```
First release of QwikMart Delivery:
• Go online and receive orders from your zone
• Accept orders and follow a guided pickup-to-drop workflow
• OTP-secured delivery and COD cash confirmation
• Earnings, cash collection and wallet withdrawals
• Return pickups, support chat and notifications
• English, Hindi and Arabic, light and dark theme
```
340 / 500 characters.

## Category and tags

| Field | Value |
|---|---|
| App or game | App |
| Category | **Business** (recommended) |
| Why not Maps & Navigation | The app does not provide navigation itself (directions open Google Maps); its core is order handling, earnings and payouts for partners — Business fits Play's category definitions and keeps it out of consumer map searches. |
| Tags | Delivery · Business · Productivity / Work management (choose the closest tags Play offers) |

Tip: as this app is only useful to approved partners, consider publishing it **unlisted-style**: keep it public but do
not promote it, or distribute it through a closed testing track / managed Google Play if you only onboard partners
yourself. A public listing is fine because partners can apply in the app.

## Contact details

| Field | Value |
|---|---|
| Email (required, public) | `support@qwikmart.app` *(placeholder)* |
| Website | `https://<your-domain>/` *(placeholder — website not hosted yet)* |
| Privacy policy URL | `https://<your-domain>/pages/privacy` *(placeholder — page exists in the website at `/pages/privacy`; reachable once the website is deployed; make sure it covers delivery-partner data: location while online, documents, bank details)* |
| Account deletion URL (Data safety) | a public page that explains how partners request deletion (e.g. `https://<your-domain>/pages/delete-account`) — **required**; see `PLAYSTORE_GUIDE.md` §6 (the rider app has no in-app "delete account" button yet) |

Note: the app shows `support@snapbuy.app` as the support e-mail (`delivery_app/lib/core/config.dart` `supportEmail`).
Change it before the production build if that is not your support mailbox.

## Graphics (this folder)

| Play Console field | File | Spec |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512, 32-bit PNG |
| Feature graphic | `feature-graphic.png` | 1024 × 500, 24-bit PNG, no alpha |
| Phone screenshots (2–8) | `01-login.png` … `08-wallet.png` | 1080 × 1920 (9:16), 24-bit PNG |
| Raw captures (not for upload) | `raw/` | real app UI, live Firebase data |
