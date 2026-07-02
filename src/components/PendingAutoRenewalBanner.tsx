import { useEffect, useState } from "react";
import { RefreshCw, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  alumnoId: string;
}

interface PendingSub {
  id: string;
  plan_name: string;
}

/**
 * Banner cuando el alumno tiene una autorización de renovación automática
 * en Mercado Pago que quedó pendiente (creó preapproval pero no confirmó
 * en la pantalla de MP). Le recordamos que tiene que terminarlo.
 *
 * Complementa el mail que sale desde `create-mp-preapproval` cuando el
 * flujo cae en modo redirect.
 */
export default function PendingAutoRenewalBanner({ alumnoId }: Props) {
  const [pending, setPending] = useState<PendingSub[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("suscripciones")
        .select("id, mp_preapproval_id, mp_preapproval_status, auto_cobro_activo, estado, cancelada_at, planes(nombre)")
        .eq("alumno_id", alumnoId)
        .not("mp_preapproval_id", "is", null)
        .eq("auto_cobro_activo", false);

      if (cancelled || !data) return;

      const list: PendingSub[] = (data as any[])
        .filter((s) => {
          if (s.cancelada_at) return false;
          if (s.estado === "cancelada") return false;
          const st = s.mp_preapproval_status;
          if (!st) return false;
          return !["cancelled", "paused", "rejected", "authorized"].includes(st);
        })
        .map((s) => ({
          id: s.id,
          plan_name: s.planes?.nombre || "tu plan",
        }));

      setPending(list);
    })();
    return () => { cancelled = true; };
  }, [alumnoId]);

  if (pending.length === 0) return null;

  const sub = pending[0];

  return (
    <Link
      to="/perfil?section=suscripciones"
      className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm hover:bg-yellow-500/15 transition-colors"
    >
      <RefreshCw className="w-5 h-5 shrink-0 text-yellow-500" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-yellow-600 dark:text-yellow-400 leading-tight">
          Terminá de activar tu renovación automática
        </p>
        <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80 mt-0.5 truncate">
          {pending.length > 1 ? `${pending.length} planes pendientes — ` : `${sub.plan_name} — `}
          Falta autorizar el débito en Mercado Pago.
        </p>
      </div>
      <ArrowRight className="w-4 h-4 shrink-0 text-yellow-500" />
    </Link>
  );
}
