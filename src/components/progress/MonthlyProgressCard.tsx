import { CheckCircle2, XCircle, Dumbbell, Plus } from "lucide-react";

interface ProgressBreakdown {
  planRealizadas: number;
  presenciales: number;
  extras: number;
  noRealizadas: number;
  totalPlanificadas: number;
  totalCompletadas: number;
  totalDenominador: number;
  porcentaje: number;
}

function getProgressColor(pct: number) {
  if (pct <= 35) return { bar: "bg-destructive", text: "text-destructive", label: "Bajo" };
  if (pct <= 50) return { bar: "bg-orange-500", text: "text-orange-500", label: "Regular" };
  if (pct <= 85) return { bar: "bg-emerald-500", text: "text-emerald-500", label: "Bien" };
  return { bar: "bg-sky-400", text: "text-sky-400", label: "Excelente" };
}

export function MonthlyProgressCard({ data }: { data: ProgressBreakdown }) {
  const { planRealizadas, presenciales, extras, noRealizadas, totalCompletadas, totalDenominador, porcentaje } = data;
  const color = getProgressColor(porcentaje);
  const barWidth = Math.min(porcentaje, 100);

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-5 shadow-lg shadow-black/20">
      <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
        Progreso mensual
      </h2>

      {/* Big counter */}
      <div className="flex items-baseline gap-1 justify-center">
        <span className={`text-4xl font-heading font-bold ${color.text}`}>
          {totalCompletadas}
        </span>
        <span className="text-xl text-muted-foreground font-heading">/</span>
        <span className="text-xl text-muted-foreground font-heading font-semibold">
          {totalDenominador}
        </span>
        <span className="text-sm text-muted-foreground ml-1">sesiones</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${color.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-lg font-heading font-bold ${color.text}`}>
            {porcentaje}%
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color.bar}/15 ${color.text}`}>
            {color.label}
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <BreakdownItem
          icon={<Dumbbell className="w-3.5 h-3.5 text-primary" />}
          label="Plan realizadas"
          value={planRealizadas}
        />
        <BreakdownItem
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          label="Presenciales"
          value={presenciales}
        />
        <BreakdownItem
          icon={<Plus className="w-3.5 h-3.5 text-sky-400" />}
          label="Extras"
          value={extras}
        />
        <BreakdownItem
          icon={<XCircle className="w-3.5 h-3.5 text-destructive" />}
          label="No realizadas"
          value={noRealizadas}
        />
      </div>
    </div>
  );
}

function BreakdownItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
      {icon}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
