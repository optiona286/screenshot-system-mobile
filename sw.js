const CACHE = "btc-options-history-v6-june-list";
const SHELL = ["./", "./index.html", "./data-api.js?ui=20261005-june-list-2", "./data-worker.js?ui=20261005-june-list-2", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("btc-options-history-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !SHELL.some((file) => new URL(file, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).then(async (response) => {
    if (response.ok) { const cache = await caches.open(CACHE); await cache.put(event.request, response.clone()); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
