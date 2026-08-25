import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BillingCounts = {
  pendientes: number;
  problemas: number;
  emitidasMes: number;
  emitidasTotal: number;
  montoPendiente: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Conteos globales del tablero de Facturación en UNA sola llamada server-side
 * (`get_billing_dashboard`, admin-only).
 */
export function useBillingCounts(refreshKey: number = 0): BillingCounts {
  const [state, setState] = useState({
    pendientes: 0,
    problemas: 0,
    emitidasMes: 0,
    emitidasTotal: 0,
    montoPendiente: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_billing_dashboard" as any);
    if (!error && data) {
      const d = data as any;
      setState({
        pendientes: Number(d.pendientes ?? 0),
        problemas: Number(d.problemas ?? 0),
        emitidasMes: Number(d.emitidas_mes ?? 0),
        emitidasTotal: Number(d.emitidas_total ?? 0),
        montoPendiente: Number(d.monto_pendiente ?? 0),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { ...state, loading, refresh: load };
}
