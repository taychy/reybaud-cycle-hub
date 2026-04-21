import { CreditCard, Banknote, ArrowLeft, ArrowLeftRight, Globe, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// Specific payment method the student declares
export type DeclaredPaymentMethod =
  | "mercadopago"      // Pay now via MP gateway
  | "card"             // Pay now with card form
  | "efectivo"         // Already paid in cash to coach
  | "transferencia"    // Already paid by bank transfer
  | "mp_externo"       // Already paid through MercadoPago (outside our checkout)
  | "tarjeta_externa"  // Already paid with card outside our checkout
  | "plataforma_externa"; // Already paid through another platform

interface CheckoutMethodStepProps {
  onSelect: (method: DeclaredPaymentMethod) => void;
  processing: boolean;
  onBack: () => void;
}

const CheckoutMethodStep = ({ onSelect, processing, onBack }: CheckoutMethodStepProps) => {
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);

  if (showAlreadyPaid) {
    return (
      <div className="space-y-3 w-full max-w-md mx-auto animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
            ¿Cómo pagaste?
          </h2>
          <p className="text-sm text-muted-foreground">
            Elegí el medio que usaste para que administración pueda validarlo
          </p>
        </div>

        <button
          disabled={processing}
          onClick={() => onSelect("efectivo")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <Banknote className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Efectivo</p>
            <p className="text-xs text-muted-foreground">En efectivo al profesor</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          disabled={processing}
          onClick={() => onSelect("transferencia")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <ArrowLeftRight className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Transferencia bancaria</p>
            <p className="text-xs text-muted-foreground">CBU / alias</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          disabled={processing}
          onClick={() => onSelect("mp_externo")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <CreditCard className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">MercadoPago</p>
            <p className="text-xs text-muted-foreground">Lo pagaste por fuera con MP</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          disabled={processing}
          onClick={() => onSelect("tarjeta_externa")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <CreditCard className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Tarjeta de crédito/débito</p>
            <p className="text-xs text-muted-foreground">Por fuera de la app</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          disabled={processing}
          onClick={() => onSelect("plataforma_externa")}
          className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
        >
          <Globe className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Plataforma de pago externa</p>
            <p className="text-xs text-muted-foreground">Otra app o pasarela</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => setShowAlreadyPaid(false)}
          className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Volver
        </button>
      </div>
    );
  }

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
        <span className="text-xs text-muted-foreground">o bien</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Already paid (opens method selector) */}
      <button
        disabled={processing}
        onClick={() => setShowAlreadyPaid(true)}
        className="w-full text-center py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors underline underline-offset-4 disabled:opacity-50"
      >
        Ya pagué (informar el medio que usé)
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
