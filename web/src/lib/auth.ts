/**
 * Customer authentication — Firebase Authentication only (docs/FIREBASE_BACKEND.md).
 *
 *  - Guests are signed in **anonymously** on their first visit; their cart lives in users/{anonUid}/cart.
 *  - Phone OTP: the verified phone credential is **linked** to the anonymous user (`linkWithCredential`), so the uid —
 *    and the cart — are kept. If the number already belongs to an account (`auth/credential-already-in-use`) we sign
 *    in to that account instead and call `mergeGuestCart({guest_uid})`.
 *  - Email registration links the new email/password credential to the anonymous user (uid kept).
 *  - Email login signs in to the existing account and merges the guest cart (`linkWithCredential` would *create* an
 *    account for an unknown email, which a login form must never do).
 *  - After every sign-in: `syncProfile` callable (creates/links users/{uid}, referral, claims) + `getIdToken(true)`.
 *
 * Mock mode (NEXT_PUBLIC_USE_MOCK=true or no Firebase config) signs in against the in-browser mock instead —
 * demo OTP 123456, customer@gmail.com / 123456.
 */
import type { AuthCredential, RecaptchaVerifier, User as FirebaseUser } from 'firebase/auth';
import { FORCE_MOCK } from './api';
import { ApiError } from './errors';
import { firebaseAuth, firebaseErrorMessage } from './firebase';
import { mockAuth } from './mock/client';
import type { User } from './types';
import { useAuthStore, useCartStore } from '@/store';

export interface SessionResult {
  user: User;
  is_new: boolean;
}

/** True while a sign-in is in progress — the auth-state listener must not race syncProfile. */
let sessionPending = false;
export const isSessionPending = () => sessionPending;

export function authMode(): 'firebase' | 'mock' {
  return FORCE_MOCK ? 'mock' : 'firebase';
}

/** Error with a message that is safe to show to the customer. */
export class AuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const fbModule = () => import('firebase/auth');

function requireAuth() {
  const auth = firebaseAuth();
  if (!auth) throw new AuthError('Login is not available right now. Please try again later.');
  return auth;
}

function wrap(e: unknown): never {
  if (e instanceof AuthError || e instanceof ApiError) throw e;
  const code = (e as { code?: string })?.code;
  throw new AuthError(firebaseErrorMessage(e), code);
}

const ALREADY_USED = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'];

/* ------------------------------------------------------------------ */
/* Guest session                                                       */
/* ------------------------------------------------------------------ */

/** Anonymous sign-in for guests (idempotent). */
export async function ensureGuestSession(): Promise<void> {
  if (authMode() === 'mock') return;
  const { ensureUser } = await import('./fb/core');
  await ensureUser().catch(() => undefined);
}

/** The anonymous uid currently holding the guest cart (null when signed in or in mock mode). */
async function guestUid(): Promise<string | null> {
  const auth = firebaseAuth();
  if (!auth) return null;
  await auth.authStateReady();
  return auth.currentUser?.isAnonymous ? auth.currentUser.uid : null;
}

/* ------------------------------------------------------------------ */
/* Session (syncProfile)                                               */
/* ------------------------------------------------------------------ */

async function establishSession(fbUser: FirebaseUser, extra: { name?: string; email?: string; referral_code?: string } = {}, guest: string | null = null): Promise<SessionResult> {
  const { syncProfile } = await import('./fb/account');
  const { mergeGuestCart } = await import('./fb/cart');
  const { resetFavorites } = await import('./fb/favorites');
  try {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
    const res = await syncProfile({ ...extra, language: lang });
    if (res.blocked || res.user.status === 'inactive') throw new AuthError('This account has been disabled. Please contact support.', 'session/blocked');
    await fbUser.getIdToken(true); // pick up custom claims set by syncProfile
    if (guest && guest !== fbUser.uid) await mergeGuestCart(guest).catch(() => undefined);
    resetFavorites();
    useAuthStore.getState().setUser(res.user);
    useCartStore.getState().setOwner(fbUser.uid);
    return { user: res.user, is_new: res.is_new };
  } catch (e) {
    // Don't leave a Firebase session without a QwikMart profile behind.
    const { signOut } = await fbModule();
    await signOut(requireAuth()).catch(() => {});
    await ensureGuestSession();
    throw e;
  }
}

async function withSession<T>(fn: () => Promise<T>): Promise<T> {
  sessionPending = true;
  try {
    return await fn();
  } finally {
    sessionPending = false;
  }
}

/** Mock sign-in: store the mock session and merge the guest cart in the mock. */
async function finishMock(res: { token: string; user: User; is_new?: boolean }): Promise<SessionResult> {
  useAuthStore.getState().setMockSession(res.token, res.user);
  const guest = useCartStore.getState().guestToken;
  if (guest) await mockAuth.syncCart(guest).catch(() => {});
  useCartStore.getState().resetGuestToken();
  return { user: res.user, is_new: !!res.is_new };
}

/**
 * Signs in with `cred`, keeping the guest uid when possible: link to the anonymous user, else (credential already
 * belongs to an account) sign in to that account and let establishSession merge the guest cart.
 */
async function linkOrSignIn(cred: AuthCredential, fallback: (e: unknown) => AuthCredential | null): Promise<{ user: FirebaseUser; guest: string | null }> {
  const auth = requireAuth();
  const { linkWithCredential, signInWithCredential } = await fbModule();
  const guest = await guestUid();
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const r = await linkWithCredential(current, cred);
      return { user: r.user, guest: null };
    } catch (e) {
      const code = (e as { code?: string })?.code || '';
      if (!ALREADY_USED.includes(code)) wrap(e);
      const again = fallback(e) ?? cred;
      try {
        const r = await signInWithCredential(auth, again);
        return { user: r.user, guest };
      } catch (e2) {
        wrap(e2);
      }
    }
  }
  try {
    const r = await signInWithCredential(auth, cred);
    return { user: r.user, guest };
  } catch (e) {
    wrap(e);
  }
}

/* ------------------------------------------------------------------ */
/* Phone OTP                                                           */
/* ------------------------------------------------------------------ */


let verifier: RecaptchaVerifier | null = null;

function resetVerifier() {
  try {
    verifier?.clear();
  } catch {
    /* ignore */
  }
  verifier = null;
}

export type PhoneConfirmation = { verificationId: string } | { mock: true; phone: string; country_code: string };

/**
 * Sends the OTP. `containerId` is an (empty) element that hosts the invisible reCAPTCHA widget.
 * In mock mode nothing is sent — the demo code is 123456.
 */
export async function sendPhoneOtp(countryCode: string, phone: string, containerId: string): Promise<PhoneConfirmation> {
  if (authMode() === 'mock') return { mock: true, phone, country_code: countryCode };
  const auth = requireAuth();
  const { RecaptchaVerifier, PhoneAuthProvider } = await fbModule();
  try {
    if (!verifier) {
      // fresh child element each time — reCAPTCHA cannot render twice into the same node
      const host = document.getElementById(containerId);
      if (!host) throw new AuthError('Security check failed to load. Please reload the page.');
      host.innerHTML = '';
      const el = document.createElement('div');
      host.appendChild(el);
      verifier = new RecaptchaVerifier(auth, el, { size: 'invisible' });
    }
    const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(`${countryCode}${phone}`, verifier);
    return { verificationId };
  } catch (e) {
    resetVerifier();
    wrap(e);
  }
}

export async function confirmPhoneOtp(
  confirmation: PhoneConfirmation,
  code: string,
  extra: { name?: string; referral_code?: string } = {},
): Promise<SessionResult> {
  if ('mock' in confirmation) {
    return finishMock(await mockAuth.otp({ phone: confirmation.phone, country_code: confirmation.country_code, otp: code, ...extra }));
  }
  const { PhoneAuthProvider } = await fbModule();
  return withSession(async () => {
    const cred = PhoneAuthProvider.credential(confirmation.verificationId, code);
    const { user, guest } = await linkOrSignIn(cred, (e) => PhoneAuthProvider.credentialFromError(e as never));
    resetVerifier();
    return establishSession(user, { name: extra.name || undefined, referral_code: extra.referral_code || undefined }, guest);
  });
}

/* ------------------------------------------------------------------ */
/* Email / password                                                    */
/* ------------------------------------------------------------------ */

const BAD_PASSWORD = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials'];

/** Email sign-in. Accounts imported from MySQL exist in Firebase Auth with their original (bcrypt) passwords. */
export async function signInWithEmail(email: string, password: string): Promise<SessionResult> {
  if (authMode() === 'mock') return finishMock(await mockAuth.login(email.includes('@') ? { email, password } : { phone: email, password }));
  if (!email.includes('@')) throw new AuthError('Enter your email address (or use the Phone + OTP tab).');
  const auth = requireAuth();
  const { signInWithEmailAndPassword } = await fbModule();
  return withSession(async () => {
    const guest = await guestUid();
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      wrap(e);
    }
    return establishSession(cred.user, { email: email.trim() }, guest);
  });
}

export async function registerWithEmail(body: { name: string; email: string; password: string; referral_code?: string }): Promise<SessionResult> {
  if (authMode() === 'mock') return finishMock(await mockAuth.register(body));
  const auth = requireAuth();
  const { EmailAuthProvider, createUserWithEmailAndPassword, linkWithCredential, updateProfile } = await fbModule();
  return withSession(async () => {
    let user: FirebaseUser;
    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        // keep the guest uid (and cart): the anonymous user becomes the new email account
        user = (await linkWithCredential(current, EmailAuthProvider.credential(body.email.trim(), body.password))).user;
      } else {
        user = (await createUserWithEmailAndPassword(auth, body.email.trim(), body.password)).user;
      }
      await updateProfile(user, { displayName: body.name });
    } catch (e) {
      wrap(e);
    }
    return establishSession(user, { name: body.name, email: body.email.trim(), referral_code: body.referral_code || undefined });
  });
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (authMode() === 'mock') return; // nothing to send in demo mode
  if (!email.includes('@')) throw new AuthError('Enter your email address first.');
  const { sendPasswordResetEmail } = await fbModule();
  try {
    await sendPasswordResetEmail(requireAuth(), email.trim());
  } catch (e) {
    // don't reveal whether an account exists
    if ((e as { code?: string })?.code === 'auth/user-not-found') return;
    wrap(e);
  }
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/** True when the signed-in Firebase user has an email/password credential. */
export async function hasPasswordLogin(): Promise<boolean> {
  const auth = firebaseAuth();
  if (!auth || authMode() === 'mock') return false;
  await auth.authStateReady();
  return !!auth.currentUser?.providerData.some((p) => p.providerId === 'password');
}

export async function changePassword(current: string, next: string): Promise<void> {
  const auth = requireAuth();
  const u = auth.currentUser;
  if (!u || !u.email) throw new AuthError('Please log in again to change your password.');
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await fbModule();
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  } catch (e) {
    const code = (e as { code?: string })?.code || '';
    if (BAD_PASSWORD.includes(code)) throw new AuthError('Your current password is incorrect.', code);
    wrap(e);
  }
  try {
    await updatePassword(u, next);
  } catch (e) {
    wrap(e);
  }
}

/** Ends the local session (store + Firebase) and starts a fresh guest session. */
export async function clearSession() {
  useAuthStore.getState().clear();
  const auth = firebaseAuth();
  if (auth?.currentUser && !auth.currentUser.isAnonymous) {
    const { signOut } = await fbModule();
    await signOut(auth).catch(() => {});
  }
  if (authMode() === 'firebase') {
    const [{ setPromoCode }, { resetFavorites }] = await Promise.all([import('./fb/cart'), import('./fb/favorites')]);
    setPromoCode(null);
    resetFavorites();
    await ensureGuestSession();
  }
}

/** Logout: drop this browser's FCM token from the profile, then Firebase signOut → new guest session. */
export async function logout() {
  if (authMode() === 'mock') {
    await mockAuth.logout().catch(() => {});
  } else {
    const { forgetFcmToken } = await import('./push');
    await forgetFcmToken().catch(() => {});
  }
  await clearSession();
  useCartStore.getState().resetGuestToken();
}
