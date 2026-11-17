import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initFontScale } from "./components/FontSizeToggle";
import { routeAppLaunchDestination, stripCacheBustParam } from "./lib/appUpdate";

initFontScale();
stripCacheBustParam();

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
      routeAppLaunchDestination(launchParams?.targetURL ?? "", window.location.origin);
    } catch {
      // Ignore malformed launch payloads and continue normal startup.
    }
  });
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
