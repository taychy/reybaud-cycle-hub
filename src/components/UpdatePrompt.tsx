import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { clearBrowserCaches, getCacheBustedUrl, unregisterServiceWorkers } from "@/lib/appUpdate";

const POLL_INTERVAL_MS = 60 * 1000; // 60s
const HTML_CHECK_INTERVAL_MS = 60 * 1000; // 60s
const FOREGROUND_DEBOUNCE_MS = 3 * 1000; // evitar tormenta de checks
const UPDATE_CHANNEL_NAME = "app-update-sync";
const UPDATE_BROADCAST_MSG = "perform-hard-reload";

type UpdateStage =
  | "idle"
  | "syncing"
  | "activating"
  | "clearing-cache"
  | "unregistering"
  | "reloading";

const STAGE_LABELS: Record<UpdateStage, string> = {
  idle: "",
  syncing: "Sincronizando pestañas abiertas…",
  activating: "Activando nueva versión…",
  "clearing-cache": "Limpiando caché…",
  unregistering: "Preparando recarga…",
  reloading: "Recargando…",
};

const STAGE_PROGRESS: Record<UpdateStage, number> = {
  idle: 0,
  syncing: 15,
  activating: 35,
  "clearing-cache": 60,
  unregistering: 80,
  reloading: 100,
};

const UpdatePrompt = () => {
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastForegroundCheckRef = useRef<number>(0);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      swRegistrationRef.current = registration;
      setInterval(() => {
        registration.update().catch(() => {});
      }, POLL_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  // Fallback: en algunos dispositivos (especialmente iOS PWA), el evento
  // "waiting" del SW no se dispara de forma confiable. Hacemos polling del
  // index.html con una URL que NO pasa por el SW (denylist) y comparamos
  // su hash. Si cambió → hay una nueva versión deployada.
  const initialHtmlHashRef = useRef<string | null>(null);

  useEffect(() => {
    const computeHash = async (text: string) => {
      const buf = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-1", buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    // Extrae SOLO los hashes determinísticos de los assets buildeados
    // (`/assets/index-XXXX.js`, `/assets/index-XXXX.css`, etc.) en lugar
    // de hashear el HTML completo. El HTML contiene markers dinámicos
    // (badge de Lovable, nonces, timestamps de preview) que cambian en
    // cada request y disparaban el cartel de "nueva versión" de forma
    // continua aunque no hubiera deploy nuevo.
    const extractAssetFingerprint = (html: string): string | null => {
      const matches = html.match(/\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9]+\.(?:js|css)/g);
      if (!matches || matches.length === 0) return null;
      return Array.from(new Set(matches)).sort().join("|");
    };

    let cancelled = false;

    const fetchHash = async () => {
      try {
        // Usamos /__update_check (en denylist del SW) para forzar que la
        // request vaya a la red real, no al SW cacheado. El servidor de
        // Lovable hace fallback SPA y devuelve el index.html actual.
        const res = await fetch(`/__update_check?_t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        if (!res.ok) return null;
        const text = await res.text();
        const fingerprint = extractAssetFingerprint(text);
        if (!fingerprint) return null;
        return await computeHash(fingerprint);
      } catch {
        return null;
      }
    };

    const checkForUpdate = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastForegroundCheckRef.current < FOREGROUND_DEBOUNCE_MS) {
        return;
      }
      lastForegroundCheckRef.current = now;

      // 1) Pedimos al SW que se actualice (dispara "waiting" si hay nueva versión)
      try {
        await swRegistrationRef.current?.update();
      } catch {
        /* noop */
      }

      // 2) Fallback por hash del HTML
      const hash = await fetchHash();
      if (cancelled || !hash) return;
      if (initialHtmlHashRef.current && hash !== initialHtmlHashRef.current) {
        setNeedRefresh(true);
      } else if (!initialHtmlHashRef.current) {
        initialHtmlHashRef.current = hash;
      }
    };

    // Primer hash de referencia + chequeo inmediato contra el servidor
    // de actualizaciones almacenado previamente en sessionStorage. Esto
    // permite detectar una nueva versión apenas se abre la app, sin
    // tener que esperar al primer ciclo de polling (60s).
    (async () => {
      const STORAGE_KEY = "app:last-html-hash";
      let storedHash: string | null = null;
      try {
        storedHash = sessionStorage.getItem(STORAGE_KEY);
      } catch {
        /* noop */
      }

      const hash = await fetchHash();
      if (cancelled || !hash) return;

      if (storedHash && storedHash !== hash) {
        // Detección inmediata: ya teníamos un hash de una sesión anterior
        // y no coincide con el actual → hay versión nueva deployada.
        initialHtmlHashRef.current = hash;
        setNeedRefresh(true);
      } else {
        initialHtmlHashRef.current = hash;
      }

      try {
        sessionStorage.setItem(STORAGE_KEY, hash);
      } catch {
        /* noop */
      }

      // Además, forzamos un update() del SW al arrancar para que dispare
      // "waiting" si ya hay una versión nueva esperando.
      try {
        await swRegistrationRef.current?.update();
      } catch {
        /* noop */
      }
    })();

    // Polling mientras la pestaña está activa
    const interval = setInterval(() => {
      checkForUpdate(true);
    }, HTML_CHECK_INTERVAL_MS);

    // Disparar check inmediato al volver de background / recuperar foco / red
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const onFocus = () => checkForUpdate();
    const onOnline = () => checkForUpdate();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [setNeedRefresh]);

  const [stage, setStage] = useState<UpdateStage>("idle");
  const isUpdating = stage !== "idle";
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isReloadingRef = useRef(false);

  // Set up a BroadcastChannel so when one tab confirms the update, every other
  // open tab on the same origin receives the order and reloads in sync.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(UPDATE_CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event?.data?.type === UPDATE_BROADCAST_MSG && !isReloadingRef.current) {
        // Another tab triggered the update — follow along.
        runUpdateSequence({ broadcast: false }).catch(() => {});
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a brand-new service worker takes control (skipWaiting + clientsClaim),
  // do a soft reload so this tab picks up the freshest assets without the user
  // having to interact with the prompt. Guarded against double-reload loops.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded || isReloadingRef.current) return;
      reloaded = true;
      window.location.replace(getCacheBustedUrl());
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const hardReload = async () => {
    setStage("clearing-cache");
    try {
      await clearBrowserCaches();
    } catch (err) {
      console.warn("Cache cleanup failed", err);
    }

    setStage("unregistering");
    try {
      await unregisterServiceWorkers();
    } catch (err) {
      console.warn("SW unregister failed", err);
    }

    setStage("reloading");
    // Small delay so users see the 100% state before the navigation kicks in.
    await new Promise((r) => setTimeout(r, 250));
    window.location.replace(getCacheBustedUrl());
  };

  const runUpdateSequence = async ({ broadcast }: { broadcast: boolean }) => {
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;

    if (broadcast && channelRef.current) {
      setStage("syncing");
      try {
        channelRef.current.postMessage({ type: UPDATE_BROADCAST_MSG });
      } catch (err) {
        console.warn("Broadcast failed", err);
      }
      // Brief pause so other tabs can pick up the message before we tear down
      // the service worker (which they may still depend on momentarily).
      await new Promise((r) => setTimeout(r, 200));
    } else {
      setStage("syncing");
    }

    setStage("activating");
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.warn("updateServiceWorker failed, forcing reload anyway", err);
    }

    await hardReload();
  };

  const handleUpdate = () => {
    if (isUpdating) return;
    runUpdateSequence({ broadcast: true }).catch((err) => {
      console.error("Update sequence failed", err);
    });
  };

  if (!needRefresh && !isUpdating) return null;

  // Full-screen blocking overlay while the update sequence is running.
  if (isUpdating) {
    const progress = STAGE_PROGRESS[stage];
    const label = STAGE_LABELS[stage];
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm"
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-label="Actualizando aplicación"
        // Block all pointer + keyboard interaction with anything underneath.
        onClickCapture={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => e.stopPropagation()}
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-[90%] flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-foreground">
              Actualizando aplicación
            </p>
            <p className="text-sm text-muted-foreground min-h-[20px]">{label}</p>
          </div>
          <Progress value={progress} className="w-full" />
          <p className="text-xs text-muted-foreground text-center">
            No cierres esta ventana. Las pestañas abiertas se recargarán juntas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed top-0 inset-x-0 z-[150] pointer-events-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="pointer-events-auto bg-primary text-primary-foreground shadow-lg border-b border-primary/40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Hay una nueva versión disponible
            </p>
            <p className="text-xs opacity-90 leading-snug">
              Para evitar errores de carga, actualizá la app.
            </p>
          </div>
          <Button
            onClick={handleUpdate}
            size="sm"
            variant="secondary"
            className="shrink-0 font-semibold"
            disabled={isUpdating}
          >
            Actualizar ahora
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePrompt;
