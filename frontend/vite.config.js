import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GET-only, read-scoped API paths safe to serve stale-while-revalidate when
// offline. Never includes /internal/*, and writes (POST/PUT/DELETE) are
// never cached by the runtimeCaching method filter below regardless.
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Net Worth Tracker",
        short_name: "Net Worth",
        description: "Family net worth and portfolio tracker",
        theme_color: "#7D2E42",
        background_color: "#FAF7F2",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML) is precached for offline load automatically.
        // API GET responses for the read-scoped paths above get a
        // stale-while-revalidate cache so the last-seen data still renders
        // offline — everything else (writes, /internal/*) is left alone.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" && CACHEABLE_API_PATH_PREFIXES.some((p) => url.pathname.startsWith(p)),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-read-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor libs in their own chunk: they change far less often than
        // app code, so browsers can cache this chunk across deploys, and it
        // avoids recharts' internal re-exports landing in different chunks
        // (which Rollup warns about as a circular-dependency risk).
        manualChunks: {
          recharts: ["recharts"],
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "@supabase/supabase-js"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
