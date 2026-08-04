import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ShieldCheck, AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface AuditRow {
  suscripcion_id: string;
  plan_nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  moneda: string | null;
  precio_base: number | null;
  precio_final: number | null;
  precio_plan_actual: number | null;
  precio_esperado: number | null;
  diferencia: number | null;
  origen_historial_id: string | null;
  origen_fecha_vigencia: string | null;
  origen_fecha_cambio: string | null;
  origen_aplicado_at: string | null;
  origen_aplicar_a: string | null;
  sub_updated_at: string | null;
  ultimo_job_aplicado_at: string | null;
  ultimo_job_vigencia: string | null;
  reproceso_fuera_de_orden: boolean;
  aplicado_antes_de_vigencia: boolean;
  desalineada: boolean;
  diagnostico: string;
}

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const fmtTs = (t?: string | null) => {
  if (!t) return "—";
  const dt = new Date(t);
  return dt.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function StudentPriceAuditSection({ alumnoId }: { alumnoId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("audit_alumno_precios" as any, { _alumno_id: alumnoId });
    if (!error) setRows(((data as any) || []) as AuditRow[]);
    setLoading(false);
  }, [alumnoId]);

  useEffect(() => { load(); }, [load]);

  const issues = rows.filter(r => r.diagnostico !== "OK");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {issues.length > 0
            ? <AlertTriangle className="h-4 w-4 text-destructive" />
            : <ShieldCheck className="h-4 w-4 text-primary" />}
          <h3 className="text-sm font-semibold">Auditoría de precios</h3>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : issues.length > 0 ? (
            <Badge variant="destructive">{issues.length} con anomalía</Badge>
          ) : (
            <Badge variant="secondary">Sin anomalías</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={load} aria-label="Reauditar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              Detalle
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="mt-3 space-y-2">
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">Sin suscripciones para auditar.</p>
        )}
        {rows.map((r) => {
          const bad = r.diagnostico !== "OK";
          return (
            <Card key={r.suscripcion_id} className={bad ? "border-destructive/50" : undefined}>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {r.plan_nombre} · {fmtDate(r.fecha_inicio)}
                  </div>
                  <Badge variant={bad ? "destructive" : "secondary"}>{r.estado}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Cobrado</span>
                    <div className="font-medium">{formatPrice(Number(r.precio_base ?? 0), r.moneda || "ARS")}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Esperado (historial)</span>
                    <div className={`font-medium ${r.desalineada ? "text-destructive" : ""}`}>
                      {r.precio_esperado == null ? "—" : formatPrice(Number(r.precio_esperado), r.moneda || "ARS")}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plan hoy</span>
                    <div className="font-medium">{formatPrice(Number(r.precio_plan_actual ?? 0), r.moneda || "ARS")}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vigencia origen</span>
                    <div>{fmtDate(r.origen_fecha_vigencia)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Job aplicado</span>
                    <div>{fmtTs(r.origen_aplicado_at)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Últ. job del plan</span>
                    <div>{fmtTs(r.ultimo_job_aplicado_at)} ({fmtDate(r.ultimo_job_vigencia)})</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {r.reproceso_fuera_de_orden && <Badge variant="destructive">Reproceso fuera de orden</Badge>}
                  {r.aplicado_antes_de_vigencia && <Badge variant="destructive">Aplicado antes de vigencia</Badge>}
                  {r.desalineada && <Badge variant="outline">Precio desalineado</Badge>}
                </div>

                <p className={`text-xs ${bad ? "text-destructive" : "text-muted-foreground"}`}>{r.diagnostico}</p>
                {r.origen_historial_id && (
                  <p className="text-[10px] text-muted-foreground">
                    Origen: historial {r.origen_historial_id.slice(0, 8)} · cambio {fmtTs(r.origen_fecha_cambio)} · aplica a {r.origen_aplicar_a || "—"} · sub actualizada {fmtTs(r.sub_updated_at)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
