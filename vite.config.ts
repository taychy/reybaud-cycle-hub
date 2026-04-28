import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Build-time constants exposed to the app (version + build timestamp)
const BUILD_TIME = new Date().toISOString();
const APP_VERSION = `${BUILD_TIME.slice(0, 10).replace(/-/g, "")}.${BUILD_TIME.slice(11, 16).replace(":", "")}`;
const APP_VERSION_PAYLOAD = JSON.stringify({ version: APP_VERSION, buildTime: BUILD_TIME });

const appVersionEndpoint = () => ({
  name: "app-version-endpoint",
  configureServer(server) {
    server.middlewares.use("/app-version.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.end(APP_VERSION_PAYLOAD);
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "app-version.json",
      source: APP_VERSION_PAYLOAD,
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    appVersionEndpoint(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["favicon.png", "favicon.ico"],
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Excluimos /~oauth y la ruta de chequeo de actualización para que
        // SIEMPRE pasen por la red (sin pasar por el SW cacheado).
        navigateFallbackDenylist: [/^\/~oauth/, /^\/__update_check/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Ciclismo Reybaud",
        short_name: "Reybaud",
        description: "Escuela de ciclismo - Entrenamientos personalizados por grupo",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
