import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  alumnoId: string;
}

interface FailedSub {
  id: string;
  plan_name: string;
  ultimo_intento_cobro_at: string | null;
}

/**
 * Persistent dashboard banner shown when an auto-renewal failed:
 *  - intentos_cobro_fallidos >= 1 (started failing)
 *  - sub is currently vencida OR auto_cobro_activo was turned off
 *
 * Disappears as soon as the student pays manually or re-authorises MP
 * (those flows reset intentos_cobro_fallidos to 0).
 */
export default function FailedRenewalBanner({ alumnoId }: Props) {
  const [failed, setFailed] = useState<FailedSub[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("suscripciones")
        .select("id, fecha_fin, estado, intentos_cobro_fallidos, auto_cobro_activo, ultimo_intento_cobro_at, planes(nombre)")
        .eq("alumno_id", alumnoId)
        .gt("intentos_cobro_fallidos", 0)
        .order("ultimo_intento_cobro_at", { ascending: false });

      if (cancelled || !data) return;

      const today = new Date().toISOString().split("T")[0];
      const list: FailedSub[] = data
        .filter((s: any) => {
          // Show banner when:
          // - Sub is vencida (period ended without pay), OR
          // - Auto-cobro was disabled by the system after repeated fails, OR
          // - Period not yet ended but charge failed >= 1 time (heads-up)
          const isOverdue = s.fecha_fin && s.fecha_fin < today;
          const autoDisabled = s.auto_cobro_activo === false;
          const failed = (s.intentos_cobro_fallidos ?? 0) >= 1;
          return failed && (isOverdue || autoDisabled || s.estado === "vencida");
        })
        .map((s: any) => ({
          id: s.id,
          plan_name: s.planes?.nombre || "tu plan",
          ultimo_intento_cobro_at: s.ultimo_intento_cobro_at,
        }));

      setFailed(list);
    })();
    return () => { cancelled = true; };
  }, [alumnoId]);

  if (failed.length === 0) return null;

  const sub = failed[0];
  const fechaTxt = sub.ultimo_intento_cobro_at
    ? new Date(sub.ultimo_intento_cobro_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long" })
    : null;

  return (
    <Link
      to="/perfil?section=suscripciones"
      className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm hover:bg-destructive/15 transition-colors"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 text-destructive" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-destructive leading-tight">
          Tu renovación automática falló{fechaTxt ? ` el ${fechaTxt}` : ""}
        </p>
        <p className="text-xs text-destructive/80 mt-0.5 truncate">
          {failed.length > 1 ? `${failed.length} planes pendientes — ` : ""}Reintentá el pago para no perder el acceso.
        </p>
      </div>
      <ArrowRight className="w-4 h-4 shrink-0 text-destructive" />
    </Link>
  );
}
