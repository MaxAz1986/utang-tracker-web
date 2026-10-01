/* Offline support: the app itself is cached; figures sync with the account when online. */
const CACHE = 'utang-v2';
const SHELL = ['./', 'index.html', 'cloud.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/bricolage-grotesque-latin-600-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'fonts/figtree-latin-400-normal.woff2', 'fonts/figtree-latin-600-normal.woff2', 'fonts/figtree-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return;              // account data: always live
  if (e.request.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('cloud.js')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));       // newest app when online
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  })));
});
