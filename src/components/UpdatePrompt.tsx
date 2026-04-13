import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const UpdatePrompt = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleSWUpdate = (reg: ServiceWorkerRegistration) => {
      setRegistration(reg);
      setShowUpdate(true);
    };

    // Listen for the custom event dispatched by vite-plugin-pwa
    const onNeedRefresh = () => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg?.waiting) {
            handleSWUpdate(reg);
          }
        });
      }
    };

    // Check on mount if there's already a waiting SW
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) {
        handleSWUpdate(reg);
      }
      // Also listen for future updates
      reg?.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            handleSWUpdate(reg);
          }
        });
      });
    });

    // Poll for updates every 60s
    const interval = setInterval(() => {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center pointer-events-none">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3 max-w-sm w-full pointer-events-auto">
        <RefreshCw className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Nueva versión disponible</p>
          <p className="text-xs text-muted-foreground">Actualizá para ver los últimos cambios</p>
        </div>
        <Button onClick={handleUpdate} size="sm" variant="gold" className="shrink-0">
          Actualizar
        </Button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
