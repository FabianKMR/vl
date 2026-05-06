// VL VokabelLerner Service Worker - cache app shell for offline use
const CACHE_NAME = 'vl-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,500;0,700;1,300&family=DM+Sans:wght@300;400;500&family=Inter:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install: cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL).catch(()=>{/* ignore individual failures */}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Supabase + Anthropic API: network only (live data and AI calls need to be fresh)
// - Everything else: cache-first with network fallback
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // API calls always go to network (don't cache user data or AI responses)
  if (url.includes('supabase.co') || url.includes('api.anthropic.com')) {
    return;
  }

  // App shell + fonts: cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Refresh in background (stale-while-revalidate)
        fetch(e.request).then(res => {
          if (res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res));
          }
        }).catch(()=>{});
        return cached;
      }
      return fetch(e.request).then(res => {
        if (res.ok && (url.endsWith('.html') || url.includes('fonts') || url.includes('cdn.jsdelivr'))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Network failed and not in cache: return offline page for navigation
        if (e.request.mode === 'navigate') {
          return caches.match('./') || caches.match('./index.html');
        }
      });
    })
  );
});
