import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initFontScale } from "./components/FontSizeToggle";

initFontScale();

// Capture PWA install prompt globally before any component mounts
(window as any).__pwaInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as any).__pwaInstallPrompt = e;
});

// Installed PWA deep links (e.g. email CTA) can be delivered through the
// Web App Launch Handler API instead of navigating the existing window.
// When that happens, force the app to the exact requested public URL and
// preserve all query params such as cohort + beneficio.
const launchQueue = (window as any).launchQueue;
if (launchQueue?.setConsumer) {
  launchQueue.setConsumer((launchParams: any) => {
    try {
      const target = launchParams?.targetURL ? new URL(launchParams.targetURL) : null;
      if (!target || target.origin !== window.location.origin) return;

      const isPublicDeepLink =
        target.pathname === "/formacion-inicial" ||
        target.pathname.startsWith("/preinscripcion/");

      if (!isPublicDeepLink) return;

      const requested = target.pathname + target.search + target.hash;
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (requested !== current) {
        window.location.replace(requested);
      }
    } catch {
      // Ignore malformed launch payloads and continue normal startup.
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
