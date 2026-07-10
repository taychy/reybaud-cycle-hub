import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BillingCounts = {
  cobrado: number;
  sinCae: number;
  emitido: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Conteos globales exactos para el stepper de Facturación.
 * - Cobrado: pagos confirmados en `facturacion_cola` sin factura emitida (estado 'pendiente').
 * - Sin CAE: `facturas` creadas pero aún no autorizadas por AFIP (sin_factura | error | emitida sin cae).
 * - Emitido: `facturas` emitidas con CAE.
 */
export function useBillingCounts(refreshKey: number = 0): BillingCounts {
  const [cobrado, setCobrado] = useState(0);
  const [sinCae, setSinCae] = useState(0);
  const [emitido, setEmitido] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [cobradoRes, sinFacturaRes, errorRes, emitidaSinCaeRes, emitidoRes] = await Promise.all([
      supabase
        .from("facturacion_cola" as any)
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente"),
      supabase
        .from("facturas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "sin_factura"),
      supabase
        .from("facturas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "error"),
      supabase
        .from("facturas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "emitida")
        .is("cae", null),
      supabase
        .from("facturas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "emitida")
        .not("cae", "is", null),
    ]);

    setCobrado(cobradoRes.count ?? 0);
    setSinCae((sinFacturaRes.count ?? 0) + (errorRes.count ?? 0) + (emitidaSinCaeRes.count ?? 0));
    setEmitido(emitidoRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { cobrado, sinCae, emitido, loading, refresh: load };
}
