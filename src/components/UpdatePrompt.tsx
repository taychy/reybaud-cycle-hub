import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, POLL_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  // Fallback: some devices/browsers don't fire the SW "waiting" event reliably.
  // We additionally poll index.html and compare its content hash to detect new
  // deployments — if the HTML changed, we surface the update prompt too.
  const [initialHtmlHash, setInitialHtmlHash] = useState<string | null>(null);

  useEffect(() => {
    const computeHash = async (text: string) => {
      const buf = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-1", buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    let cancelled = false;

    const fetchHash = async () => {
      try {
        const res = await fetch(`/?_t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return null;
        const text = await res.text();
        return await computeHash(text);
      } catch {
        return null;
      }
    };

    (async () => {
      const hash = await fetchHash();
      if (!cancelled) setInitialHtmlHash(hash);
    })();

    const interval = setInterval(async () => {
      const hash = await fetchHash();
      if (cancelled || !hash) return;
      setInitialHtmlHash((prev) => {
        if (prev && hash !== prev) {
          setNeedRefresh(true);
        }
        return prev ?? hash;
      });
    }, HTML_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
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

  const hardReload = async () => {
    setStage("clearing-cache");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Cache cleanup failed", err);
    }

    setStage("unregistering");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
    } catch (err) {
      console.warn("SW unregister failed", err);
    }

    setStage("reloading");
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    // Small delay so users see the 100% state before the navigation kicks in.
    await new Promise((r) => setTimeout(r, 250));
    window.location.replace(url.toString());
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
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center pointer-events-none">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3 max-w-sm w-full pointer-events-auto">
        <RefreshCw className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Nueva versión disponible</p>
          <p className="text-xs text-muted-foreground">Actualizá para ver los últimos cambios</p>
        </div>
        <Button onClick={handleUpdate} size="sm" variant="gold" className="shrink-0" disabled={isUpdating}>
          Actualizar
        </Button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
