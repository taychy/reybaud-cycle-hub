import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { formatPrice } from "@/lib/currency";
import { AlertTriangle, Settings2 } from "lucide-react";

interface Row {
  emisor_id: string;
  nombre_fiscal: string;
  cuit: string;
  categoria_monotributo: string | null;
  categoria_por_ingresos: string | null;
  limite_vigencia_desde: string | null;
  limite_anual_ars: number | null;
  limite_max_regimen: number | null;
  facturado_app_12m: number;
  facturado_historico_12m: number;
  facturado_anual: number;
  porcentaje_uso: number | null;
  cupo_disponible: number | null;
  exceso_categoria: number | null;
  disponible_hasta_max_regimen: number | null;
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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wider">
          Control fiscal por emisor (últimos 12 meses)
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Reybaud + histórico ARCA · notas de crédito descontadas · topes ARCA 01/08/2026
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const pct = r.porcentaje_uso ?? null;
          const exceeded = pct !== null && pct >= 100;
          const critical = pct !== null && pct >= 95 && pct < 100;
          const warning = pct !== null && pct >= 90 && pct < 95;
          const attention = pct !== null && pct >= 80 && pct < 90;
          const needsAttention = exceeded || critical || warning;
          const inferredCategory = r.categoria_por_ingresos;
          const categoryDiffers = Boolean(
            r.categoria_monotributo &&
            inferredCategory &&
            inferredCategory !== "FUERA_REGIMEN" &&
            inferredCategory !== r.categoria_monotributo,
          );

          const pctClass = exceeded
            ? "text-destructive"
            : critical
              ? "text-red-500"
              : warning
                ? "text-orange-500"
                : attention
                  ? "text-amber-500"
                  : "text-emerald-500";

          const progressClass = exceeded
            ? "[&>div]:bg-destructive"
            : critical
              ? "[&>div]:bg-red-500"
              : warning
                ? "[&>div]:bg-orange-500"
                : attention
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-emerald-500";

          return (
            <div key={r.emisor_id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.nombre_fiscal}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>CUIT {r.cuit}</span>
                    {r.categoria_monotributo && (
                      <span className="rounded border px-1.5 py-0.5 text-foreground">Cat. declarada {r.categoria_monotributo}</span>
                    )}
                    {inferredCategory === "FUERA_REGIMEN" ? (
                      <span className="rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-destructive">Supera máximo Monotributo</span>
                    ) : categoryDiffers ? (
                      <span className="rounded border border-amber-500/40 bg-amber-500/5 px-1.5 py-0.5 text-amber-600">
                        Por ingresos: {inferredCategory}
                      </span>
                    ) : null}
                  </div>
                </div>
                {needsAttention && <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-bold text-foreground">{formatPrice(r.facturado_anual, "ARS")}</span>
                  {pct !== null && <span className={`text-xs font-semibold ${pctClass}`}>{pct.toFixed(1)}%</span>}
                </div>

                {r.limite_anual_ars && r.limite_anual_ars > 0 ? (
                  <>
                    <Progress value={Math.min(pct ?? 0, 100)} className={progressClass} />
                    <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                      <span>Tope Cat. {r.categoria_monotributo || "—"}: {formatPrice(r.limite_anual_ars, "ARS")}</span>
                      {exceeded ? (
                        <span className="font-medium text-destructive">
                          Excede {formatPrice(r.exceso_categoria ?? 0, "ARS")}
                        </span>
                      ) : (
                        <span>
                          Disponible <span className="font-medium text-foreground">{formatPrice(r.cupo_disponible ?? 0, "ARS")}</span>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Settings2 className="w-3 h-3" />
                    Sin tope de categoría configurado
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[10px] text-muted-foreground space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span>Emitido desde Reybaud</span>
                  <span className="font-medium text-foreground">{formatPrice(r.facturado_app_12m ?? 0, "ARS")}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Histórico ARCA neto</span>
                  <span className="font-medium text-foreground">{formatPrice(r.facturado_historico_12m ?? 0, "ARS")}</span>
                </div>
                {r.disponible_hasta_max_regimen !== null && r.disponible_hasta_max_regimen !== undefined && inferredCategory !== "FUERA_REGIMEN" && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-1">
                    <span>Disponible hasta máximo del régimen</span>
                    <span className="font-medium text-foreground">{formatPrice(r.disponible_hasta_max_regimen, "ARS")}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
