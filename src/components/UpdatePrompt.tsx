import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CLIENT_BUILD_ID,
  clearAttempts,
  decideUpdateAction,
  fetchDeployedBuildId,
  forceAppHardReload,
  isServiceWorkerAllowed,
  readAttempt,
  recordAttempt,
  stripCacheBustParam,
  unregisterServiceWorkers,
} from "@/lib/appUpdate";

/**
 * Actualización forzada global (todos los roles y dispositivos).
 *
 * - Compara el build embebido en este bundle (__BUILD_TIME__) con
 *   /app-version.json del servidor, al cargar, cada 5 min y al volver
 *   a la pestaña / recuperar red.
 * - Si difieren: limpia cachés, desregistra el service worker y recarga.
 * - Guard anti-loop: máx. 2 recargas automáticas por versión destino;
 *   después muestra un bloqueo "Actualización requerida".
 * - La sesión (localStorage) no se toca.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FOREGROUND_DEBOUNCE_MS = 30 * 1000;
const SW_UPDATE_INTERVAL_MS = 30 * 60 * 1000;

type Mode = "idle" | "updating" | "blocking";

const UpdatePrompt = () => {
  const [mode, setMode] = useState<Mode>("idle");
  const busyRef = useRef(false);
  const lastCheckRef = useRef(0);

  const runUpdate = useCallback(async (target: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    recordAttempt(target);
    setMode("updating");
    try {
      await forceAppHardReload(300);
    } catch {
      busyRef.current = false;
      setMode("blocking");
    }
    // Si la navegación no ocurre en 15s, bloqueamos.
    setTimeout(() => {
      busyRef.current = false;
      setMode("blocking");
    }, 15000);
  }, []);

  const check = useCallback(
    async (force = false) => {
      if (busyRef.current) return;
      const now = Date.now();
      if (!force && now - lastCheckRef.current < FOREGROUND_DEBOUNCE_MS) return;
      lastCheckRef.current = now;

      const serverId = await fetchDeployedBuildId();
      if (!serverId) return;
      const action = decideUpdateAction(CLIENT_BUILD_ID, serverId, readAttempt());
      if (action === "none") {
        if (serverId === CLIENT_BUILD_ID) clearAttempts();
        return;
      }
      if (action === "blocking") {
        setMode("blocking");
        return;
      }
      runUpdate(serverId);
    },
    [runUpdate],
  );

  // Service worker: registrar solo en producción real; en preview/dev limpiarlo.
  useEffect(() => {
    stripCacheBustParam();
    if (!("serviceWorker" in navigator)) return;
    if (!isServiceWorkerAllowed()) {
      unregisterServiceWorkers().catch(() => {});
      return;
    }
    let interval: number | undefined;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onRegisteredSW(_url, registration) {
            if (!registration) return;
            interval = window.setInterval(() => registration.update().catch(() => {}), SW_UPDATE_INTERVAL_MS);
          },
          // Un SW nuevo esperando = hay deploy nuevo: verificamos y forzamos.
          onNeedRefresh() {
            check(true);
          },
          onRegisterError(error) {
            console.error("SW registration error", error);
          },
        });
      })
      .catch(() => {});
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [check]);

  // Chequeo al cargar, periódico y al volver al foco/red.
  useEffect(() => {
    check(true);
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") check(true);
    }, CHECK_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    const onFocus = () => check();
    // Chunk viejo inexistente tras un deploy → forzar chequeo inmediato.
    const onPreloadError = (e: Event) => {
      e.preventDefault?.();
      check(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, [check]);

  if (mode === "idle") return null;

  const manualUpdate = () => {
    busyRef.current = true;
    setMode("updating");
    forceAppHardReload(300).catch(() => {
      busyRef.current = false;
      setMode("blocking");
    });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={mode === "blocking" ? "Actualización requerida" : "Actualizando aplicación"}
      onClickCapture={(e) => {
        if (!(e.target as HTMLElement).closest("[data-update-action]")) e.stopPropagation();
      }}
      onKeyDownCapture={(e) => e.stopPropagation()}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-[90%] flex flex-col items-center gap-4 text-center">
        {mode === "updating" ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-base font-semibold text-foreground">Actualizando aplicación</p>
            <p className="text-sm text-muted-foreground">Estamos cargando la última versión. No cierres esta ventana.</p>
          </>
        ) : (
          <>
            <AlertTriangle className="w-10 h-10 text-primary" />
            <p className="text-base font-semibold text-foreground">Actualización requerida</p>
            <p className="text-sm text-muted-foreground">
              Hay una versión nueva de la app. Para seguir usándola, actualizá ahora. Tu sesión se mantiene.
            </p>
            <Button data-update-action onClick={manualUpdate} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" /> Actualizar ahora
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default UpdatePrompt;
