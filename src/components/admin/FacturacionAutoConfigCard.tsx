import { useCallback, useEffect, useMemo, useState } from "react";
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
  emisores_fiscales: {
    nombre_fiscal: string;
    facturacion_automatica: boolean;
    facturacion_automatica_desde: string | null;
    tiene_credenciales: boolean;
  } | null;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

/**
 * Interruptor maestro por emisor + interruptor por tipo de cobro.
 * Solo se autoemite si AMBOS están encendidos y el cobro es posterior a las dos fechas de activación.
 */
export function FacturacionAutoConfigCard({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("emisor_segmento_config")
      .select("emisor_id, segmento, habilitado, auto_habilitado, auto_desde, emisores_fiscales!inner(nombre_fiscal, facturacion_automatica, facturacion_automatica_desde, tiene_credenciales, activo)")
      .eq("habilitado", true)
      .eq("emisores_fiscales.activo", true);
    setRows(((data as any[]) || []) as Row[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const emisores = useMemo(() => {
    const m = new Map<string, { id: string; em: Row["emisores_fiscales"]; rows: Row[] }>();
    rows.forEach((r) => {
      const g = m.get(r.emisor_id) ?? { id: r.emisor_id, em: r.emisores_fiscales, rows: [] };
      g.rows.push(r);
      m.set(r.emisor_id, g);
    });
    return [...m.values()];
  }, [rows]);

  const toggleMaster = async (emisorId: string, value: boolean) => {
    setBusy(`m:${emisorId}`);
    const { error } = await supabase.rpc("set_facturacion_automatica_emisor" as any, { p_emisor_id: emisorId, p_activa: value });
    setBusy(null);
    if (error) return toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    toast({ title: value ? "Interruptor maestro encendido" : "Interruptor maestro apagado",
      description: value ? "Solo cuentan los cobros pagados desde ahora." : "Este emisor no factura solo." });
    load(); onChanged?.();
  };

  const toggleSeg = async (r: Row, value: boolean) => {
    const key = `${r.emisor_id}:${r.segmento}`;
    setBusy(key);
    const { error } = await supabase.rpc("set_facturacion_auto_config" as any, {
      p_emisor_id: r.emisor_id, p_segmento: r.segmento, p_habilitado: value,
    });
    setBusy(null);
    if (error) return toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    load(); onChanged?.();
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Facturación automática</p>
        <span className="text-xs text-muted-foreground">
          Se factura solo si están encendidos el emisor y el tipo de cobro. Solo pesos y cobros desde la activación; lo anterior queda manual.
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {emisores.map(({ id, em, rows: segs }) => {
          const on = !!em?.facturacion_automatica;
          return (
            <div key={id} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{em?.nombre_fiscal}</p>
                  <p className="text-xs text-muted-foreground">
                    Maestro: {on ? `encendido${em?.facturacion_automatica_desde ? ` desde ${fmt(em.facturacion_automatica_desde)}` : ""}` : "apagado"}
                  </p>
                  {!em?.tiene_credenciales && (
                    <Badge variant="outline" className="mt-1 text-[10px] text-destructive border-destructive/40">Sin certificado</Badge>
                  )}
                </div>
                <Switch checked={on} disabled={busy === `m:${id}`} onCheckedChange={(v) => toggleMaster(id, v)} aria-label="Interruptor maestro" />
              </div>
              <div className="space-y-1 border-t border-border/50 pt-2">
                {segs.map((r) => {
                  const key = `${r.emisor_id}:${r.segmento}`;
                  return (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs">{SEGMENTO_LABEL[r.segmento] ?? r.segmento}</p>
                        {r.auto_habilitado && r.auto_desde && (
                          <p className="text-[10px] text-muted-foreground">desde {fmt(r.auto_desde)}</p>
                        )}
                        {r.auto_habilitado && !on && (
                          <p className="text-[10px] text-yellow-600">No emite: maestro apagado</p>
                        )}
                      </div>
                      <Switch checked={r.auto_habilitado} disabled={busy === key} onCheckedChange={(v) => toggleSeg(r, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
