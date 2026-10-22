import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

// Custom service worker (vite-plugin-pwa's injectManifest strategy)
// instead of its auto-generated one -- the only reason to hand-write this
// at all is the push/notificationclick handlers below, which generateSW
// has no hook for. Everything above that line reproduces exactly what the
// previous generateSW config did (see vite.config.js's own history), so
// offline/caching behavior is unchanged.

precacheAndRoute(self.__WB_MANIFEST);

// GET-only, read-scoped API paths kept in a cache so the app still shows
// data offline. Never includes /internal/*, and writes (POST/PUT/DELETE)
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

// Network first, cache only as a fallback. This used to be
// StaleWhileRevalidate, which answers from the cache immediately and
// refreshes it in the background -- so right after adding, editing or
// deleting something, the app re-read the list, got the OLD saved copy,
// and showed nothing new until the next visit. Found on the live site:
// a new holding, transaction, alert and edit all "saved" but did not show
// up until a reload. Now a fresh answer from the server always wins; the
// saved copy is used only when the network fails or is slower than 8s
// (offline, or a sleeping backend), which keeps the offline behavior.
registerRoute(
  ({ url, request }) => request.method === "GET" && CACHEABLE_API_PATH_PREFIXES.some((p) => url.pathname.startsWith(p)),
  new NetworkFirst({
    cacheName: "api-read-cache",
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 30 })],
  }),
);

// Matches registerType: "autoUpdate" in vite.config.js -- generateSW does
// this implicitly; injectManifest needs it spelled out so a new service
// worker version takes over existing open tabs immediately rather than
// waiting for them all to close first.
self.skipWaiting();
clientsClaim();

// Browsers can leave a freshly installed worker "waiting" even after the call
// above (live testing showed the new version needing two or three reloads).
// The page's update banner sends this message to make the takeover explicit.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

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
