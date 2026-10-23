import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest (a hand-written src/sw.js, bundled and given its
      // precache manifest at build time) instead of the default
      // generateSW -- the only reason for a custom service worker at all
      // is its push/notificationclick handlers, which generateSW has no
      // hook for. The app-shell precaching and API GET stale-while-
      // revalidate caching that generateSW used to set up here now live
      // directly in src/sw.js, unchanged in behavior.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Net Worth Tracker",
        short_name: "Net Worth",
        description: "Family net worth and portfolio tracker",
        theme_color: "#7D2E42",
        background_color: "#FAF7F2",
        display: "standalone",
        id: "/",
        scope: "/",
        start_url: "/",
        orientation: "portrait",
        categories: ["finance", "productivity"],
        shortcuts: [
          { name: "Add holding", url: "/add-holding", icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }] },
          { name: "Budget", url: "/budget", icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }] },
          { name: "Year in Review", url: "/review", icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }] },
        ],
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        // vite-plugin-pwa's own dev-mode service worker intercepts too
        // much (including non-GET requests) in a way that breaks normal
        // API calls during `npm run dev`; the production build is
        // unaffected, same as this project's prior generateSW setup,
        // which only ever ran for real in a production/preview build.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
      devOptions: {
        enabled: false,
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
        manualChunks(id) {
          // Rollup's shared helpers must not land in the charts chunk, or every page
          // would download the whole chart library just to get them.
          if (id.includes("commonjsHelpers") || id.includes("\0")) return "vendor";
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(recharts|recharts-scale|victory-vendor|d3-[^/]+|internmap|decimal\.js-light|react-smooth|fast-equals|eventemitter3|tiny-invariant|clsx|lodash)\//.test(id)) return "recharts";
          if (/node_modules\/framer-motion\//.test(id)) return "motion";
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run|@tanstack|@supabase)\//.test(id)) return "vendor";
          return undefined;
        },
      },
    },
  },
});
