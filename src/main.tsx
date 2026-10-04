import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initFontScale } from "./components/FontSizeToggle";
import { rememberPriorityDeepLink } from "./lib/deepLinkLaunch";

initFontScale();
// Guardar la URL completa de landings públicas prioritarias (cohort/beneficio)
// antes de que cualquier relanzamiento de la app instalada la pierda.
rememberPriorityDeepLink();

// Capture PWA install prompt globally before any component mounts
(window as any).__pwaInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as any).__pwaInstallPrompt = e;
});

createRoot(document.getElementById("root")!).render(<App />);
