// No fetch interception or caches: Access remains in charge of every hub request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* still display a visible notification */ }
  const url = ['/#board', '/#clip', '/#dream-card'].includes(data.url) ? data.url : '/';
  event.waitUntil(self.registration.showNotification(data.title || 'CerebraLOS の更新', {
    body: data.body || 'hub を開いて確認してください',
    tag: data.tag || 'hub-update', data: { url },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const url = new URL(['/#board', '/#clip', '/#dream-card'].includes(path) ? path : '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  })());
});
// Subscription renewal requires Access and a visible page. Settings reconcile on launch.
