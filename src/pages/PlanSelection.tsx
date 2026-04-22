import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft, AlertTriangle, MessageSquare, CheckCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import CardPaymentForm from "@/components/CardPaymentForm";
import CheckoutProgress from "@/components/checkout/CheckoutProgress";
import CheckoutSummaryCard from "@/components/checkout/CheckoutSummaryCard";
import CheckoutModalityStep from "@/components/checkout/CheckoutModalityStep";
import CheckoutMethodStep from "@/components/checkout/CheckoutMethodStep";
import CheckoutConfirmStep from "@/components/checkout/CheckoutConfirmStep";
import ManualPaymentConfirm from "@/components/checkout/ManualPaymentConfirm";

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

import type { DeclaredPaymentMethod } from "@/components/checkout/CheckoutMethodStep";

type PaymentMethod = DeclaredPaymentMethod;
type CheckoutStep = "select-plan" | "select-modality" | "select-method" | "confirm" | "processing" | "card-form";

const PlanSelection = () => {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>("select-plan");
  const [modality, setModality] = useState<"total" | "cuotas" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [otherMethodDetail, setOtherMethodDetail] = useState<string | null>(null);
  const [previousSub, setPreviousSub] = useState<PreviousSubInfo | null>(null);
  const [notifyDone, setNotifyDone] = useState(false);
  const [notifyProcessing, setNotifyProcessing] = useState(false);
  const alumnoId = localStorage.getItem("registro_alumno_id");
  const isRenewal = localStorage.getItem("alumno_renewal") === "1";
  const isFromVacation = localStorage.getItem("alumno_from_vacation") === "1";
  const upgradeFromSubId = localStorage.getItem("upgrade_from_sub_id");
  const upgradePreselectPlanId = localStorage.getItem("upgrade_preselect_plan_id");
  const isUpgradeFlow = !!upgradeFromSubId && !!upgradePreselectPlanId;
  const { applyDiscount, subscriptionCount } = useStudentDiscounts(alumnoId);

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

  // Si viene del flujo de upgrade, preseleccionar el plan automáticamente
  useEffect(() => {
    if (!loading && isUpgradeFlow && upgradePreselectPlanId && !selected) {
      const planExists = planes.find((p) => p.id === upgradePreselectPlanId);
      if (planExists) {
        setSelected(upgradePreselectPlanId);
        // Saltar al paso de método de pago directamente
        if (planExists.tipo === "programa" && planExists.cuotas_cantidad && planExists.cuota_valor) {
          setStep("select-modality");
        } else {
          setModality("total");
          setStep("select-method");
        }
      }
    }
  }, [loading, isUpgradeFlow, upgradePreselectPlanId, planes, selected]);

  const selectedPlan = planes.find((p) => p.id === selected);
  const isSecondary = subscriptionCount > 0;
  const selectedDiscount = selectedPlan
    ? applyDiscount(
        selectedPlan.tipo === "programa" && selectedPlan.precio_promocional
          ? selectedPlan.precio_promocional
          : selectedPlan.precio,
        "planes",
        isSecondary
      )
    : null;

  // Does selected plan support cuotas?
  const hasCuotas = selectedPlan?.tipo === "programa" && selectedPlan?.cuotas_cantidad && selectedPlan?.cuota_valor;

  // Compute step number for progress indicator
  const getStepNumber = (): number => {
    switch (step) {
      case "select-plan": return 1;
      case "select-modality": return 2;
      case "select-method": return hasCuotas ? 3 : 2;
      case "confirm": return hasCuotas ? 4 : 3;
      case "card-form": return hasCuotas ? 4 : 3;
      case "processing": return hasCuotas ? 4 : 3;
      default: return 1;
    }
  };

  const stepLabels = hasCuotas
    ? ["Plan", "Modalidad", "Medio", "Confirmar"]
    : ["Plan", "Medio de pago", "Confirmar"];

  const totalSteps = stepLabels.length;

  const cancelPausedSubs = async () => {
    if (isFromVacation && alumnoId) {
      await supabase
        .from("suscripciones")
        .update({ estado: "cancelada", cancelada_motivo: "Reactivación desde vacaciones" } as any)
        .eq("alumno_id", alumnoId)
        .eq("estado", "pausa");
    }
  };

  const handleSelectPlan = (planId: string) => {
    setSelected(planId);
    setModality(null);
    setPaymentMethod(null);
    setError(null);
  };

  const handleContinueFromPlan = () => {
    if (!selected) return;
    const plan = planes.find(p => p.id === selected);
    if (plan?.tipo === "programa" && plan.cuotas_cantidad && plan.cuota_valor) {
      setStep("select-modality");
    } else {
      setModality("total");
      setStep("select-method");
    }
  };

  const handleSelectModality = (mod: "total" | "cuotas") => {
    setModality(mod);
    setStep("select-method");
  };

  const handleSelectMethod = (method: PaymentMethod, otherDetail?: string) => {
    setPaymentMethod(method);
    setOtherMethodDetail(otherDetail ?? null);
    setError(null);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!selected || !alumnoId || !paymentMethod) return;

    if (paymentMethod === "mercadopago") {
      await handleMercadoPago();
    } else if (paymentMethod === "card") {
      setStep("card-form");
    } else {
      // efectivo / transferencia / mp_externo / tarjeta_externa / plataforma_externa
      // → auto-process via ManualPaymentConfirm
      setStep("processing");
    }
  };

  const handleMercadoPago = async () => {
    if (!selected || !alumnoId) return;
    setProcessing(true);
    setError(null);

    const plan = planes.find((p) => p.id === selected);
    if (!plan) return;

    await cancelPausedSubs();

    const disc = selectedDiscount;
    const now = new Date();
    const fechaInicio = now.toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDay.toISOString().split("T")[0];

    const upgradeMarker = isUpgradeFlow && upgradeFromSubId ? `UPGRADE_FROM:${upgradeFromSubId}` : null;

    const { data: sub, error: subError } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: alumnoId,
        plan_id: plan.id,
        estado: "pendiente",
        descuento_id: disc?.discount?.id ?? null,
        precio_base: disc?.original ?? plan.precio,
        precio_final: disc?.final ?? plan.precio,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        notas: upgradeMarker,
      } as any)
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
        body: JSON.stringify({ alumno_id: alumnoId, tipo: "pago_externo" }),
      });
    } catch {}
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
            ¡Listo, recibimos tu aviso!
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Administración lo va a revisar y te avisamos cuando esté confirmado.
          </p>
          <Button variant="gold" size="lg" className="w-full" onClick={() => navigate("/")}>
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  // Card form step
  if (step === "card-form" && selectedPlan && alumnoId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          <div className="text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-4" />
          </div>
          <CheckoutProgress currentStep={getStepNumber()} totalSteps={totalSteps} labels={stepLabels} />
          <CardPaymentForm
            planId={selectedPlan.id}
            planName={selectedPlan.nombre}
            planPrice={selectedDiscount?.final ?? selectedPlan.precio}
            precioBase={selectedDiscount?.original ?? selectedPlan.precio}
            descuentoId={selectedDiscount?.discount?.id ?? null}
            descuentoNombre={selectedDiscount?.discount?.nombre ?? null}
            descuentoValor={selectedDiscount?.discount?.valor ?? null}
            descuentoTipo={selectedDiscount?.discount?.tipo ?? null}
            moneda={selectedPlan.moneda || "ARS"}
            alumnoId={alumnoId}
            onBack={() => setStep("confirm")}
          />
        </div>
      </div>
    );
  }

  // Manual payment processing (any non-gateway method declared by student)
  const isManualMethod =
    paymentMethod === "efectivo" ||
    paymentMethod === "transferencia" ||
    paymentMethod === "mp_externo" ||
    paymentMethod === "otro";

  if (step === "processing" && selectedPlan && alumnoId && paymentMethod && isManualMethod) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          <div className="text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-4" />
          </div>
          <ManualPaymentConfirm
            planId={selectedPlan.id}
            planName={selectedPlan.nombre}
            alumnoId={alumnoId}
            precioBase={selectedDiscount?.original ?? selectedPlan.precio}
            precioFinal={selectedDiscount?.final ?? selectedPlan.precio}
            descuentoId={selectedDiscount?.discount?.id ?? null}
            moneda={selectedPlan.moneda || "ARS"}
            metodoPago={paymentMethod as "efectivo" | "transferencia" | "mp_externo" | "otro"}
            otherDetail={otherMethodDetail}
            onProcessing={setProcessing}
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

        {/* Progress indicator */}
        {step !== "select-plan" && (
          <CheckoutProgress currentStep={getStepNumber()} totalSteps={totalSteps} labels={stepLabels} />
        )}

        {/* Vacation reactivation banner */}
        {step === "select-plan" && isRenewal && isFromVacation && (
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
              <Button variant="gold" size="lg" className="flex-1" onClick={() => document.getElementById("planes-grid")?.scrollIntoView({ behavior: "smooth" })}>
                Elegir plan
              </Button>
              <Button variant="gold-outline" size="lg" className="flex-1" onClick={handleNotifyAdmin} disabled={notifyProcessing}>
                <MessageSquare className="w-4 h-4" />
                {notifyProcessing ? "Enviando..." : "Contactar administración"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={async () => {
                localStorage.removeItem("registro_alumno_id");
                localStorage.removeItem("alumno_renewal");
                localStorage.removeItem("alumno_from_vacation");
                await supabase.auth.signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Cerrar sesión
            </Button>
          </div>
        )}

        {/* Renewal banner (non-vacation) */}
        {step === "select-plan" && isRenewal && !isFromVacation && (
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
              <Button variant="gold" size="lg" className="flex-1" onClick={() => document.getElementById("planes-grid")?.scrollIntoView({ behavior: "smooth" })}>
                Renovar plan
              </Button>
              <Button variant="gold-outline" size="lg" className="flex-1" onClick={handleNotifyAdmin} disabled={notifyProcessing}>
                <MessageSquare className="w-4 h-4" />
                {notifyProcessing ? "Enviando..." : "Ya hice el pago"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={async () => {
                localStorage.removeItem("registro_alumno_id");
                localStorage.removeItem("alumno_renewal");
                localStorage.removeItem("alumno_from_vacation");
                await supabase.auth.signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Cerrar sesión
            </Button>
          </div>
        )}

        {/* STEP 1: Select Plan */}
        {step === "select-plan" && (
          <>
            <div className="text-center space-y-3" id="planes-grid">
              <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
                {isRenewal ? "Elegí tu nuevo plan" : "Elegí tu plan"}
              </h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Seleccioná el plan que mejor se adapte a tus objetivos
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {planes.map((plan, index) => {
                const isPopular = index === 0;
                const isSelected = selected === plan.id;
                const basePrice = plan.tipo === "programa" && plan.precio_promocional ? plan.precio_promocional : plan.precio;
                const disc = applyDiscount(basePrice, "planes", isSecondary);
                const hasPromo = plan.tipo === "programa" && plan.precio_promocional;
                const hasStudentDiscount = disc.discount !== null;

                return (
                  <button
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`relative text-left rounded-lg p-6 transition-all duration-200 ${
                      isSelected ? "ring-2 ring-primary card-glow" : "hover:ring-1 hover:ring-border"
                    } glass-card`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gold-gradient text-xs font-heading font-semibold uppercase tracking-wider text-primary-foreground">
                        Más elegido
                      </div>
                    )}
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-heading font-semibold uppercase tracking-wider text-foreground">{plan.nombre}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {plan.tipo === "programa" ? "Programa" : frecuenciaLabels[plan.frecuencia] || plan.frecuencia}
                        </p>
                      </div>
                      <div>
                        {hasPromo && (
                          <span className="text-sm text-muted-foreground line-through">{formatPrice(plan.precio, plan.moneda)}</span>
                        )}
                        {hasStudentDiscount && !hasPromo && (
                          <span className="text-sm text-muted-foreground line-through">{formatPrice(plan.precio, plan.moneda)}</span>
                        )}
                        {hasStudentDiscount && hasPromo && (
                          <>
                            <br />
                            <span className="text-sm text-muted-foreground line-through">{formatPrice(plan.precio_promocional!, plan.moneda)}</span>
                          </>
                        )}
                        <br />
                        <span className="text-3xl font-heading font-bold gold-text-gradient">{formatPrice(disc.final, plan.moneda)}</span>
                        {plan.tipo !== "programa" && <span className="text-muted-foreground text-sm"> /mes</span>}
                        {hasStudentDiscount && (
                          <p className="text-xs text-emerald-400 mt-1">{disc.discount!.nombre} (-{disc.discount!.valor}%)</p>
                        )}
                      </div>
                      {plan.tipo === "programa" && plan.cuotas_cantidad && plan.cuota_valor && (
                        <p className="text-sm text-muted-foreground">
                          ó {plan.cuotas_cantidad} cuotas de {formatPrice(plan.cuota_valor, plan.moneda)}
                        </p>
                      )}
                      {plan.descripcion && <p className="text-sm text-secondary-foreground">{plan.descripcion}</p>}
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

            {error && (
              <div className="max-w-md mx-auto text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">{error}</div>
            )}

            <div className="flex flex-col items-center gap-4">
              <Button variant="gold" size="lg" className="w-full max-w-md" disabled={!selected} onClick={handleContinueFromPlan}>
                Continuar
              </Button>
              <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="w-3 h-3" />
                Volver al inicio
              </button>
            </div>
          </>
        )}

        {/* STEP 2 (programs only): Select Modality */}
        {step === "select-modality" && selectedPlan && selectedDiscount && (
          <div className="max-w-lg mx-auto space-y-6">
            <CheckoutSummaryCard
              planName={selectedPlan.nombre}
              precioBase={selectedDiscount.original}
              precioFinal={selectedDiscount.final}
              moneda={selectedPlan.moneda || "ARS"}
              frecuencia={selectedPlan.frecuencia}
              discountName={selectedDiscount.discount?.nombre}
              discountValue={selectedDiscount.discount?.valor}
              discountType={selectedDiscount.discount?.tipo}
              collapsible
            />
            <CheckoutModalityStep
              precioFinal={selectedDiscount.final}
              moneda={selectedPlan.moneda || "ARS"}
              cuotasCantidad={selectedPlan.cuotas_cantidad!}
              cuotaValor={selectedPlan.cuota_valor!}
              onSelect={handleSelectModality}
              onBack={() => setStep("select-plan")}
            />
          </div>
        )}

        {/* STEP 2/3: Select Payment Method */}
        {step === "select-method" && selectedPlan && selectedDiscount && (
          <div className="max-w-lg mx-auto space-y-6">
            <CheckoutSummaryCard
              planName={selectedPlan.nombre}
              precioBase={selectedDiscount.original}
              precioFinal={selectedDiscount.final}
              moneda={selectedPlan.moneda || "ARS"}
              frecuencia={selectedPlan.frecuencia}
              modality={modality}
              cuotasCantidad={selectedPlan.cuotas_cantidad}
              cuotaValor={selectedPlan.cuota_valor}
              discountName={selectedDiscount.discount?.nombre}
              discountValue={selectedDiscount.discount?.valor}
              discountType={selectedDiscount.discount?.tipo}
              collapsible
            />
            <CheckoutMethodStep
              onSelect={handleSelectMethod}
              processing={processing}
              onBack={() => setStep(hasCuotas ? "select-modality" : "select-plan")}
            />
          </div>
        )}

        {/* STEP 3/4: Confirm */}
        {step === "confirm" && selectedPlan && selectedDiscount && paymentMethod && (
          <div className="max-w-lg mx-auto space-y-6">
            <CheckoutConfirmStep
              planName={selectedPlan.nombre}
              frecuencia={selectedPlan.frecuencia}
              precioBase={selectedDiscount.original}
              precioFinal={selectedDiscount.final}
              moneda={selectedPlan.moneda || "ARS"}
              modality={modality}
              cuotasCantidad={selectedPlan.cuotas_cantidad}
              cuotaValor={selectedPlan.cuota_valor}
              paymentMethod={paymentMethod}
              discountName={selectedDiscount.discount?.nombre}
              discountValue={selectedDiscount.discount?.valor}
              discountType={selectedDiscount.discount?.tipo}
              processing={processing}
              onConfirm={handleConfirm}
              onBack={() => setStep("select-method")}
            />
          </div>
        )}

        {/* Error at any step */}
        {error && step !== "select-plan" && (
          <div className="max-w-md mx-auto text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">{error}</div>
        )}
      </div>
    </div>
  );
};

export default PlanSelection;
