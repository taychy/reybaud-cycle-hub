import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, ChevronRight, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import type { ResumenLiquidacion } from "@/hooks/useCoachHome";

export default function LiquidacionResumenCard({ resumen }: { resumen: ResumenLiquidacion | null }) {
  const navigate = useNavigate();
  if (!resumen) return null;

  const [y, m] = resumen.mes.split("-").map(Number);
  const mesLabel = new Date(y, m - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <Card
      className="bg-card border-border cursor-pointer hover:border-primary/40 transition"
      onClick={() => navigate("/coach/liquidaciones")}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Mi liquidación · <span className="capitalize">{mesLabel}</span>
          </p>
          <Banknote className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Confirmado</p>
            <p className="text-[15px] font-heading font-semibold text-foreground">{formatPrice(resumen.confirmado)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">En revisión</p>
            <p className="text-[15px] font-heading font-semibold text-amber-400">{formatPrice(resumen.enRevision)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pagado</p>
            <p className="text-[15px] font-heading font-semibold text-emerald-400">{formatPrice(resumen.pagado)}</p>
          </div>
        </div>

        {resumen.enRevision > 0 && (
          <p className="text-[12px] text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Hay actividad pendiente de revisión del admin.
          </p>
        )}

        <span className="text-[12px] text-primary inline-flex items-center gap-1">
          Ver detalle del mes <ChevronRight className="w-3 h-3" />
        </span>
      </CardContent>
    </Card>
  );
}
