import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";
import { getEarlyRenewal } from "@/lib/earlyRenewal";

type DeclaredManualMethod =
  | "efectivo"
  | "transferencia"
  | "mp_externo"
  | "otro";

interface ManualPaymentConfirmProps {
  planId: string;
  planName: string;
  alumnoId: string;
  precioBase: number;
  precioFinal: number;
  descuentoId: string | null;
  moneda: string;
  /** Specific method the student declared (efectivo, transferencia, mp_externo, otro) */
  metodoPago: DeclaredManualMethod;
  /** Free-text detail when metodoPago is "otro" */
  otherDetail?: string | null;
  /** If this is an upgrade flow, the id of the subscription being replaced */
  upgradeFromSubId?: string | null;
  onProcessing: (v: boolean) => void;
}

const METHOD_LABELS: Record<DeclaredManualMethod, string> = {
  efectivo: "en efectivo al profesor",
  transferencia: "por transferencia bancaria",
  mp_externo: "con MercadoPago (por fuera de la app)",
  otro: "por otro medio",
};

/** Map declared method → canonical metodo_pago value persisted in DB */
const toCanonicalMethod = (m: DeclaredManualMethod): string => {
  if (m === "mp_externo") return "mercadopago";
  if (m === "otro") return "otro";
  return m; // efectivo, transferencia
};

const ManualPaymentConfirm = ({
  planId,
  alumnoId,
  precioBase,
  precioFinal,
  descuentoId,
  metodoPago,
  otherDetail,
  upgradeFromSubId,
  onProcessing,
}: ManualPaymentConfirmProps) => {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  const handleConfirm = async () => {
    onProcessing(true);
    setError(null);

    const earlyRenewal = getEarlyRenewal();
    let fechaInicio: string;
    let fechaFin: string;
    if (earlyRenewal) {
      fechaInicio = earlyRenewal.fechaInicio;
      fechaFin = earlyRenewal.fechaFin;
      // Desactivar auto-renovación de la sub vigente para evitar doble cobro.
      if (earlyRenewal.autoRenovacion && earlyRenewal.subId) {
        await supabase
          .from("suscripciones")
          .update({ auto_renovacion: false } as any)
          .eq("id", earlyRenewal.subId);
      }
    } else {
      const now = new Date();
      fechaInicio = now.toISOString().split("T")[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      fechaFin = lastDay.toISOString().split("T")[0];
    }

    const canonicalMethod = toCanonicalMethod(metodoPago);
    const upgradeMarker = upgradeFromSubId ? `UPGRADE_FROM:${upgradeFromSubId}` : null;
    const earlyMarker = earlyRenewal ? `EARLY_RENEWAL_FROM:${earlyRenewal.subId}` : null;
    const userNotas =
      metodoPago === "otro" && otherDetail && otherDetail.trim().length > 0
        ? `Otro medio informado por alumno: ${otherDetail.trim()}`
        : null;
    const notas = [upgradeMarker, earlyMarker, userNotas].filter(Boolean).join(" | ") || null;

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
        metodo_pago: canonicalMethod,
        origen_registro: "informado_alumno",
        notas,
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
          payment_type: canonicalMethod,
          declared_method: metodoPago,
          other_detail: otherDetail ?? null,
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
          Registramos tu pago {METHOD_LABELS[metodoPago]}. Lo revisamos y te avisamos
          {metodoPago === "efectivo" ? " después de tu clase" : " por email"} cuando quede acreditado.
        </p>
        <Button
          variant="gold"
          size="lg"
          className="w-full gap-2"
          onClick={async () => {
            const { clearEarlyRenewal } = await import("@/lib/earlyRenewal");
            localStorage.removeItem("registro_alumno_id");
            localStorage.removeItem("alumno_renewal");
            localStorage.removeItem("alumno_from_vacation");
            localStorage.removeItem("upgrade_from_sub_id");
            localStorage.removeItem("upgrade_preselect_plan_id");
            clearEarlyRenewal();
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
