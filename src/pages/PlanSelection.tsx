import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowLeft, AlertTriangle, MessageSquare, CheckCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import CardPaymentForm from "@/components/CardPaymentForm";
import CheckoutProgress from "@/components/checkout/CheckoutProgress";
import CheckoutSummaryCard from "@/components/checkout/CheckoutSummaryCard";
import CheckoutModalityStep from "@/components/checkout/CheckoutModalityStep";
import CheckoutMethodStep from "@/components/checkout/CheckoutMethodStep";
import CheckoutConfirmStep from "@/components/checkout/CheckoutConfirmStep";
import ManualPaymentConfirm from "@/components/checkout/ManualPaymentConfirm";
import { getEffectiveSubStatus } from "@/lib/subscriptionStatus";
import { getEarlyRenewal, clearEarlyRenewal, formatLocalDate } from "@/lib/earlyRenewal";
import { tryReuseExistingSubscription, clearReuseSubId, getReuseSubId, expireStaleSubs } from "@/lib/paymentReuseSub";
import PausaConfirmDialog from "@/components/PausaConfirmDialog";

interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  frecuencia: string;
  moneda?: string;
  tipo?: string;
  categoria?: string;
  precio_promocional?: number | null;
  cuotas_cantidad?: number | null;
  cuota_valor?: number | null;
  whatsapp_url?: string | null;
  max_inscripciones?: number | null;
  inscripciones_actuales?: number;
  imagen_url?: string | null;
  features?: { text: string; included: boolean }[] | null;
}


interface PreviousSubInfo {
  planId: string;
  planName: string;
  fechaFin: string;
  canceladaAt?: string | null;
  estado?: string;
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
  const alumnoId = localStorage.getItem("registro_alumno_id");
  const isRenewal = localStorage.getItem("alumno_renewal") === "1";
  const earlyRenewal = getEarlyRenewal();
  const isEarlyRenewal = !!earlyRenewal;
  const isFromVacation = localStorage.getItem("alumno_from_vacation") === "1";
  const upgradeFromSubId = localStorage.getItem("upgrade_from_sub_id");
  const upgradePreselectPlanId = localStorage.getItem("upgrade_preselect_plan_id");
  const vacationPreselectPlanId = localStorage.getItem("alumno_preselect_plan_id");
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
  const [renewalContextLoaded, setRenewalContextLoaded] = useState(!isRenewal);
  const [notifyDone, setNotifyDone] = useState(false);
  const [notifyProcessing, setNotifyProcessing] = useState(false);
  const [activeGrupalPlan, setActiveGrupalPlan] = useState<{ planId: string; planName: string } | null>(null);
  const [activePausaPlan, setActivePausaPlan] = useState<{ planId: string; planName: string } | null>(null);
  // Cuando el alumno elige una pausa, almacenamos la fecha de regreso confirmada en el diálogo.
  // Esto fuerza fecha_fin de la suscripción al valor elegido (en vez del fin de mes habitual).
  const [pausaFechaRegreso, setPausaFechaRegreso] = useState<string | null>(null);
  const [pausaDialogPlanId, setPausaDialogPlanId] = useState<string | null>(null);
  const isUpgradeFlow = !!upgradeFromSubId && !!upgradePreselectPlanId;
  const { applyDiscount, isSecondActivityForNew } = useStudentDiscounts(alumnoId);


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
        const planesData = ((data as any[]) || []) as Plan[];
        const programIds = planesData.filter(p => p.tipo === "programa" && p.max_inscripciones).map(p => p.id);
        if (programIds.length > 0) {
          const { data: counts } = await supabase.rpc("get_program_inscriptions_count", { p_plan_ids: programIds } as any);
          if (counts) {
            const countMap: Record<string, number> = {};
            (counts as any[]).forEach((c) => { countMap[c.plan_id] = Number(c.count) || 0; });
            planesData.forEach(p => { if (countMap[p.id]) p.inscripciones_actuales = countMap[p.id]; });
          }
        }
        setPlanes(planesData);
        setLoading(false);
      });

    if (!isRenewal || !alumnoId) {
      setRenewalContextLoaded(true);
      return;
    }

    let isMounted = true;

    const loadRenewalContext = async () => {
      setRenewalContextLoaded(false);

      const { data: accessSubs } = await supabase
        .from("suscripciones")
        .select("estado, fecha_fin, cancelada_at")
        .eq("alumno_id", alumnoId)
        .in("estado", ["activa", "pendiente_verificacion", "cancelada"])
        .order("fecha_fin", { ascending: false })
        .limit(10);

      const hasCurrentAccess = (accessSubs || []).some((sub: any) => {
        const effectiveStatus = getEffectiveSubStatus({
          estado: sub.estado,
          fecha_fin: sub.fecha_fin,
          cancelada_at: sub.cancelada_at,
        });

        return (
          effectiveStatus === "activa" ||
          effectiveStatus === "pendiente_verificacion" ||
          effectiveStatus === "pago_pendiente"
        );
      });

      if (hasCurrentAccess && !isEarlyRenewal) {
        localStorage.removeItem("alumno_renewal");
        localStorage.removeItem("alumno_from_vacation");
        localStorage.removeItem("upgrade_from_sub_id");
        localStorage.removeItem("upgrade_preselect_plan_id");
        clearEarlyRenewal();
        navigate("/alumno", { replace: true });
        return;
      }

      // Solo nos interesan suscripciones que efectivamente representan un período pagado
      // o cancelado. Las "pendiente" / "pendiente_verificacion" son intentos de pago abandonados
      // y NO deben aparecer como "plan anterior vencido".
      const { data } = await supabase
        .from("suscripciones")
        .select("fecha_fin, plan_id, estado, cancelada_at, planes(nombre)")
        .eq("alumno_id", alumnoId)
        .in("estado", ["activa", "cancelada", "vencida"])
        .order("fecha_fin", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!isMounted) return;

      if (data && data.length > 0) {
        const sub = data[0] as any;
        setPreviousSub({
          planId: sub.plan_id,
          planName: sub.planes?.nombre || "Plan anterior",
          fechaFin: sub.fecha_fin || "",
          canceladaAt: sub.cancelada_at,
          estado: sub.estado,
        });
      } else {
        setPreviousSub(null);
      }

      setRenewalContextLoaded(true);
    };

    void loadRenewalContext();

    return () => {
      isMounted = false;
    };
  }, [alumnoId, navigate, isRenewal]);

  // Cargar plan grupal y pausa activos (para bloquear combinaciones incompatibles)
  useEffect(() => {
    if (!alumnoId) return;
    let cancel = false;
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("suscripciones")
        .select("plan_id, fecha_fin, estado, planes(nombre, categoria)")
        .eq("alumno_id", alumnoId)
        .in("estado", ["activa", "pendiente", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"])
        .is("cancelada_at", null)
        .gte("fecha_fin", today);
      if (cancel) return;
      const subs = (data as any[] | null) || [];
      const grupal = subs.find((s) => s.planes?.categoria === "grupal");
      const pausa = subs.find((s) => s.planes?.categoria === "pausa");
      if (grupal && !upgradeFromSubId) {
        setActiveGrupalPlan({ planId: grupal.plan_id, planName: grupal.planes?.nombre || "Plan grupal" });
      }
      if (pausa) {
        setActivePausaPlan({ planId: pausa.plan_id, planName: pausa.planes?.nombre || "Pausa" });
      }
    })();
    return () => { cancel = true; };
  }, [alumnoId, upgradeFromSubId]);


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

  // Reactivación 1-click desde Pausa: sugerir el último plan grupal.
  // Si viene del flujo "Pagar este plan" (sub pendiente), saltamos directo al paso de medio de pago.
  useEffect(() => {
    if (!loading && vacationPreselectPlanId && !selected && !isUpgradeFlow) {
      const planExists = planes.find((p) => p.id === vacationPreselectPlanId);
      if (planExists) {
        setSelected(vacationPreselectPlanId);
        const skipToMethod = localStorage.getItem("alumno_pay_pending_skip") === "1";
        if (skipToMethod) {
          if (planExists.tipo === "programa" && planExists.cuotas_cantidad && planExists.cuota_valor) {
            setStep("select-modality");
          } else {
            setModality("total");
            setStep("select-method");
          }
          localStorage.removeItem("alumno_pay_pending_skip");
        }
      }
      localStorage.removeItem("alumno_preselect_plan_id");
    }
  }, [loading, vacationPreselectPlanId, planes, selected, isUpgradeFlow]);

  const selectedPlan = planes.find((p) => p.id === selected);
  const isSecondary = isSecondActivityForNew(selectedPlan?.categoria);
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
    const plan = planes.find(p => p.id === planId);
    // Si el alumno ya está en pausa, bloquear elegir otro plan distinto SALVO que venga
    // explícitamente desde el flujo de reactivación de vacaciones (la pausa se cancela al confirmar).
    if (activePausaPlan && plan?.categoria !== "pausa" && !isFromVacation) {
      setSelected(null);
      setError(
        `Tu cuenta está en pausa hasta la fecha que indicaste. Para volver a entrenar tenés que esperar a que termine o cancelarla desde tu perfil.`
      );
      return;
    }

    // Bloquear si el alumno ya tiene un plan grupal activo y elige otro grupal distinto
    if (
      plan?.categoria === "grupal" &&
      activeGrupalPlan &&
      activeGrupalPlan.planId !== planId
    ) {
      setSelected(null);
      setError(
        `Ya tenés un plan grupal activo (${activeGrupalPlan.planName}). Solo podés tener un plan grupal a la vez. Si querés cambiarlo, cancelá el actual o esperá a que finalice el período.`
      );
      return;
    }
    // Pausa: abrir diálogo de confirmación con fecha de regreso
    if (plan?.categoria === "pausa") {
      setPausaDialogPlanId(planId);
      setError(null);
      return;
    }
    setSelected(planId);
    setModality(null);
    setPaymentMethod(null);
    setPausaFechaRegreso(null);
    setError(null);
  };

  const handleConfirmPausa = (fechaRegreso: string) => {
    if (!pausaDialogPlanId) return;
    setPausaFechaRegreso(fechaRegreso);
    setSelected(pausaDialogPlanId);
    setModality("total");
    setPaymentMethod(null);
    setPausaDialogPlanId(null);
    setStep("select-method");
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

    try {
      const plan = planes.find((p) => p.id === selected);
      if (!plan) {
        setError("No pudimos encontrar el plan seleccionado. Recargá la página e intentá de nuevo.");
        setProcessing(false);
        return;
      }

      try {
        await cancelPausedSubs();
      } catch (e) {
        console.error("[handleMercadoPago] cancelPausedSubs failed", e);
      }

      // Limpieza previa: si el alumno tiene subs "activas" cuya fecha_fin ya
      // pasó (cron aún no corrió), las marcamos vencidas para que el trigger
      // de duplicado no bloquee al insertar la sub del período nuevo.
      await expireStaleSubs(alumnoId, plan.id);

      const disc = selectedDiscount;
      let fechaInicio: string;
      let fechaFin: string;
      if (earlyRenewal) {
        fechaInicio = earlyRenewal.fechaInicio;
        fechaFin = earlyRenewal.fechaFin;
        if (earlyRenewal.autoRenovacion && earlyRenewal.subId) {
          await supabase
            .from("suscripciones")
            .update({ auto_renovacion: false } as any)
            .eq("id", earlyRenewal.subId);
        }
      } else if (pausaFechaRegreso && plan.categoria === "pausa") {
        const now = new Date();
        fechaInicio = now.toISOString().split("T")[0];
        fechaFin = pausaFechaRegreso;
      } else {
        const now = new Date();
        fechaInicio = now.toISOString().split("T")[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        fechaFin = lastDay.toISOString().split("T")[0];
      }

      const upgradeMarker = isUpgradeFlow && upgradeFromSubId ? `UPGRADE_FROM:${upgradeFromSubId}` : null;
      const earlyMarker = earlyRenewal ? `EARLY_RENEWAL_FROM:${earlyRenewal.subId}` : null;
      const notasMarker = [upgradeMarker, earlyMarker].filter(Boolean).join(" | ") || null;

      let subId: string | null = null;
      const reused = !earlyRenewal && !isUpgradeFlow
        ? await tryReuseExistingSubscription(alumnoId, plan.id, {
            estado: "pendiente",
            descuento_id: disc?.discount?.id ?? null,
            precio_base: disc?.original ?? plan.precio,
            precio_final: disc?.final ?? plan.precio,
          })
        : null;

      if (reused) {
        subId = reused.id;
      } else {
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
            notas: notasMarker,
          } as any)
          .select("id")
          .single();

        if (subError) {
          const msg = (subError as any)?.message || "";
          console.error("[handleMercadoPago] subscription insert failed", subError);
          if (msg.includes("PAUSA_BLOCKED_BY_ACTIVE_SUB")) {
            setError("No podés activar la pausa porque tenés un plan deportivo vigente que debe cancelarse primero. Contactá administración.");
          } else if (msg.includes("BLOCKED_BY_ACTIVE_PAUSA")) {
            setError("Tu cuenta está en pausa. Para contratar otro plan, primero hay que cancelar la pausa.");
          } else if (msg.includes("PAUSA_TOO_LONG")) {
            setError("La pausa no puede durar más de 2 meses.");
          } else if (msg.includes("DUPLICATE_GRUPAL_CATEGORY")) {
            setError("Ya tenés un plan grupal activo. Solo podés tener un plan grupal a la vez (Pase Libre, Grupal 1x, Grupal 2x o Grupo de formación).");
          } else if (msg.includes("DUPLICATE_ACTIVE_SUB")) {
            setError("Ya tenés este mismo plan activo para este período.");
          } else {
            setError("Error al procesar. Intentá nuevamente.");
          }
          setProcessing(false);
          return;
        }
        subId = sub.id;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mp-preference`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          plan_id: plan.id,
          alumno_id: alumnoId,
          suscripcion_id: subId,
        }),
      });

      const mpData = await response.json().catch(() => null);

      if (!response.ok || !mpData?.init_point) {
        console.error("[handleMercadoPago] MP preference error", response.status, mpData);
        setError(mpData?.error || `Error al crear la preferencia de pago (${response.status}). Intentá nuevamente.`);
        setProcessing(false);
        return;
      }

      window.location.href = mpData.init_point;
    } catch (e) {
      console.error("[handleMercadoPago] unexpected error", e);
      setError("Error inesperado al conectar con Mercado Pago. Recargá y probá de nuevo.");
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
    setError(null);
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-cash-payment`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          alumno_id: alumnoId,
          plan_id: previousSub?.planId ?? null,
          payment_type: "plataforma_externa",
          tipo: "pago_externo",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "No pudimos registrar el pago informado.");
      }

      setNotifyDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar el pago informado.");
    } finally {
      setNotifyProcessing(false);
    }
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
            allowAutoRenewal={selectedPlan.frecuencia === "mensual" && (selectedPlan as any).permite_auto_cobro === true}
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
            upgradeFromSubId={isUpgradeFlow ? upgradeFromSubId : null}
            overrideFechaFin={selectedPlan.categoria === "pausa" ? pausaFechaRegreso : null}
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

        {/* Early-renewal banner */}
        {step === "select-plan" && isEarlyRenewal && earlyRenewal && (
          <div className="max-w-lg mx-auto rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">🔄</span>
              <div className="space-y-1">
                <h2 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
                  Renovación anticipada
                </h2>
                <p className="text-sm text-muted-foreground">
                  Tu plan actual sigue vigente. El próximo período arranca el{" "}
                  <strong className="text-foreground">{formatLocalDate(earlyRenewal.fechaInicio)}</strong> y va
                  hasta el <strong className="text-foreground">{formatLocalDate(earlyRenewal.fechaFin)}</strong>.
                  Podés mantener el mismo plan o cambiarlo.
                </p>
                {earlyRenewal.autoRenovacion && (
                  <p className="text-xs text-amber-500 mt-2">
                    ⚠️ Vas a desactivar la renovación automática del plan vigente para evitar un doble cobro.
                  </p>
                )}
              </div>
            </div>
          </div>
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
            localStorage.removeItem("upgrade_from_sub_id");
            localStorage.removeItem("upgrade_preselect_plan_id");
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
        {step === "select-plan" && isRenewal && !isFromVacation && !isEarlyRenewal && renewalContextLoaded && (() => {
          const wasCancelled = !!previousSub?.canceladaAt;
          const finStr = previousSub?.fechaFin?.substring(0, 10);
          let finIsFuture = false;
          if (finStr) {
            const [y, m, d] = finStr.split("-").map(Number);
            const fin = new Date(y, m - 1, d, 23, 59, 59);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            finIsFuture = today <= fin;
          }
          // Tres escenarios:
          // 1. Cancelada con fecha futura → "Plan cancelado, vigente hasta..."
          // 2. Cancelada con fecha pasada → "Plan cancelado el..."
          // 3. Sin cancelar (vencido por falta de pago) → "Plan vencido"
          const isCancelledActive = wasCancelled && finIsFuture;
          const isCancelledExpired = wasCancelled && !finIsFuture;

          const heading = isCancelledActive
            ? "Tu plan está cancelado"
            : isCancelledExpired
              ? "Tu plan fue cancelado"
              : "Tu plan está vencido";
          const subtext = isCancelledActive
            ? "Cancelaste tu suscripción pero seguís con acceso hasta la fecha de fin del período. Si querés volver a entrenar después de esa fecha, contratá un plan nuevo."
            : isCancelledExpired
              ? "Tu plan fue cancelado y ya no tenés acceso. Para volver a entrenar, contratá un plan nuevo."
              : "Para continuar usando la app y acceder a tus entrenamientos, necesitás renovar tu plan.";

          return (
          <div className="max-w-lg mx-auto rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
                  {heading}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {subtext}
                </p>
              </div>
            </div>
            {previousSub && (
              <div className="rounded-md bg-secondary/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan anterior</span>
                  <span className="font-medium text-foreground">{previousSub.planName}</span>
                </div>
                {isCancelledActive ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acceso hasta</span>
                    <span className="font-medium text-foreground">{formatDate(previousSub.fechaFin)}</span>
                  </div>
                ) : isCancelledExpired ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cancelado el</span>
                    <span className="font-medium text-destructive">{formatDate(previousSub.canceladaAt!)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Venció el</span>
                    <span className="font-medium text-destructive">{formatDate(previousSub.fechaFin)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="gold" size="lg" className="flex-1" onClick={() => {
                if (isCancelledActive) {
                  // Tiene acceso vigente: lo mandamos al dashboard
                  navigate("/alumno");
                } else {
                  document.getElementById("planes-grid")?.scrollIntoView({ behavior: "smooth" });
                }
              }}>
                {isCancelledActive ? "Volver a mi cuenta" : isCancelledExpired ? "Contratar plan" : "Renovar plan"}
              </Button>
              {!isCancelledActive && (
                <Button variant="gold-outline" size="lg" className="flex-1" onClick={handleNotifyAdmin} disabled={notifyProcessing}>
                  <MessageSquare className="w-4 h-4" />
                  {notifyProcessing ? "Enviando..." : "Ya hice el pago"}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={async () => {
                localStorage.removeItem("registro_alumno_id");
                localStorage.removeItem("alumno_renewal");
                localStorage.removeItem("alumno_from_vacation");
            localStorage.removeItem("upgrade_from_sub_id");
            localStorage.removeItem("upgrade_preselect_plan_id");
                await supabase.auth.signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Cerrar sesión
            </Button>
          </div>
          );
        })()}

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
                const disc = applyDiscount(basePrice, "planes", isSecondActivityForNew(plan.categoria));
                const hasPromo = plan.tipo === "programa" && plan.precio_promocional;
                const hasStudentDiscount = disc.discount !== null;

                return (
                  <div key={plan.id} className="contents">
                  <button
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
                      {(() => {
                        const feats = Array.isArray(plan.features) && plan.features.length > 0
                          ? plan.features
                          : [{ text: "Acceso a entrenamientos", included: true }];
                        return (
                          <ul className="space-y-1.5">
                            {feats.map((f, i) => (
                              <li key={i} className={`flex items-start gap-2 text-sm ${f.included ? "text-muted-foreground" : "text-muted-foreground/70 line-through decoration-destructive/40"}`}>
                                {f.included ? (
                                  <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-emerald-500"}`} />
                                ) : (
                                  <X className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                                )}
                                <span>{f.text}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}

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
                  {isSelected && (
                    <div className="md:col-span-3 animate-fade-in">
                      <Button
                        variant="gold"
                        size="lg"
                        className="w-full md:max-w-md md:mx-auto flex"
                        onClick={handleContinueFromPlan}
                      >
                        Continuar con {selectedPlan?.nombre ?? plan.nombre}
                      </Button>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="max-w-md mx-auto text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">{error}</div>
            )}

            <div className="flex flex-col items-center gap-4">
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
              transferOnly={selectedPlan?.categoria === "asesoria"}
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

      {/* Diálogo de confirmación de Pausa */}
      {pausaDialogPlanId && alumnoId && (
        <PausaConfirmDialog
          open={!!pausaDialogPlanId}
          alumnoId={alumnoId}
          planNombre={planes.find(p => p.id === pausaDialogPlanId)?.nombre || "Pausa"}
          onCancel={() => setPausaDialogPlanId(null)}
          onConfirm={handleConfirmPausa}
        />
      )}
    </div>
  );
};

export default PlanSelection;
