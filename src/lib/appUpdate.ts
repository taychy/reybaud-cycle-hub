export const UPDATE_QUERY_PARAM = "_v";
export const SURVEY_LAUNCH_EVENT = "reybaud:survey-launch";

export const wantsFoodSurvey = (search: string) => {
  const params = new URLSearchParams(search);
  return params.get("encuesta") === "gastronomia" || params.get("step") === "gastronomia";
};
export const requiresSurveyUpdateCheck = (pathname: string, search: string) =>
  pathname === "/viaje/encuesta-gastronomica" || (pathname === "/viaje/mi-reserva" && wantsFoodSurvey(search));

/** Whitelist launch destinations; never log a target containing a private token. */
export const getAppLaunchDestination = (targetURL: string, origin: string): string | null => {
  try {
    const target = new URL(targetURL);
    if (target.origin !== origin) return null;
    const allowed = target.pathname === "/formacion-inicial" || target.pathname.startsWith("/preinscripcion/") ||
      target.pathname === "/viaje/encuesta-gastronomica" || target.pathname === "/viaje/mi-reserva";
    return allowed ? target.pathname + target.search + target.hash : null;
  } catch { return null; }
};

/** Build id embedded in this bundle at build time (full ISO timestamp). */
export const CLIENT_BUILD_ID: string =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";

export const getCacheBustedUrl = (href = window.location.href) => {
  const url = new URL(href);
  url.searchParams.set(UPDATE_QUERY_PARAM, Date.now().toString());
  return url.toString();
};

/** Removes the technical `_v` param after a forced reload, keeping everything else. */
export const stripCacheBustParam = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(UPDATE_QUERY_PARAM)) return;
    url.searchParams.delete(UPDATE_QUERY_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* noop */
  }
};

/**
 * Service workers must never run in Lovable preview, iframes or dev:
 * they would keep serving stale builds while editing.
 */
export const isServiceWorkerAllowed = () => {
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  const blocked = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  if (blocked.some((d) => h === d || h.endsWith(`.${d}`))) return false;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
};

export const clearBrowserCaches = async () => {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  const scope = `${window.location.origin}/`;
  await Promise.all(keys.filter((key) => /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(key) && key.endsWith(scope)).map((key) => caches.delete(key)));
};

export const unregisterServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter((registration) => {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === window.location.origin && url.pathname === "/sw.js";
  }).map((registration) => registration.unregister().catch(() => false)));
};

/**
 * Returns the build id currently deployed on the server, or null if it
 * cannot be determined (offline, server error).
 * Primary source: /app-version.json (emitted on every build, never precached).
 */
export const fetchDeployedBuildId = async (): Promise<string | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`/app-version.json?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return null; // SPA fallback HTML → file missing
    const data = await res.json();
    return typeof data?.buildTime === "string" ? data.buildTime : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/** Clears caches + service workers and performs a real navigation to the current URL. */
export const forceAppHardReload = async (delayMs = 150) => {
  try {
    await clearBrowserCaches();
  } catch (error) {
    console.warn("Cache cleanup failed", error);
  }

  try {
    await unregisterServiceWorkers();
  } catch (error) {
    console.warn("Service worker unregister failed", error);
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
  window.location.replace(getCacheBustedUrl());
};

/* ─── Reload-loop guard ─── */
const ATTEMPT_KEY = "app:update-attempt";
export const MAX_AUTO_ATTEMPTS = 2;

type Attempt = { target: string; count: number };

export const readAttempt = (): Attempt | null => {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    return raw ? (JSON.parse(raw) as Attempt) : null;
  } catch {
    return null;
  }
};

export const recordAttempt = (target: string): number => {
  const prev = readAttempt();
  const count = prev?.target === target ? prev.count + 1 : 1;
  try {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ target, count }));
  } catch {
    /* noop */
  }
  return count;
};

export const clearAttempts = () => {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* noop */
  }
};

/** Decides what to do for a detected server build id. Pure, for tests. */
export const decideUpdateAction = (
  clientId: string,
  serverId: string | null,
  attempt: Attempt | null,
  maxAttempts = MAX_AUTO_ATTEMPTS,
): "none" | "auto-reload" | "blocking" => {
  if (!serverId || serverId === clientId) return "none";
  const done = attempt?.target === serverId ? attempt.count : 0;
  return done >= maxAttempts ? "blocking" : "auto-reload";
};
