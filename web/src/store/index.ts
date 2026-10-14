'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Country, Id, Mode, Store as SbStore, User, Zone } from '@/lib/types';

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const zoneSlug = (z?: Pick<Zone, 'name' | 'slug'> | null) =>
  z ? z.slug || z.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';

/* ---------------- Location ---------------- */

export interface LocationState {
  country: Country | null;
  zone: Zone | null;
  store: SbStore | null;
  lat: number | null;
  lng: number | null;
  address: string;
  distanceKm: number | null;
  deliveryMinutes: number | null;
  chosen: boolean;
  setCountry: (c: Country) => void;
  setLocation: (p: Partial<Omit<LocationState, 'setLocation' | 'setCountry'>>) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      country: null,
      zone: null,
      store: null,
      lat: null,
      lng: null,
      address: '',
      distanceKm: null,
      deliveryMinutes: null,
      chosen: false,
      setCountry: (country) => {
        set({ country });
        setCookie('sb_country', String(country.id));
      },
      setLocation: (p) => {
        set({ ...p, chosen: true });
        const zone = p.zone ?? get().zone;
        if (zone) {
          setCookie('sb_zone', String(zone.id));
          setCookie('sb_zone_slug', zoneSlug(zone));
        }
      },
    }),
    { name: 'sb-location', storage: createJSONStorage(() => localStorage) },
  ),
);

/* ---------------- Auth ---------------- */

/**
 * Signed-in (non-anonymous) customer. The credential lives in Firebase Authentication (its SDK persists and
 * refreshes the session) — this store only caches the users/{uid} profile so the UI renders instantly, and holds
 * the session token of the in-browser mock (mock mode only). Anonymous guests have user = null.
 */
interface AuthState {
  user: User | null;
  mockToken: string | null;
  setUser: (user: User) => void;
  setMockSession: (token: string, user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      mockToken: null,
      setUser: (user) => {
        set({ user });
        setCookie('sb_auth', '1');
      },
      setMockSession: (mockToken, user) => {
        set({ mockToken, user });
        setCookie('sb_auth', '1');
      },
      clear: () => {
        set({ user: null, mockToken: null });
        setCookie('sb_auth', '', -1);
      },
    }),
    {
      name: 'sb-auth',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, mockToken: s.mockToken }),
      // v1 stored a Sanctum token — drop it; the Firebase session (if any) restores the user.
      migrate: (persisted, version) => {
        if (version < 2) return { user: null, mockToken: null };
        return persisted as { user: User | null; mockToken: string | null };
      },
    },
  ),
);

/* ---------------- Cart (owner + header summary) ---------------- */

/**
 * `owner` is the Firebase uid holding the cart (anonymous guest or signed-in customer); `guestToken` identifies the
 * guest cart of the in-browser mock.
 */
interface CartState {
  guestToken: string;
  owner: string;
  count: number;
  total: number;
  setOwner: (uid: string) => void;
  ensureGuestToken: () => string;
  resetGuestToken: () => void;
  setSummary: (count: number, total: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      guestToken: '',
      owner: '',
      count: 0,
      total: 0,
      ensureGuestToken: () => {
        let t = get().guestToken;
        if (!t) {
          t = uuid();
          set({ guestToken: t });
        }
        return t;
      },
      resetGuestToken: () => set({ guestToken: uuid() }),
      setOwner: (owner) => {
        if (get().owner !== owner) set({ owner, count: 0, total: 0 });
      },
      setSummary: (count, total) => set({ count, total }),
    }),
    { name: 'sb-cart', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ guestToken: s.guestToken, count: s.count, total: s.total }) },
  ),
);

/* ---------------- UI ---------------- */

export type Lang = 'en' | 'ar' | 'hi';

interface UiState {
  mode: Mode;
  language: Lang;
  cookieConsent: 'accepted' | 'declined' | null;
  locationModalOpen: boolean;
  activeCategoryId: Id | null;
  headerColor: string | null;
  setMode: (m: Mode) => void;
  setLanguage: (l: Lang) => void;
  setCookieConsent: (c: 'accepted' | 'declined') => void;
  openLocationModal: (open?: boolean) => void;
  setActiveCategory: (id: Id | null, headerColor?: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mode: 'quick',
      language: 'en',
      cookieConsent: null,
      locationModalOpen: false,
      activeCategoryId: null,
      headerColor: null,
      setMode: (mode) => {
        set({ mode, activeCategoryId: null, headerColor: null });
        setCookie('sb_mode', mode);
      },
      setLanguage: (language) => {
        set({ language });
        setCookie('sb_lang', language);
      },
      setCookieConsent: (cookieConsent) => set({ cookieConsent }),
      openLocationModal: (open = true) => set({ locationModalOpen: open }),
      setActiveCategory: (activeCategoryId, headerColor = null) => set({ activeCategoryId, headerColor }),
    }),
    {
      name: 'sb-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode, language: s.language, cookieConsent: s.cookieConsent }),
    },
  ),
);
