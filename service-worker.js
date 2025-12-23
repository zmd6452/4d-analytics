const CACHE_NAME='4d-analytics-v1';
const OFFLINE_CACHE='4d-offline-v1';
const CORE_FILES=['./','./index.html','./manifest.json'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch',event=>{
  event.respondWith(
    caches.match(event.request).then(resp=>resp||fetch(event.request).catch(()=>caches.match('./index.html')))
  );
});
