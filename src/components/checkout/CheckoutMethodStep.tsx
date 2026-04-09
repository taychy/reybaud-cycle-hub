import { CreditCard, Banknote, ArrowLeft, CheckCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaymentMethod = "mercadopago" | "card" | "cash" | "external_platform";

interface CheckoutMethodStepProps {
  onSelect: (method: PaymentMethod) => void;
  processing: boolean;
  onBack: () => void;
}

const CheckoutMethodStep = ({ onSelect, processing, onBack }: CheckoutMethodStepProps) => {
  return (
    <div className="space-y-4 w-full max-w-md mx-auto animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          ¿Cómo querés pagar?
        </h2>
        <p className="text-sm text-muted-foreground">
          Elegí el medio de pago que prefieras
        </p>
      </div>

      {/* Mercado Pago */}
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

      {/* Card */}
      <button
        disabled={processing}
        onClick={() => onSelect("card")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <CreditCard className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Pagar con tarjeta</p>
          <p className="text-xs text-muted-foreground">Crédito o débito · Activación inmediata</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">otros medios</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Already paid (external) */}
      <button
        disabled={processing}
        onClick={() => onSelect("external_platform")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <CheckCircle className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Ya hice el pago</p>
          <p className="text-xs text-muted-foreground">Transferencia, otra app u otro medio · Lo revisamos y te avisamos</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Cash */}
      <button
        disabled={processing}
        onClick={() => onSelect("cash")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <Banknote className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Pagar en efectivo al profesor</p>
          <p className="text-xs text-muted-foreground">Lo validamos después de tu clase</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
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

export default CheckoutMethodStep;
