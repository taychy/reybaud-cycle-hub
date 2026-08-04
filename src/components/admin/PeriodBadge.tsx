import { CalendarClock, CalendarDays, Infinity as InfinityIcon, History } from "lucide-react";
import { cn } from "@/lib/utils";

export type PeriodScope = "hoy" | "mes" | "acumulado" | "12m";

const CONFIG: Record<PeriodScope, { label: string; icon: typeof CalendarClock; cls: string }> = {
  hoy: {
    label: "Hoy",
    icon: CalendarClock,
    cls: "border-blue-500/30 text-blue-400 bg-blue-500/10",
  },
  mes: {
    label: "Mes",
    icon: CalendarDays,
    cls: "border-primary/30 text-primary bg-primary/10",
  },
  acumulado: {
    label: "Acumulado",
    icon: InfinityIcon,
    cls: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  },
  "12m": {
    label: "12 meses",
    icon: History,
    cls: "border-purple-500/30 text-purple-400 bg-purple-500/10",
  },
};

interface Props {
  scope: PeriodScope;
  /** Texto opcional que reemplaza la etiqueta por defecto (ej: "ago 2026"). */
  label?: string;
  className?: string;
}

/**
 * Etiqueta de período para tarjetas de KPI.
 * Deja explícito si el número es de hoy, del mes seleccionado,
 * de los últimos 12 meses, o un acumulado histórico.
 */
export function PeriodBadge({ scope, label, className }: Props) {
  const conf = CONFIG[scope];
  const Icon = conf.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide leading-none whitespace-nowrap",
        conf.cls,
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {label ?? conf.label}
    </span>
  );
}
