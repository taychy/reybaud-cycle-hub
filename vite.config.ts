import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
        skipWaiting: false,
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
