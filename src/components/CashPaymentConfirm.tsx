import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowLeft, Banknote } from "lucide-react";

interface CashPaymentConfirmProps {
  planId: string;
  planName: string;
  alumnoId: string;
  onBack: () => void;
}

const CashPaymentConfirm = ({ planId, planName, alumnoId, onBack }: CashPaymentConfirmProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmCash = async () => {
    setProcessing(true);
    setError(null);

    // Create subscription with "pendiente_verificacion" status
    const { data: sub, error: subError } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: alumnoId,
        plan_id: planId,
        estado: "pendiente_verificacion",
      })
      .select("id")
      .single();

    if (subError) {
      setError("Error al registrar el pago. Intentá nuevamente.");
      setProcessing(false);
      return;
    }

    // Notify admin in background
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-cash-payment`;
      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          alumno_id: alumnoId,
          plan_id: planId,
          suscripcion_id: sub.id,
        }),
      }).catch(() => {});
    } catch {
      // Fire and forget
    }

    setProcessing(false);
    setStep("done");
  };

  if (step === "done") {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 animate-fade-in">
        <CheckCircle className="w-14 h-14 text-primary mx-auto" />
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          Pago informado
        </h2>
        <p className="text-sm text-muted-foreground">
          Tu pago en efectivo fue registrado y está <strong>pendiente de verificación</strong> por el administrador.
          Te avisaremos cuando se confirme.
        </p>
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          onClick={() => {
            sessionStorage.removeItem("registro_alumno_id");
            sessionStorage.removeItem("alumno_renewal");
            navigate("/");
          }}
        >
          Ir al inicio de sesión
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in">
      <div className="text-center space-y-3">
        <Banknote className="w-12 h-12 text-primary mx-auto" />
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          Pago en efectivo
        </h2>
        <p className="text-sm text-muted-foreground">
          Confirmás que pagaste el plan <strong>{planName}</strong> en efectivo al profesor.
          Tu suscripción se activará cuando el administrador verifique el pago.
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">
          {error}
        </div>
      )}

      <Button
        variant="gold"
        size="lg"
        className="w-full"
        disabled={processing}
        onClick={handleConfirmCash}
      >
        {processing ? "Registrando..." : "Confirmar pago en efectivo"}
      </Button>

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver a métodos de pago
      </button>
    </div>
  );
};

export default CashPaymentConfirm;
