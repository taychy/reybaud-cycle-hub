import { CreditCard, Banknote, ChevronRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

type PaymentMethod = "mercadopago" | "card" | "cash" | "external_platform";

interface PaymentMethodSelectorProps {
  onSelect: (method: PaymentMethod) => void;
  processing: boolean;
}

const PaymentMethodSelector = ({ onSelect, processing }: PaymentMethodSelectorProps) => {
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);

  if (showAlreadyPaid) {
    return (
      <div className="space-y-3 w-full max-w-md mx-auto animate-fade-in">
        <p className="text-center text-sm text-muted-foreground font-medium mb-2">
          ¿Cómo realizaste el pago?
        </p>

        {/* Cash to professor */}
        <button
          disabled={processing}
          onClick={() => onSelect("cash")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <Banknote className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">En efectivo al profesor</p>
            <p className="text-xs text-muted-foreground">Requiere confirmación del administrador</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* External platform */}
        <button
          disabled={processing}
          onClick={() => onSelect("external_platform")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <Globe className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Por plataforma de pago externa</p>
            <p className="text-xs text-muted-foreground">Transferencia, otra app, etc.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => setShowAlreadyPaid(false)}
          className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
        >
          ← Volver
        </button>
      </div>
    );
  }

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

      {/* Card payment */}
      <button
        disabled={processing}
        onClick={() => onSelect("card")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <CreditCard className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Pagar con tarjeta</p>
          <p className="text-xs text-muted-foreground">Crédito o débito directamente</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o bien</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Already paid */}
      <button
        disabled={processing}
        onClick={() => setShowAlreadyPaid(true)}
        className="w-full text-center py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
      >
        Ya pagué
      </button>
    </div>
  );
};

export default PaymentMethodSelector;
