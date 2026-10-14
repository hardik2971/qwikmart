/**
 * Optional FCM web push. Enabled only when NEXT_PUBLIC_FIREBASE_VAPID_KEY is set, the browser supports it and the
 * customer has already granted notification permission (we never prompt on page load). The token is stored in
 * users/{uid}.fcm_tokens (a client-writable field) and removed again on logout.
 */
import { USE_EMULATORS, fb } from './firebase';

const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
const KEY = 'sb-fcm-token';

export async function registerFcmToken(opts: { prompt?: boolean } = {}): Promise<string | null> {
  if (!VAPID || USE_EMULATORS || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return null;
  try {
    const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    if (Notification.permission !== 'granted') {
      if (!opts.prompt || (await Notification.requestPermission()) !== 'granted') return null;
    }
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(getMessaging(fb().app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) return null;
    const { setFcmToken } = await import('./fb/account');
    await setFcmToken(token, true);
    localStorage.setItem(KEY, token);
    return token;
  } catch {
    return null;
  }
}

export async function forgetFcmToken() {
  let token: string | null = null;
  try {
    token = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  if (!token) return;
  const { setFcmToken } = await import('./fb/account');
  await setFcmToken(token, false).catch(() => undefined);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
