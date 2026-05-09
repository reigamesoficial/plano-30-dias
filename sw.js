/* ═══════════════════════════════════════════════════════
   EPS SERVICE WORKER — Executive Performance System
   Estratégia: Cache-First para assets, Network-First
   para fontes externas. App funciona 100% offline.
═══════════════════════════════════════════════════════ */

const CACHE_NAME = 'eps-v2.0';
const FONT_CACHE = 'eps-fonts-v1';

// Assets principais — cached no install
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './icon-192.png',
  './icon-512.png',
];

// Fontes do Google Fonts — cached separadamente
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap',
];

/* ── INSTALL: pre-cache assets ── */
self.addEventListener('install', event => {
  console.log('[EPS SW] Installing v' + CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[EPS SW] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[EPS SW] Install cache error:', err))
  );
});

/* ── ACTIVATE: limpar caches antigos ── */
self.addEventListener('activate', event => {
  console.log('[EPS SW] Activating');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== FONT_CACHE)
          .map(key => {
            console.log('[EPS SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estratégia híbrida ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Fontes: stale-while-revalidate (cache primeiro, atualiza em background)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached); // se offline, usa cache
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Assets locais: Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        // não está no cache — fetch e guarda
        return fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Offline fallback: retorna index.html para navegação
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Qualquer outra requisição: network com fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

/* ── MENSAGENS do cliente ── */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
