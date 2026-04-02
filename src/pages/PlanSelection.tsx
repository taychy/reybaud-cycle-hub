import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft, AlertTriangle, MessageSquare, CheckCircle } from "lucide-react";
import logo from "@/assets/logo.png";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import CashPaymentConfirm from "@/components/CashPaymentConfirm";
import CardPaymentForm from "@/components/CardPaymentForm";
import ExternalPaymentConfirm from "@/components/ExternalPaymentConfirm";

interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  frecuencia: string;
  moneda?: string;
  tipo?: string;
  precio_promocional?: number | null;
  cuotas_cantidad?: number | null;
  cuota_valor?: number | null;
  whatsapp_url?: string | null;
  max_inscripciones?: number | null;
  inscripciones_actuales?: number;
  imagen_url?: string | null;
}

interface PreviousSubInfo {
  planName: string;
  fechaFin: string;
}

const frecuenciaLabels: Record<string, string> = {
  mensual_libre: "Acceso ilimitado",
  "2x_semana": "2 veces por semana",
  "1x_semana": "1 vez por semana",
};

type PaymentStep = "select-plan" | "select-method" | "cash" | "card" | "external_platform" | "notify-admin";

const PlanSelection = () => {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<PaymentStep>("select-plan");
  const [previousSub, setPreviousSub] = useState<PreviousSubInfo | null>(null);
  const [notifyDone, setNotifyDone] = useState(false);
  const [notifyProcessing, setNotifyProcessing] = useState(false);
  const alumnoId = localStorage.getItem("registro_alumno_id");
  const isRenewal = localStorage.getItem("alumno_renewal") === "1";
  const isFromVacation = localStorage.getItem("alumno_from_vacation") === "1";
  const { applyDiscount } = useStudentDiscounts(alumnoId);

  useEffect(() => {
    if (!alumnoId) {
      navigate("/registro");
      return;
    }

    supabase
      .from("planes")
      .select("*")
      .eq("activo", true)
      .order("precio", { ascending: false })
      .then(async ({ data }) => {
        const planesData = (data as Plan[]) || [];
        // Fetch live subscription counts for programs with max capacity
        const programIds = planesData.filter(p => p.tipo === "programa" && p.max_inscripciones).map(p => p.id);
        if (programIds.length > 0) {
          const { data: subs } = await supabase.from("suscripciones").select("plan_id").in("plan_id", programIds).in("estado", ["activa", "pendiente_verificacion"]);
          if (subs) {
            const countMap: Record<string, number> = {};
            subs.forEach((s: any) => { countMap[s.plan_id] = (countMap[s.plan_id] || 0) + 1; });
            planesData.forEach(p => { if (countMap[p.id]) p.inscripciones_actuales = countMap[p.id]; });
          }
        }
        setPlanes(planesData);
        setLoading(false);
      });

    // If renewal, fetch previous subscription info
    if (isRenewal && alumnoId) {
      supabase
        .from("suscripciones")
        .select("fecha_fin, plan_id, planes(nombre)")
        .eq("alumno_id", alumnoId)
        .order("fecha_fin", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const sub = data[0] as any;
            setPreviousSub({
              planName: sub.planes?.nombre || "Plan anterior",
              fechaFin: sub.fecha_fin || "",
            });
          }
        });
    }
  }, [alumnoId, navigate, isRenewal]);

  const selectedPlan = planes.find((p) => p.id === selected);

  const formatPriceLocal = (precio: number, moneda: string = "ARS") => formatPrice(precio, moneda);

  // Cancel paused subscriptions when reactivating from vacation
  const cancelPausedSubs = async () => {
    if (isFromVacation && alumnoId) {
      await supabase
        .from("suscripciones")
        .update({ estado: "cancelada", cancelada_motivo: "Reactivación desde vacaciones" } as any)
        .eq("alumno_id", alumnoId)
        .eq("estado", "pausa");
    }
  };

  const handleMercadoPago = async () => {
    if (!selected || !alumnoId) return;
    setProcessing(true);
    setError(null);

    const plan = planes.find((p) => p.id === selected);
    if (!plan) return;

    await cancelPausedSubs();

    const { data: sub, error: subError } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: alumnoId,
        plan_id: plan.id,
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (subError) {
      setError("Error al procesar. Intentá nuevamente.");
      setProcessing(false);
      return;
    }

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mp-preference`;

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          plan_id: plan.id,
          alumno_id: alumnoId,
          suscripcion_id: sub.id,
        }),
      });

      const mpData = await response.json();

      if (!response.ok || !mpData?.init_point) {
        setError(mpData?.error || "Error al crear la preferencia de pago.");
        setProcessing(false);
        return;
      }

      window.location.href = mpData.init_point;
    } catch {
      setError("Error inesperado al conectar con Mercado Pago.");
      setProcessing(false);
    }
  };

  const handlePaymentMethod = (method: "mercadopago" | "card" | "cash" | "external_platform") => {
    setError(null);
    if (method === "mercadopago") {
      handleMercadoPago();
    } else if (method === "cash") {
      setStep("cash");
    } else if (method === "card") {
      setStep("card");
    } else if (method === "external_platform") {
      setStep("external_platform");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const handleNotifyAdmin = async () => {
    if (!alumnoId) return;
    setNotifyProcessing(true);

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-cash-payment`;
      await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          alumno_id: alumnoId,
          plan_id: previousSub ? undefined : undefined,
          tipo: "pago_externo",
        }),
      });
    } catch {
      // fire and forget
    }

    setNotifyProcessing(false);
    setNotifyDone(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando planes...</div>
      </div>
    );
  }

  // Notify admin done screen
  if (notifyDone) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <div className="max-w-md text-center space-y-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mx-auto">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
            Pago informado correctamente
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Recibimos tu aviso de pago. Administración lo va a revisar y te avisaremos cuando esté confirmado.
          </p>
          <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2 text-sm text-left">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-base">⏳</span>
              <span className="font-medium text-foreground">Pendiente de validación</span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              Tu pago está siendo revisado por administración. Te notificaremos por email cuando se confirme.
            </p>
          </div>
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => navigate("/")}
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  // Cash payment step
  if (step === "cash" && selectedPlan && alumnoId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <div className="text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-4" />
          </div>
          <CashPaymentConfirm
            planId={selectedPlan.id}
            planName={selectedPlan.nombre}
            alumnoId={alumnoId}
            onBack={() => setStep("select-method")}
          />
        </div>
      </div>
    );
  }

  // Card payment step
  if (step === "card" && selectedPlan && alumnoId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <div className="text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-4" />
          </div>
          <CardPaymentForm
            planId={selectedPlan.id}
            planName={selectedPlan.nombre}
            planPrice={selectedPlan.precio}
            alumnoId={alumnoId}
            onBack={() => setStep("select-method")}
          />
        </div>
      </div>
    );
  }

  // External platform payment step
  if (step === "external_platform" && selectedPlan && alumnoId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <div className="text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-4" />
          </div>
          <ExternalPaymentConfirm
            planId={selectedPlan.id}
            planName={selectedPlan.nombre}
            alumnoId={alumnoId}
            onBack={() => setStep("select-method")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
        </div>

        {/* Vacation reactivation banner */}
        {isRenewal && isFromVacation && (
          <div className="max-w-lg mx-auto rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">🏖️</span>
              <div className="space-y-1">
                <h2 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
                  ¡Bienvenido de vuelta!
                </h2>
                <p className="text-sm text-muted-foreground">
                  Tu membresía estaba en pausa. Elegí un plan para reactivar tu cuenta y volver a entrenar.
                </p>
              </div>
            </div>

            {previousSub && (
              <div className="rounded-md bg-secondary/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan anterior</span>
                  <span className="font-medium text-foreground">{previousSub.planName}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="gold"
                size="lg"
                className="flex-1"
                onClick={() => {
                  document.getElementById("planes-grid")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Elegir plan
              </Button>
              <Button
                variant="gold-outline"
                size="lg"
                className="flex-1"
                onClick={handleNotifyAdmin}
                disabled={notifyProcessing}
              >
                <MessageSquare className="w-4 h-4" />
                {notifyProcessing ? "Enviando..." : "Contactar administración"}
              </Button>
            </div>
          </div>
        )}

        {/* Renewal banner (non-vacation) */}
        {isRenewal && !isFromVacation && (
          <div className="max-w-lg mx-auto rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
                  Tu plan está vencido
                </h2>
                <p className="text-sm text-muted-foreground">
                  Para continuar usando la app y acceder a tus entrenamientos, necesitás renovar tu plan.
                </p>
              </div>
            </div>

            {previousSub && (
              <div className="rounded-md bg-secondary/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan anterior</span>
                  <span className="font-medium text-foreground">{previousSub.planName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venció el</span>
                  <span className="font-medium text-destructive">{formatDate(previousSub.fechaFin)}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="gold"
                size="lg"
                className="flex-1"
                onClick={() => {
                  document.getElementById("planes-grid")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Renovar plan
              </Button>
              <Button
                variant="gold-outline"
                size="lg"
                className="flex-1"
                onClick={handleNotifyAdmin}
                disabled={notifyProcessing}
              >
                <MessageSquare className="w-4 h-4" />
                {notifyProcessing ? "Enviando..." : "Informar pago a administración"}
              </Button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-3" id="planes-grid">
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            {isRenewal ? "Elegí tu nuevo plan" : "Elegí tu plan"}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Seleccioná el plan que mejor se adapte a tus objetivos
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planes.map((plan, index) => {
            const isPopular = index === 0;
            const isSelected = selected === plan.id;

            return (
              <button
                key={plan.id}
                onClick={() => {
                  setSelected(plan.id);
                  if (step !== "select-plan" && step !== "select-method") setStep("select-method");
                }}
                className={`relative text-left rounded-lg p-6 transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-primary card-glow"
                    : "hover:ring-1 hover:ring-border"
                } glass-card`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gold-gradient text-xs font-heading font-semibold uppercase tracking-wider text-primary-foreground">
                    Más elegido
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-heading font-semibold uppercase tracking-wider text-foreground">
                      {plan.nombre}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.tipo === "programa" ? "Programa" : frecuenciaLabels[plan.frecuencia] || plan.frecuencia}
                    </p>
                  </div>

                  <div>
                    {(() => {
                      const basePrice = plan.tipo === "programa" && plan.precio_promocional
                        ? plan.precio_promocional
                        : plan.precio;
                      const disc = applyDiscount(basePrice, "planes");
                      const hasPromo = plan.tipo === "programa" && plan.precio_promocional;
                      const hasStudentDiscount = disc.discount !== null;

                      return (
                        <>
                          {hasPromo && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(plan.precio, plan.moneda)}
                            </span>
                          )}
                          {hasStudentDiscount && !hasPromo && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(plan.precio, plan.moneda)}
                            </span>
                          )}
                          {hasStudentDiscount && hasPromo && (
                            <>
                              <br />
                              <span className="text-sm text-muted-foreground line-through">
                                {formatPrice(plan.precio_promocional!, plan.moneda)}
                              </span>
                            </>
                          )}
                          <br />
                          <span className="text-3xl font-heading font-bold gold-text-gradient">
                            {formatPrice(disc.final, plan.moneda)}
                          </span>
                          {plan.tipo !== "programa" && (
                            <span className="text-muted-foreground text-sm"> /mes</span>
                          )}
                          {hasStudentDiscount && (
                            <p className="text-xs text-emerald-400 mt-1">
                              {disc.discount!.nombre} (-{disc.discount!.valor}%)
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {plan.tipo === "programa" && plan.cuotas_cantidad && plan.cuota_valor && (
                    <p className="text-sm text-muted-foreground">
                      ó {plan.cuotas_cantidad} cuotas de {formatPrice(plan.cuota_valor, plan.moneda)}
                    </p>
                  )}

                  {plan.descripcion && (
                    <p className="text-sm text-secondary-foreground">
                      {plan.descripcion}
                    </p>
                  )}

                  {plan.tipo === "programa" && plan.max_inscripciones && (
                    <p className="text-xs text-muted-foreground">
                      {(plan.max_inscripciones - (plan.inscripciones_actuales || 0))} cupos disponibles
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className={`w-4 h-4 ${isSelected ? "text-primary" : ""}`} />
                    <span>Acceso a entrenamientos</span>
                  </div>

                  {plan.tipo === "programa" && plan.whatsapp_url && (
                    <a
                      href={plan.whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      Tengo dudas, quiero hablar con el equipo
                    </a>
                  )}
                </div>

                {isSelected && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full gold-gradient flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-md mx-auto text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">
            {error}
          </div>
        )}

        {/* Payment method selection or continue button */}
        <div className="flex flex-col items-center gap-4">
          {step === "select-method" && selected ? (
            <PaymentMethodSelector
              onSelect={handlePaymentMethod}
              processing={processing}
            />
          ) : (
            <Button
              variant="gold"
              size="lg"
              className="w-full max-w-md"
              disabled={!selected}
              onClick={() => setStep("select-method")}
            >
              Pagar
            </Button>
          )}

          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanSelection;
