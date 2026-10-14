/* QwikMart — minimal FCM service worker (used only when NEXT_PUBLIC_FIREBASE_VAPID_KEY is configured).
 * Shows the `notification` part of FCM messages while the site is in the background and opens the link on click. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || 'QwikMart';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body || data.message || '',
      icon: n.image || '/favicon.ico',
      data: { link: data.link || (data.order_id ? `/orders/${data.order_id}` : '/notifications') },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(self.clients.openWindow(link));
});
