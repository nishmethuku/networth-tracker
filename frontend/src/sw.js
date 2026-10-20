import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

// Custom service worker (vite-plugin-pwa's injectManifest strategy)
// instead of its auto-generated one -- the only reason to hand-write this
// at all is the push/notificationclick handlers below, which generateSW
// has no hook for. Everything above that line reproduces exactly what the
// previous generateSW config did (see vite.config.js's own history), so
// offline/caching behavior is unchanged.

precacheAndRoute(self.__WB_MANIFEST);

// GET-only, read-scoped API paths safe to serve stale-while-revalidate
// when offline. Never includes /internal/*, and writes (POST/PUT/DELETE)
// are never matched by the method check below regardless.
const CACHEABLE_API_PATH_PREFIXES = [
  "/holdings",
  "/dashboard",
  "/net-worth-history",
  "/transactions",
  "/exchange-rates",
  "/price-cache-status",
  "/tax-summary",
  "/alerts",
  "/milestones",
];

registerRoute(
  ({ url, request }) => request.method === "GET" && CACHEABLE_API_PATH_PREFIXES.some((p) => url.pathname.startsWith(p)),
  new StaleWhileRevalidate({
    cacheName: "api-read-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 30 })],
  }),
);

// Matches registerType: "autoUpdate" in vite.config.js -- generateSW does
// this implicitly; injectManifest needs it spelled out so a new service
// worker version takes over existing open tabs immediately rather than
// waiting for them all to close first.
self.skipWaiting();
clientsClaim();

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Net Worth Tracker", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Net Worth Tracker", {
      body: data.body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
