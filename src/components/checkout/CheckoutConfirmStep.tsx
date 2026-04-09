import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Clock, Zap, CheckCircle } from "lucide-react";
import CheckoutSummaryCard from "./CheckoutSummaryCard";

type PaymentMethod = "mercadopago" | "card" | "cash" | "external_platform";

interface CheckoutConfirmStepProps {
  planName: string;
  frecuencia?: string;
  precioBase: number;
  precioFinal: number;
  moneda: string;
  modality: "total" | "cuotas" | null;
  cuotasCantidad?: number | null;
  cuotaValor?: number | null;
  paymentMethod: PaymentMethod;
  discountName?: string | null;
  discountValue?: number | null;
  discountType?: string | null;
  processing: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

const activationInfo: Record<PaymentMethod, { icon: React.ReactNode; text: string; detail: string }> = {
  mercadopago: {
    icon: <Zap className="w-4 h-4 text-primary" />,
    text: "Activación inmediata",
    detail: "Tu plan se activa automáticamente al confirmar el pago.",
  },
  card: {
    icon: <Zap className="w-4 h-4 text-primary" />,
    text: "Activación inmediata",
    detail: "Tu plan se activa automáticamente al confirmar el pago.",
  },
  cash: {
    icon: <Clock className="w-4 h-4 text-amber-400" />,
    text: "Pendiente de validación",
    detail: "Lo revisamos después de tu clase y te avisamos cuando quede acreditado.",
  },
  external_platform: {
    icon: <Clock className="w-4 h-4 text-amber-400" />,
    text: "Pendiente de revisión",
    detail: "Lo revisamos y te avisamos por email cuando quede acreditado.",
  },
};

const confirmLabels: Record<PaymentMethod, string> = {
  mercadopago: "Ir a Mercado Pago",
  card: "Continuar con tarjeta",
  cash: "Confirmar que ya pagué en efectivo",
  external_platform: "Confirmar que ya hice el pago",
};

const CheckoutConfirmStep = ({
  planName,
  frecuencia,
  precioBase,
  precioFinal,
  moneda,
  modality,
  cuotasCantidad,
  cuotaValor,
  paymentMethod,
  discountName,
  discountValue,
  discountType,
  processing,
  onConfirm,
  onBack,
}: CheckoutConfirmStepProps) => {
  const info = activationInfo[paymentMethod];

  return (
    <div className="space-y-5 w-full max-w-md mx-auto animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          Revisá tu selección
        </h2>
        <p className="text-sm text-muted-foreground">
          Confirmá que todo esté correcto antes de continuar
        </p>
      </div>

      <CheckoutSummaryCard
        planName={planName}
        precioBase={precioBase}
        precioFinal={precioFinal}
        moneda={moneda}
        frecuencia={frecuencia}
        modality={modality}
        cuotasCantidad={cuotasCantidad}
        cuotaValor={cuotaValor}
        paymentMethod={paymentMethod}
        discountName={discountName}
        discountValue={discountValue}
        discountType={discountType}
      />

      {/* Activation info */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 flex items-start gap-3">
        {info.icon}
        <div>
          <p className="text-sm font-medium text-foreground">{info.text}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{info.detail}</p>
        </div>
      </div>

      <Button
        variant="gold"
        size="lg"
        className="w-full gap-2"
        disabled={processing}
        onClick={onConfirm}
      >
        {processing ? "Procesando..." : confirmLabels[paymentMethod]}
        <ArrowRight className="w-4 h-4" />
      </Button>

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Cambiar medio de pago
      </button>
    </div>
  );
};

export default CheckoutConfirmStep;
