/* Minimal service worker: cache the app shell only, never FPL API JSON. */
const CACHE = "fpl-edge-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/logo.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache live API or Next data routes — always network for freshness.
  if (
    url.pathname.startsWith("/api") ||
    url.hostname.includes("premierleague.com") ||
    url.pathname.includes("_next/data")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (url.pathname === "/" ||
            url.pathname.endsWith(".webmanifest") ||
            url.pathname.endsWith(".png") ||
            url.pathname.endsWith(".ico") ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".css"))
        ) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const shell = await caches.match("/");
        return (
          shell ||
          new Response("FPL Edge needs a network connection for live data.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
  );
});
