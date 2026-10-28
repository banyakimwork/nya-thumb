/* 앱 셸 캐시 — 오프라인 실행용. 글꼴·딤까지 넣어야 비행기 모드에서도 썸네일이 나온다. */
const CACHE = 'nyathumb-shell-v3';
const SHELL = [
  './', './index.html', './style.css', './render.js', './app.js', './manifest.json',
  './assets/dim.png', './fonts/nyjoa-B.ttf', './fonts/nyjoa-R.ttf',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* network-first: 배포로 갱신하면 바로 반영되고, 오프라인이면 캐시로 뜬다 */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
