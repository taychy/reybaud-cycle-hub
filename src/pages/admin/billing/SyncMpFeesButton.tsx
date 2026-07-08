import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

/**
 * Botón admin para disparar el backfill de comisiones MP en los cobros
 * (reservas + suscripciones + tienda) de los últimos 90 días.
 */
export function SyncMpFeesButton() {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-mp-fees", {
        body: { days: 90, batch: 50, source: "all" },
      });
      if (error) throw error;
      const r = (data as any)?.results ?? {};
      toast({
        title: "Comisiones MP sincronizadas",
        description: `Reservas: ${r.reservas ?? 0} · Suscripciones: ${r.suscripciones ?? 0} · Tienda: ${r.tienda ?? 0}${r.errores?.length ? ` · Errores: ${r.errores.length}` : ""}`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al sincronizar", description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading}>
      <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
      Sincronizar comisiones MP
    </Button>
  );
}
