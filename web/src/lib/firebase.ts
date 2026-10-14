/**
 * Firebase (project qwikmart-37299) — Auth, Firestore, Functions (asia-south1), Storage.
 * Browser-only: the app is initialised lazily on first use and never during SSR.
 *
 * Emulators: NEXT_PUBLIC_USE_EMULATORS=true connects every SDK to the local Emulator Suite
 * (NEXT_PUBLIC_EMULATOR_HOST, NEXT_PUBLIC_AUTH_EMULATOR_PORT, NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
 * NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT, NEXT_PUBLIC_STORAGE_EMULATOR_PORT — defaults 127.0.0.1 / 9099 / 8080 / 5001 / 9199).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

export const FUNCTIONS_REGION = 'asia-south1';

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
const EMU_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const EMU_PORTS = {
  auth: Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT || 9099),
  firestore: Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080),
  functions: Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT || 5001),
  storage: Number(process.env.NEXT_PUBLIC_STORAGE_EMULATOR_PORT || 9199),
};

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (USE_EMULATORS ? 'qwikmart-37299' : undefined);
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (USE_EMULATORS ? 'emulator-api-key' : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (USE_EMULATORS ? `${projectId}.firebaseapp.com` : undefined),
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : undefined),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (USE_EMULATORS ? 'emulator-app-id' : undefined),
};

/** True when the NEXT_PUBLIC_FIREBASE_* web config is present (or the emulators are used). */
export const FIREBASE_CONFIGURED = !!(config.apiKey && config.authDomain && config.projectId && config.appId);

interface Sdk {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}
let sdk: Sdk | null = null;

function init(): Sdk | null {
  if (typeof window === 'undefined' || !FIREBASE_CONFIGURED) return null;
  if (sdk) return sdk;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const storage = getStorage(app);
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, `http://${EMU_HOST}:${EMU_PORTS.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMU_HOST, EMU_PORTS.firestore);
    connectFunctionsEmulator(functions, EMU_HOST, EMU_PORTS.functions);
    connectStorageEmulator(storage, EMU_HOST, EMU_PORTS.storage);
  }
  auth.useDeviceLanguage();
  sdk = { app, auth, db, functions, storage };
  return sdk;
}

/** The Firebase Auth instance, or null on the server / when Firebase is not configured. */
export function firebaseAuth(): Auth | null {
  return init()?.auth ?? null;
}

/** All SDK handles. Throws on the server or when Firebase is not configured. */
export function fb(): Sdk {
  const s = init();
  if (!s) throw new Error('Firebase is not configured.');
  return s;
}

/** Maps Firebase Auth error codes to customer-friendly messages. */
export function firebaseErrorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = (e as { code?: string })?.code || '';
  const msg = (e as { message?: string })?.message || '';
  // SMS region policy (Authentication → Settings → SMS region policy) — arrives as auth/operation-not-allowed
  if (/region enabled|SMS unable to be sent/i.test(msg)) {
    return 'SMS login is not available for this region yet. Please log in with email instead.';
  }
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/code-expired':
      return code === 'auth/code-expired' ? 'This code has expired. Please request a new OTP.' : 'Incorrect OTP. Please check the code and try again.';
    case 'auth/missing-verification-code':
      return 'Enter the 6-digit OTP.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'Enter a valid mobile number.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded. Please try again later or log in with email.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available right now. Please try another way to log in.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return 'Security check failed. Please reload the page and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please log in with the Email tab.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/requires-recent-login':
      return 'Please log in again to continue.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Cancelled.';
  }
  return code ? fallback : msg || fallback;
}
