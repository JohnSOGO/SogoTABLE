const CACHE_NAME = "sogotable-static-v7";
const STATIC_ASSETS = [
  "/assets/intro-screen.png",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/app.js" ||
    url.pathname === "/api-client.js" ||
    url.pathname === "/color-utils.js" ||
    url.pathname === "/html-utils.js" ||
    url.pathname === "/styles.css" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/revision.json"
  ) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});
