import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";
import { SEGMENTO_LABEL } from "@/lib/facturacionAuto";

interface Row {
  emisor_id: string;
  segmento: string;
  habilitado: boolean;
  auto_habilitado: boolean;
  auto_desde: string | null;
  emisores_fiscales: { nombre_fiscal: string; facturacion_automatica: boolean; tiene_credenciales: boolean } | null;
}

/** Interruptor de facturación automática por emisor y tipo de cobro. */
export function FacturacionAutoConfigCard({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("emisor_segmento_config")
      .select("emisor_id, segmento, habilitado, auto_habilitado, auto_desde, emisores_fiscales!inner(nombre_fiscal, facturacion_automatica, tiene_credenciales, activo)")
      .eq("habilitado", true)
      .eq("emisores_fiscales.activo", true);
    setRows(((data as any[]) || []) as Row[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (r: Row, value: boolean) => {
    const key = `${r.emisor_id}:${r.segmento}`;
    setBusy(key);
    const { error } = await supabase.rpc("set_facturacion_auto_config" as any, {
      p_emisor_id: r.emisor_id, p_segmento: r.segmento, p_habilitado: value,
    });
    setBusy(null);
    if (error) {
      toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: value ? "Automática activada" : "Automática apagada",
      description: value ? "Solo se facturan solos los cobros que entren desde ahora." : "Los cobros quedan para facturar a mano.",
    });
    load();
    onChanged?.();
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Facturación automática</p>
        <span className="text-xs text-muted-foreground">Solo cobros en pesos, desde que se activa. Lo anterior queda manual.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const key = `${r.emisor_id}:${r.segmento}`;
          const em = r.emisores_fiscales;
          const emisorOn = !!em?.facturacion_automatica;
          return (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{em?.nombre_fiscal}</p>
                <p className="text-xs text-muted-foreground">
                  {SEGMENTO_LABEL[r.segmento] ?? r.segmento}
                  {r.auto_habilitado && r.auto_desde && ` · desde ${new Date(r.auto_desde).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}`}
                </p>
                {r.auto_habilitado && !emisorOn && (
                  <Badge variant="outline" className="mt-1 text-[10px] text-yellow-600 border-yellow-500/40">
                    Falta activar la automática en el emisor
                  </Badge>
                )}
                {!em?.tiene_credenciales && (
                  <Badge variant="outline" className="mt-1 text-[10px] text-destructive border-destructive/40">Sin certificado</Badge>
                )}
              </div>
              <Switch checked={r.auto_habilitado} disabled={busy === key} onCheckedChange={(v) => toggle(r, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
