'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC39HUD-GT9zC2wtKBkz4mRgXspm40Vzvw',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'qwikmart-37299.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'qwikmart-37299',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'qwikmart-37299.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1054065019133',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1054065019133:web:c7bbf751cf29d67a4a9694',
};

export const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'asia-south1';
export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
export const EMU_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
// Optional per-emulator port overrides (defaults = firebase/firebase.json).
export const EMU_PORT = {
  auth: Number(process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT) || 9099,
  firestore: Number(process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT) || 8080,
  functions: Number(process.env.NEXT_PUBLIC_EMULATOR_FUNCTIONS_PORT) || 5001,
  storage: Number(process.env.NEXT_PUBLIC_EMULATOR_STORAGE_PORT) || 9199,
};

let _app: FirebaseApp;
let _auth: Auth;
let _db: Firestore;
let _fns: Functions;
let _storage: FirebaseStorage;
let _connected = false;

function init() {
  if (_app) return;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  _fns = getFunctions(_app, FUNCTIONS_REGION);
  _storage = getStorage(_app);
  if (USE_EMULATORS && !_connected && typeof window !== 'undefined') {
    _connected = true;
    connectAuthEmulator(_auth, `http://${EMU_HOST}:${EMU_PORT.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(_db, EMU_HOST, EMU_PORT.firestore);
    connectFunctionsEmulator(_fns, EMU_HOST, EMU_PORT.functions);
    connectStorageEmulator(_storage, EMU_HOST, EMU_PORT.storage);
  }
}

export function app() { init(); return _app; }
export function auth() { init(); return _auth; }
export function db() { init(); return _db; }
export function functions() { init(); return _fns; }
export function storage() { init(); return _storage; }
