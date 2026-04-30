const STATIC_CACHE = "repo-radar-static-v2";
const DATA_CACHE = "repo-radar-data-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./recents.html",
  "./repositories.html",
  "./repo.html",
  "./catalog.html",
  "./settings.html",
  "./styles.css",
  "./runtime.js",
  "./data.js",
  "./watchlist.js",
  "./recents.js",
  "./repositories.js",
  "./repo.js",
  "./dashboard.js",
  "./settings.js",
  "./catalog.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/discover")) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "repo-radar-refresh") {
    event.waitUntil(refreshDiscoverCache());
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    throw new Error("Network unavailable");
  }
}

async function refreshDiscoverCache() {
  const response = await fetch("/api/discover?sources=github,hn,reddit", { cache: "no-store" });
  const cache = await caches.open(DATA_CACHE);
  await cache.put("/api/discover?sources=github,hn,reddit", response.clone());
}
