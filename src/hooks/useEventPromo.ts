import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export interface PromoInfo {
  ok: boolean;
  reason?: string;
  descuento_id?: string;
  codigo?: string;
  nombre?: string;
  tipo?: "porcentaje" | "fijo";
  valor?: number;
  max_usos?: number | null;
  usos_actuales?: number;
  evento_id?: string | null;
}

const storageKey = (eventId: string) => `promo:${eventId}`;

/**
 * Lee `?promo=CODE` de la URL (o sessionStorage fallback), valida contra
 * `get_promo_code` y expone la info + un `redeem()` para consumir el cupo.
 * El código sobrevive login: se guarda en sessionStorage bajo el evento.
 */
export function useEventPromo(eventId: string | undefined) {
  const [params, setParams] = useSearchParams();
  const [promo, setPromo] = useState<PromoInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const code = params.get("promo") || (eventId ? sessionStorage.getItem(storageKey(eventId)) || "" : "");

  useEffect(() => {
    if (!eventId || !code) {
      setPromo(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_promo_code", {
        _codigo: code,
        _evento_id: eventId,
      });
      if (error) {
        setPromo({ ok: false, reason: "error" });
      } else {
        const info = data as unknown as PromoInfo;
        setPromo(info);
        if (info?.ok) sessionStorage.setItem(storageKey(eventId), code);
      }
      setLoading(false);
    })();
  }, [eventId, code]);

  const redeem = useCallback(
    async (alumnoId: string) => {
      if (!eventId || !code || !alumnoId) return null;
      const { data, error } = await supabase.rpc("redeem_promo_code", {
        _codigo: code,
        _evento_id: eventId,
        _alumno_id: alumnoId,
      });
      if (error) return { ok: false, reason: "error" } as PromoInfo;
      return data as unknown as PromoInfo;
    },
    [eventId, code],
  );

  const clear = useCallback(() => {
    if (eventId) sessionStorage.removeItem(storageKey(eventId));
    const next = new URLSearchParams(params);
    next.delete("promo");
    setParams(next, { replace: true });
    setPromo(null);
  }, [eventId, params, setParams]);

  return { promo, code, loading, redeem, clear };
}
