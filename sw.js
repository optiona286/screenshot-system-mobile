const CACHE="btc-options-history-v2";
const SHELL=["./","./index.html","./styles.css","./history.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;if(new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request))) });
