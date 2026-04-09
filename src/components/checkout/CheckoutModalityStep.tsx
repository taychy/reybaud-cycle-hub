import { formatPrice } from "@/lib/currency";
import { Banknote, CalendarClock, ArrowLeft } from "lucide-react";

interface CheckoutModalityStepProps {
  precioFinal: number;
  moneda: string;
  cuotasCantidad: number;
  cuotaValor: number;
  onSelect: (modality: "total" | "cuotas") => void;
  onBack: () => void;
}

const CheckoutModalityStep = ({
  precioFinal,
  moneda,
  cuotasCantidad,
  cuotaValor,
  onSelect,
  onBack,
}: CheckoutModalityStepProps) => {
  // Calculate next due date (next month, same day)
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextDueLabel = nextMonth.toLocaleDateString("es-AR", { day: "numeric", month: "long" });

  return (
    <div className="space-y-5 w-full max-w-md mx-auto animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          ¿Cómo preferís pagar?
        </h2>
        <p className="text-sm text-muted-foreground">
          Elegí la modalidad que más te convenga
        </p>
      </div>

      {/* Total */}
      <button
        onClick={() => onSelect("total")}
        className="w-full flex items-center gap-4 rounded-lg p-5 glass-card hover:ring-1 hover:ring-primary/50 transition-all text-left"
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Pago total</p>
          <p className="text-xs text-muted-foreground mt-0.5">Un solo pago y listo</p>
        </div>
        <span className="text-base font-heading font-bold gold-text-gradient">
          {formatPrice(precioFinal, moneda)}
        </span>
      </button>

      {/* Cuotas */}
      <button
        onClick={() => onSelect("cuotas")}
        className="w-full flex items-center gap-4 rounded-lg p-5 glass-card hover:ring-1 hover:ring-primary/50 transition-all text-left"
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {cuotasCantidad} cuotas de {formatPrice(cuotaValor, moneda)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pagás {formatPrice(cuotaValor, moneda)} hoy · próxima cuota el {nextDueLabel}
          </p>
        </div>
      </button>

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver
      </button>
    </div>
  );
};

export default CheckoutModalityStep;
