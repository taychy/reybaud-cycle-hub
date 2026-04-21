import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 30 * 1000; // 30s
const HTML_CHECK_INTERVAL_MS = 60 * 1000; // 60s

const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Periodic check: ask the browser to re-fetch the SW from the server.
      // This is what surfaces the "needRefresh" state across all devices.
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

  const [isUpdating, setIsUpdating] = useState(false);

  const hardReload = async () => {
    try {
      // 1) Clear all Cache Storage entries (Workbox precache, runtime caches, etc.)
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Cache cleanup failed", err);
    }

    try {
      // 2) Unregister all service workers as a safety net — guarantees the
      // next navigation fetches a fresh bundle from the network on every
      // browser, including iOS Safari where SW updates are flaky.
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
    } catch (err) {
      console.warn("SW unregister failed", err);
    }

    // 3) Force a network-fresh navigation. Appending a cache-busting query
    // param ensures even aggressive HTTP caches are bypassed.
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  };

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      // Activate the waiting service worker (skipWaiting + clients.claim).
      await updateServiceWorker(true);
    } catch (err) {
      console.warn("updateServiceWorker failed, forcing reload anyway", err);
    } finally {
      // Always perform the hard reload, even if SW activation failed.
      await hardReload();
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center pointer-events-none">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3 max-w-sm w-full pointer-events-auto">
        <RefreshCw className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Nueva versión disponible</p>
          <p className="text-xs text-muted-foreground">Actualizá para ver los últimos cambios</p>
        </div>
        <Button onClick={handleUpdate} size="sm" variant="gold" className="shrink-0" disabled={isUpdating}>
          {isUpdating ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
