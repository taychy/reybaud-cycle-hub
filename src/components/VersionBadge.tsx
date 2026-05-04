import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { forceAppHardReload } from "@/lib/appUpdate";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Indicador discreto de versión y entorno (preview vs publicada).
 *
 * - Detecta el entorno por hostname:
 *   · *.lovableproject.com / id-preview-- → PREVIEW
 *   · localhost                          → DEV
 *   · resto (reybaud-app.com, *.lovable.app publicado) → LIVE
 * - Muestra la versión de build (timestamp inyectado por Vite en `__APP_VERSION__`).
 * - Tap/click sobre el badge lo expande para ver fecha completa de build.
 */
const VersionBadge = () => {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const isMobile = useIsMobile();

  const env = (() => {
    if (typeof window === "undefined") return "live" as const;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "dev" as const;
    if (host.includes("id-preview--") || host.includes("lovableproject.com"))
      return "preview" as const;
    return "live" as const;
  })();

  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => setExpanded(false), 4000);
    return () => clearTimeout(t);
  }, [expanded]);

  const envLabel =
    env === "preview" ? "PREVIEW" : env === "dev" ? "DEV" : "PUBLICADA";
  const envColor =
    env === "preview"
      ? "bg-primary text-primary-foreground"
      : env === "dev"
      ? "bg-accent text-accent-foreground"
      : "bg-secondary text-secondary-foreground border border-border";

  const buildTime = (() => {
    try {
      return new Date(__BUILD_TIME__).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return __BUILD_TIME__;
    }
  })();

  const buildTimeShort = (() => {
    try {
      return new Date(__BUILD_TIME__).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return __BUILD_TIME__;
    }
  })();

  const handleManualUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    await forceAppHardReload(150);
  };

  return (
    <div
      className="fixed bottom-2 left-2 z-[60] flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold opacity-70 hover:opacity-100 transition-opacity shadow-md backdrop-blur-sm pointer-events-auto"
      style={{ lineHeight: 1.2 }}
    >
      {isMobile ? (
        /* ── Mobile: ENV · fecha/hora · Actualizar ── */
        <>
          <span className={`px-1.5 py-0.5 rounded-full shrink-0 ${envColor}`}>
            {envLabel}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="px-1 py-0.5 text-muted-foreground whitespace-nowrap">
            {buildTimeShort}
          </span>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={handleManualUpdate}
            disabled={updating}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-primary-foreground border border-primary/50 disabled:opacity-70 shrink-0 whitespace-nowrap"
          >
            <RefreshCw className={`h-3 w-3 ${updating ? "animate-spin" : ""}`} />
            {updating ? "…" : "Actualizar"}
          </button>
        </>
      ) : (
        /* ── Desktop: ENV + versión + botón ⟳ + fecha expandible ── */
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={`Versión ${__APP_VERSION__} - entorno ${envLabel}`}
            className="flex items-center gap-1"
          >
            <span className={`px-1.5 py-0.5 rounded-full ${envColor}`}>
              {envLabel}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-background/80 text-foreground border border-border">
              v{__APP_VERSION__}
            </span>
          </button>
          <button
            type="button"
            onClick={handleManualUpdate}
            disabled={updating}
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-primary-foreground border border-primary/50 disabled:opacity-70"
          >
            <RefreshCw className={`h-3 w-3 ${updating ? "animate-spin" : ""}`} />
            {updating ? "…" : "⟳"}
          </button>
          {expanded && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-background/80 text-muted-foreground border border-border">
              {buildTime}
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default VersionBadge;
