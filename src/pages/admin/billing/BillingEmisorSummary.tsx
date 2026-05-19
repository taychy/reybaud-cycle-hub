import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { formatPrice } from "@/lib/currency";
import { AlertTriangle, Settings2 } from "lucide-react";

interface Row {
  emisor_id: string;
  nombre_fiscal: string;
  cuit: string;
  limite_anual_ars: number | null;
  facturado_anual: number;
  porcentaje_uso: number | null;
  cupo_disponible: number | null;
}

interface Props {
  refreshKey?: number;
}

export function BillingEmisorSummary({ refreshKey }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Solo emisores activos
      const [emisRes, factRes] = await Promise.all([
        supabase.from("emisores_fiscales").select("id, activo"),
        supabase.from("emisor_facturado_anual" as any).select("*"),
      ]);
      const activos = new Set(((emisRes.data as any[]) || []).filter((e) => e.activo).map((e) => e.id));
      const data = (((factRes.data as any[]) || []) as Row[]).filter((r) => activos.has(r.emisor_id));
      setRows(data);
      setLoading(false);
    })();
  }, [refreshKey]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wider">
          Cupo por emisor (últimos 12 meses)
        </h3>
        <span className="text-[10px] text-muted-foreground">solo facturas con CAE</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const pct = r.porcentaje_uso ?? null;
          const overLimit = pct !== null && pct >= 90;
          const warnLimit = pct !== null && pct >= 75 && pct < 90;
          return (
            <div key={r.emisor_id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.nombre_fiscal}</p>
                  <p className="text-[10px] text-muted-foreground">CUIT {r.cuit}</p>
                </div>
                {overLimit && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-foreground">{formatPrice(r.facturado_anual, "ARS")}</span>
                  {pct !== null && (
                    <span className={`text-xs font-semibold ${overLimit ? "text-destructive" : warnLimit ? "text-orange-500" : "text-emerald-500"}`}>
                      {pct.toFixed(1)}%
                    </span>
                  )}
                </div>
                {r.limite_anual_ars && r.limite_anual_ars > 0 ? (
                  <>
                    <Progress
                      value={Math.min(pct ?? 0, 100)}
                      className={overLimit ? "[&>div]:bg-destructive" : warnLimit ? "[&>div]:bg-orange-500" : "[&>div]:bg-emerald-500"}
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>de {formatPrice(r.limite_anual_ars, "ARS")}</span>
                      <span>
                        Disp.{" "}
                        <span className="font-medium text-foreground">
                          {formatPrice(r.cupo_disponible ?? 0, "ARS")}
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Settings2 className="w-3 h-3" />
                    Sin tope configurado · agregalo en Emisores
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
