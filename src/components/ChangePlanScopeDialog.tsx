import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, CalendarClock, AlertTriangle } from "lucide-react";

interface ChangePlanScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectScope: (scope: "actual" | "siguiente") => void;
  currentPlanName?: string;
  currentFechaFin?: string | null;
}

const formatLocal = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export default function ChangePlanScopeDialog({
  open,
  onOpenChange,
  onSelectScope,
  currentPlanName,
  currentFechaFin,
}: ChangePlanScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            ¿Cuándo querés cambiar de plan?
          </DialogTitle>
          <DialogDescription>
            Plan actual: <span className="font-medium text-foreground">{currentPlanName || "—"}</span>
            {currentFechaFin && <> · vence {formatLocal(currentFechaFin)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => onSelectScope("actual")}
            className="w-full rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all p-4 text-left space-y-1"
          >
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Cambiar este período</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Aplicamos el cambio ahora con prorrateo por los días restantes. Si hay diferencia a pagar, te llevamos al checkout.
            </p>
            <div className="flex items-start gap-1.5 pt-1">
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-300/80">
                Administración revisará el cambio para confirmarlo.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectScope("siguiente")}
            className="w-full rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all p-4 text-left space-y-1"
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Cambiar el próximo período</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Tu plan actual sigue hasta {formatLocal(currentFechaFin) || "el vencimiento"}. Elegís el nuevo plan y lo pagás
              por adelantado: arranca cuando termina el actual.
            </p>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
