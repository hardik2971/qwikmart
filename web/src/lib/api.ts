/**
 * QwikMart website data layer — Firebase only (docs/FIREBASE_BACKEND.md):
 *  - src/lib/fb       Firestore reads/writes (per firestore.rules), callable functions (asia-south1), Storage uploads
 *  - src/lib/mock     in-browser demo data (NEXT_PUBLIC_USE_MOCK=true, or when no Firebase web config is set)
 *
 * The UI only talks to `api` (see api-types.ts for the surface).
 */
import type { Api } from './api-types';
import { FIREBASE_CONFIGURED } from './firebase';
import { fbApi } from './fb';
import { mockApi } from './mock/client';

export type { Api } from './api-types';

/**
 * Demo mode: NEXT_PUBLIC_USE_MOCK=true, or (development builds only) the Firebase web config is missing.
 * A production build never falls back to demo data silently: without the config, Firebase calls fail visibly.
 */
export const FORCE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK === 'true' || (!FIREBASE_CONFIGURED && process.env.NODE_ENV !== 'production');

if (typeof window !== 'undefined' && !FIREBASE_CONFIGURED && !FORCE_MOCK) {
  console.error('QwikMart: the NEXT_PUBLIC_FIREBASE_* web config is missing — set it (see .env.example / apphosting.yaml).');
}

export const api: Api = FORCE_MOCK ? mockApi : fbApi;

export function isUsingMock() {
  return FORCE_MOCK;
}
