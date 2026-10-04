/**
 * Deep links públicos prioritarios (landing de programas / preinscripción).
 *
 * Problema: con la app instalada (PWA standalone), un link externo del mail
 * puede terminar abriendo la app en su `start_url` ("/"). La pantalla "/"
 * (Login) ve la sesión activa y manda al alumno a /alumno, perdiendo
 * `cohort` y `beneficio`.
 *
 * Defensa en capas:
 * 1) Manifest con `launch_handler` → el navegador navega la ventana existente.
 * 2) `launchQueue` (si existe) → navegamos internamente a la URL lanzada.
 * 3) Al arrancar en una ruta prioritaria guardamos la URL completa; si la app
 *    se relanza en "/" en modo standalone poco después, Login la consume y
 *    vuelve a esa URL en lugar de ir al dashboard.
 */

const STORAGE_KEY = "reybaud:pending-deeplink";
const MAX_AGE_MS = 2 * 60 * 1000;

const PRIORITY_PUBLIC_PATHS = [/^\/formacion-inicial\/?$/, /^\/preinscripcion\/[^/]+\/?$/];

export const isPriorityPublicPath = (pathname: string) =>
  PRIORITY_PUBLIC_PATHS.some((re) => re.test(pathname));

/** Limpia parámetros técnicos internos (recarga por actualización). */
const cleanTarget = (url: URL) => {
  url.searchParams.delete("_v");
  return url.pathname + url.search + url.hash;
};

export const isStandaloneDisplay = () => {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
};

/** Llamar al arrancar: si la URL actual es una ruta prioritaria, la recuerda. */
export const rememberPriorityDeepLink = (href = window.location.href) => {
  try {
    const url = new URL(href);
    if (url.origin !== window.location.origin || !isPriorityPublicPath(url.pathname)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ target: cleanTarget(url), ts: Date.now() }));
  } catch {
    /* noop */
  }
};

/**
 * Devuelve (y consume) la URL prioritaria pendiente si la app fue relanzada en
 * modo standalone poco después de abrir el link. En navegador normal no hace
 * nada para no alterar el comportamiento habitual de "/".
 */
export const consumePendingDeepLink = (opts: { requireStandalone?: boolean } = {}) => {
  const { requireStandalone = true } = opts;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);
    if (requireStandalone && !isStandaloneDisplay()) return null;
    const { target, ts } = JSON.parse(raw) as { target?: string; ts?: number };
    if (!target || typeof ts !== "number" || Date.now() - ts > MAX_AGE_MS) return null;
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin || !isPriorityPublicPath(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
};

/**
 * Registra el consumidor de `window.launchQueue` (Chromium con app instalada).
 * Cuando el sistema abre la app con una URL de destino distinta de la actual,
 * navegamos internamente a esa URL completa (ruta + query params).
 */
export const registerLaunchQueueConsumer = (navigateTo: (target: string) => void) => {
  const lq = (window as any).launchQueue;
  if (!lq || typeof lq.setConsumer !== "function") return;
  try {
    lq.setConsumer((params: { targetURL?: string }) => {
      if (!params?.targetURL) return;
      try {
        const url = new URL(params.targetURL);
        if (url.origin !== window.location.origin) return;
        const target = cleanTarget(url);
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (target !== current) navigateTo(target);
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }
};
