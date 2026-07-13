// Cabinet Dealz — Service Worker
// Provides offline shell caching so the app loads even without a network.

const CACHE_NAME = "cabinet-dealz-v1";
const SHELL_URLS = ["/", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests to same origin
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // API calls: network-first, no caching
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigation responses
        if (response.ok && event.request.mode === "navigate") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
