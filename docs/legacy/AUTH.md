# Authentication — Firebase Authentication (project `qwikmart-37299`)

Laravel Sanctum is removed. **Firebase Authentication is the identity provider** for the customer app,
customer website and delivery app. The REST API (`/api/v1`) accepts only Firebase ID tokens:

```
Authorization: Bearer <Firebase ID token>      // user.getIdToken() — refreshed by the SDK, valid 1h
```

The backend verifies the token's signature against Google's public keys (issuer
`https://securetoken.google.com/qwikmart-37299`, audience `qwikmart-37299`) and maps `sub` (the
Firebase uid) to `users.firebase_uid` in MySQL. MySQL keeps the profile, role, wallet, orders, etc.

## Sign-in methods (enable in Firebase console → Authentication → Sign-in method)

| App | Methods |
|---|---|
| Customer app / website | **Phone** (OTP sent by Firebase) and **Email/Password** |
| Delivery app | **Email/Password** |
| Admin / Store / Delivery web panels | Email/Password, verified server-side against Firebase (session login) |

Demo: add the test phone number **+91 9876543210 → code 123456** under Authentication → Sign-in method →
Phone → *Phone numbers for testing*. Demo email accounts are created in Firebase automatically on first
login (legacy migration below).

## Client flow

### Customer (app + website)
1. Sign in with the Firebase SDK:
   - Phone: `verifyPhoneNumber` (Android/iOS) / `signInWithPhoneNumber` + reCAPTCHA (web) → enter code.
   - Email: `signInWithEmailAndPassword`; sign-up: `createUserWithEmailAndPassword` (+ `updateProfile(displayName)`).
   - Forgot password: `sendPasswordResetEmail` (Firebase emails the link).
2. `POST /api/v1/auth/session` with the Bearer ID token, body (all optional):
   `{ name, email, referral_code, fcm_token, guest_token }`
   → `200 { user, is_new:false }` (existing, linked) or `201 { user, is_new:true }` (created).
   Errors: `409` email already registered (see legacy login), `403` deleted/deactivated/non-customer.
3. Every API call: attach `Bearer await user.getIdToken()` (the SDK refreshes it; on `401`, force-refresh
   once with `getIdToken(true)` and retry).
4. Logout: `POST /api/v1/auth/logout` (clears the FCM token), then `signOut()`.

### Delivery app
1. Sign in: `signInWithEmailAndPassword` → `POST /api/v1/delivery/session { fcm_token }`
   → `{ user, approval_status }`; `404` = no rider account for this login → show registration;
   `403` = rejected / not a rider.
2. Register: `createUserWithEmailAndPassword(email, password)` → `POST /api/v1/delivery/register`
   (multipart, Bearer token; same fields as before **without** `password`/`email` required — email comes
   from the token) → `{ user, approval_status:"pending" }`.
3. Forgot password: `sendPasswordResetEmail`. Change password: `user.updatePassword()`.
4. Logout: `POST /api/v1/delivery/logout` then `signOut()`.

### Legacy accounts (created before Firebase — incl. demo emails)
If `signInWithEmailAndPassword` fails with `invalid-credential` / `user-not-found` / `wrong-password`, call
`POST /api/v1/auth/legacy-login { email, password }` (no token). On `200 { migrated:true }` retry the
Firebase sign-in once; on `422` show "invalid credentials". Works for customers and riders.
Phone-only customers need nothing: Firebase phone sign-in is linked by phone number automatically.

## Removed endpoints
`auth/send-otp`, `auth/verify-otp`, `auth/login`, `auth/register`, `auth/firebase-token`,
`delivery/login`, `delivery/forgot-password`, `delivery/reset-password`, `delivery/firebase-token`.
`PUT /profile` no longer accepts `password` (use Firebase `updatePassword`).

## Account linking rules (server)
1. `firebase_uid` match → that user.
2. Firebase-verified phone (`phone_number` claim) matching `country_code + phone` → link.
3. Email with `email_verified: true` matching → link. Unverified email matching an existing account → `409`
   (prevents account takeover); the owner migrates with legacy login (password proof).

## Firestore
Clients are already Firebase users, so Firestore rules check `request.auth.uid` against `user_uid` /
`delivery_boy_uid` on the documents (see `FIREBASE.md`). Panels use `GET /panel/firebase-token`.
