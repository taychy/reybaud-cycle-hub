import { CheckCircle2, XCircle, Tag } from "lucide-react";
import type { PromoInfo } from "@/hooks/useEventPromo";

const REASON_LABEL: Record<string, string> = {
  not_found: "Este código no existe.",
  inactive: "Este código ya no está disponible.",
  not_yet: "Este código todavía no está vigente.",
  expired: "Este código venció.",
  maxed: "Este código agotó sus cupos.",
  scope_mismatch: "Este código no aplica a este evento.",
  error: "No pudimos validar el código.",
};

export default function EventPromoBanner({ promo, code }: { promo: PromoInfo | null; code: string }) {
  if (!promo || !code) return null;

  if (!promo.ok) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
        <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-destructive">Código {code.toUpperCase()} no válido</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {REASON_LABEL[promo.reason || ""] || "No pudimos aplicar este código."}
          </p>
        </div>
      </div>
    );
  }

  const label =
    promo.tipo === "fijo"
      ? `- $${Number(promo.valor).toLocaleString("es-AR")} off`
      : `${promo.valor}% off`;

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="text-sm flex-1">
        <p className="font-medium text-foreground flex items-center gap-2">
          <Tag className="w-3.5 h-3.5" />
          Código <span className="font-mono">{promo.codigo}</span> aplicado — {label}
        </p>
        <p className="text-muted-foreground text-xs mt-0.5">
          El descuento se aplica al confirmar tu reserva.
        </p>
      </div>
    </div>
  );
}
