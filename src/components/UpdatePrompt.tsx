import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
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
  requiresSurveyUpdateCheck,
  SURVEY_LAUNCH_EVENT,
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

const UpdatePrompt = ({ children }: { children?: ReactNode }) => {
  const location = useLocation();
  const destination = location.pathname + location.search + location.hash;
  const surveyCheck = requiresSurveyUpdateCheck(location.pathname, location.search);
  const [checkedDestination, setCheckedDestination] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const busyRef = useRef(false);
  const lastCheckRef = useRef(0);
  const pendingRef = useRef<Promise<string | null> | null>(null);

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

      const checkedUrl = window.location.pathname + window.location.search + window.location.hash;
      if (!pendingRef.current) pendingRef.current = fetchDeployedBuildId();
      const pending = pendingRef.current;
      const serverId = await pending;
      if (pendingRef.current === pending) pendingRef.current = null;
      if (checkedUrl !== window.location.pathname + window.location.search + window.location.hash) return;
      if (!serverId) { setCheckedDestination(checkedUrl); return; }
      const action = decideUpdateAction(CLIENT_BUILD_ID, serverId, readAttempt());
      if (action === "none") {
        if (serverId === CLIENT_BUILD_ID) clearAttempts();
        setCheckedDestination(checkedUrl);
        setMode("idle");
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

  useEffect(() => {
    if (surveyCheck) check(true);
  }, [destination, surveyCheck, check]);

  useEffect(() => {
    const onLaunch = () => {
      if (!requiresSurveyUpdateCheck(window.location.pathname, window.location.search)) return;
      setCheckedDestination(null);
      check(true);
    };
    window.addEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
    return () => window.removeEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
  }, [check]);

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

  const checkingSurvey = surveyCheck && checkedDestination !== destination;
  if (mode === "idle" && !checkingSurvey) return <>{children}</>;

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
      aria-label={mode === "blocking" ? "Actualización requerida" : mode === "idle" ? "Comprobando actualización" : "Actualizando aplicación"}
      onClickCapture={(e) => {
        if (!(e.target as HTMLElement).closest("[data-update-action]")) e.stopPropagation();
      }}
      onKeyDownCapture={(e) => e.stopPropagation()}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-[90%] flex flex-col items-center gap-4 text-center">
        {mode !== "blocking" ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-base font-semibold text-foreground">{mode === "idle" ? "Comprobando actualización" : "Actualizando aplicación"}</p>
            <p className="text-sm text-muted-foreground">{mode === "idle" ? "Enseguida abrimos tu encuesta." : "Estamos cargando la última versión. No cierres esta ventana."}</p>
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
