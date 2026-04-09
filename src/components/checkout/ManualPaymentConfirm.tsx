import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";

interface ManualPaymentConfirmProps {
  planId: string;
  planName: string;
  alumnoId: string;
  precioBase: number;
  precioFinal: number;
  descuentoId: string | null;
  moneda: string;
  paymentType: "cash" | "external_platform";
  onProcessing: (v: boolean) => void;
}

const ManualPaymentConfirm = ({
  planId,
  alumnoId,
  precioBase,
  precioFinal,
  descuentoId,
  paymentType,
  onProcessing,
}: ManualPaymentConfirmProps) => {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  const handleConfirm = async () => {
    onProcessing(true);
    setError(null);

    const now = new Date();
    const fechaInicio = now.toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDay.toISOString().split("T")[0];

    const { data: sub, error: subError } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: alumnoId,
        plan_id: planId,
        estado: "pendiente_verificacion",
        descuento_id: descuentoId,
        precio_base: precioBase,
        precio_final: precioFinal,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      } as any)
      .select("id")
      .single();

    if (subError) {
      setError("Error al registrar. Intentá nuevamente.");
      onProcessing(false);
      return;
    }

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
          payment_type: paymentType === "external_platform" ? "plataforma_externa" : "efectivo",
        }),
      }).catch(() => {});
    } catch {
      // fire and forget
    }

    onProcessing(false);
    setDone(true);
  };

  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true;
      handleConfirm();
    }
  }, []);

  if (done) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          ¡Listo, recibimos tu aviso!
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {paymentType === "cash"
            ? "Registramos tu pago en efectivo. Lo validamos después de tu clase y te avisamos cuando quede acreditado."
            : "Registramos tu pago. Lo revisamos y te avisamos por email cuando quede acreditado."}
        </p>
        <Button
          variant="gold"
          size="lg"
          className="w-full gap-2"
          onClick={() => {
            localStorage.removeItem("registro_alumno_id");
            localStorage.removeItem("alumno_renewal");
            localStorage.removeItem("alumno_from_vacation");
            navigate("/");
          }}
        >
          Volver al inicio
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4">
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
        <Button variant="gold" size="lg" className="w-full" onClick={handleConfirm}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto text-center py-8">
      <div className="animate-pulse text-muted-foreground text-sm">Registrando tu pago...</div>
    </div>
  );
};

export default ManualPaymentConfirm;
