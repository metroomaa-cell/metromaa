/* SECRATE Web Push Service Worker */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'SECRATE',
      body: event.data ? event.data.text() : 'আপনার জন্য নতুন আপডেট রয়েছে।',
    };
  }

  const title = payload.title || 'SECRATE';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo_metrroma.png',
    badge: payload.badge || payload.icon || '/logo_metrroma.png',
    tag: payload.tag || 'secrate-notification',
    renotify: true,
    vibrate: [160, 80, 160],
    data: {
      url: payload.url || '/',
    },
  };

  if (payload.image) {
    options.image = payload.image;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
