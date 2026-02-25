import { CreditCard, Banknote, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaymentMethod = "mercadopago" | "card" | "cash";

interface PaymentMethodSelectorProps {
  onSelect: (method: PaymentMethod) => void;
  processing: boolean;
}

const PaymentMethodSelector = ({ onSelect, processing }: PaymentMethodSelectorProps) => {
  return (
    <div className="space-y-3 w-full max-w-md mx-auto">
      {/* Main CTA: Mercado Pago */}
      <Button
        variant="gold"
        size="lg"
        className="w-full gap-2"
        disabled={processing}
        onClick={() => onSelect("mercadopago")}
      >
        {processing ? "Procesando..." : "Pagar con Mercado Pago"}
        <CreditCard className="w-4 h-4" />
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Otros medios de pago
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Card payment */}
      <button
        disabled={processing}
        onClick={() => onSelect("card")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <CreditCard className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Tarjeta de crédito o débito</p>
          <p className="text-xs text-muted-foreground">Ingresá los datos de tu tarjeta</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Cash payment */}
      <button
        disabled={processing}
        onClick={() => onSelect("cash")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <Banknote className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Pagué en efectivo al profesor</p>
          <p className="text-xs text-muted-foreground">Requiere confirmación del administrador</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default PaymentMethodSelector;
