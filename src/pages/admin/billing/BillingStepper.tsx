import { ArrowRight, Settings2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type BillingStep = "cobrado" | "sin_cae" | "emitido";
export type SecondaryView = null | "emisores" | "cuentas_mp";

interface Props {
  active: BillingStep;
  secondary: SecondaryView;
  counts: { cobrado: number; sinCae: number; emitido: number };
  loading?: boolean;
  onChangeStep: (s: BillingStep) => void;
  onChangeSecondary: (s: SecondaryView) => void;
}

const STEPS: { id: BillingStep; label: string; dotClass: string }[] = [
  { id: "cobrado", label: "Cobrado", dotClass: "bg-orange-500" },
  { id: "sin_cae", label: "Sin CAE", dotClass: "bg-amber-500" },
  { id: "emitido", label: "Emitido", dotClass: "bg-emerald-500" },
];

function fmt(n: number, loading?: boolean) {
  if (loading) return "…";
  return new Intl.NumberFormat("es-AR").format(n);
}

export function BillingStepper({
  active,
  secondary,
  counts,
  loading,
  onChangeStep,
  onChangeSecondary,
}: Props) {
  const valueFor = (id: BillingStep) =>
    id === "cobrado" ? counts.cobrado : id === "sin_cae" ? counts.sinCae : counts.emitido;

  return (
    <div className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-border bg-card/50 p-2">
      <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const isActive = secondary === null && active === s.id;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onChangeSecondary(null);
                  onChangeStep(s.id);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors",
                  "min-w-[140px]",
                  isActive
                    ? "bg-primary/10 border border-primary/40 text-foreground"
                    : "bg-transparent border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
                aria-pressed={isActive}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", s.dotClass)} />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium">{s.label}</span>
                </span>
                <span className={cn(
                  "ml-auto text-base font-bold tabular-nums",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}>
                  {fmt(valueFor(s.id), loading)}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 pl-2 border-l border-border">
        <button
          type="button"
          onClick={() => onChangeSecondary(secondary === "emisores" ? null : "emisores")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
            secondary === "emisores"
              ? "bg-primary/10 text-foreground border border-primary/40"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
          aria-pressed={secondary === "emisores"}
        >
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline">Emisores</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeSecondary(secondary === "cuentas_mp" ? null : "cuentas_mp")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
            secondary === "cuentas_mp"
              ? "bg-primary/10 text-foreground border border-primary/40"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
          aria-pressed={secondary === "cuentas_mp"}
        >
          <Wallet className="w-4 h-4" />
          <span className="hidden sm:inline">Cuentas MP</span>
        </button>
      </div>
    </div>
  );
}
