'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import toast, { Toaster } from 'react-hot-toast';
import { isUsingMock } from '@/lib/api';
import { clearSession, ensureGuestSession, isSessionPending } from '@/lib/auth';
import { firebaseAuth } from '@/lib/firebase';
import { LANGUAGES } from '@/lib/i18n';
import { setMockContextProvider, setMockUnauthorizedHandler } from '@/lib/mock/client';
import { useAuthStore, useCartStore, useLocationStore, useUiStore } from '@/store';
import { ApiError } from '@/lib/errors';

// In-browser mock: context ("headers") read from the stores. The Firebase data layer reads the stores directly.
setMockContextProvider(() => ({
  mockToken: useAuthStore.getState().mockToken,
  language: useUiStore.getState().language,
  mode: useUiStore.getState().mode,
  zoneId: useLocationStore.getState().zone?.id ?? null,
  countryId: useLocationStore.getState().country?.id ?? null,
  guestToken: useCartStore.getState().guestToken || null,
}));

function DirectionSync() {
  const lang = useUiStore((s) => s.language);
  useEffect(() => {
    const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => {
    useCartStore.getState().ensureGuestToken();
  }, []);
  // keep users/{uid}.language in sync with the chosen UI language (signed-in Firebase customers)
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!user || isUsingMock() || user.language === lang) return;
    import('@/lib/fb/account')
      .then((m) => m.saveLanguage(lang))
      .then(() => useAuthStore.getState().setUser({ ...user, language: lang }))
      .catch(() => undefined);
  }, [user, lang]);
  return null;
}

/**
 * Session bootstrap (Firebase mode):
 *  - nobody signed in → anonymous sign-in (guest cart in users/{anonUid}/cart)
 *  - anonymous user   → guest (no cached profile)
 *  - customer         → refresh the cached profile from users/{uid} (syncProfile when the doc is missing);
 *                       inactive / deleted accounts are signed out.
 */
function AuthSync() {
  const qc = useQueryClient();
  useEffect(() => {
    if (isUsingMock()) {
      setMockUnauthorizedHandler(() => {
        if (!useAuthStore.getState().mockToken) return;
        useAuthStore.getState().clear();
        qc.clear();
        toast.error('Your session has expired. Please log in again.');
      });
      return;
    }
    const auth = firebaseAuth();
    if (!auth) return;
    let unsub = () => {};
    let alive = true;
    import('firebase/auth').then(({ onAuthStateChanged }) => {
      if (!alive) return;
      unsub = onAuthStateChanged(auth, async (fbUser) => {
        const st = useAuthStore.getState();
        if (!fbUser) {
          if (isSessionPending()) return;
          if (st.user) {
            st.clear();
            qc.clear();
          }
          await ensureGuestSession();
          return;
        }
        useCartStore.getState().setOwner(fbUser.uid);
        if (fbUser.isAnonymous) {
          if (st.user && !isSessionPending()) {
            st.clear();
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'cart' });
          }
          return;
        }
        if (isSessionPending()) return; // the login flow runs syncProfile itself
        try {
          const { profileDoc, syncProfile } = await import('@/lib/fb/account');
          const profile = (await profileDoc()) ?? (await syncProfile({})).user;
          if (profile.status === 'inactive' || profile.status === 'deleted' || profile.status === 'merged') {
            await clearSession();
            qc.clear();
            toast.error('This account is not active. Please contact support.');
            return;
          }
          useAuthStore.getState().setUser(profile);
          const { registerFcmToken } = await import('@/lib/push');
          void registerFcmToken();
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            await clearSession();
            qc.clear();
          }
        }
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [qc]);
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false}>
      <QueryClientProvider client={client}>
        <DirectionSync />
        <AuthSync />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: { borderRadius: 10, fontSize: 14, fontWeight: 500 },
            success: { iconTheme: { primary: '#0E9623', secondary: '#fff' } },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
