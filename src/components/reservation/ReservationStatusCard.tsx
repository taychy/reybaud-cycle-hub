import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/lib/currency";
import {
  Shield, CheckCircle, AlertCircle, Clock, XCircle, Ban,
  Banknote, FileText, MessageCircle, CreditCard, Eye, Upload, X,
  ChevronDown, ChevronUp, ChevronRight, Bell, CalendarDays, ArrowRight,
  HelpCircle, Bike, Footprints, Plane, ShieldCheck, Package,
  CircleDot, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReportPaymentDrawer from "./ReportPaymentDrawer";
import CancelReservationDrawer from "./CancelReservationDrawer";
import TripBikeDrawer from "./TripBikeDrawer";
import TripPedalsDrawer from "./TripPedalsDrawer";
import TripDocumentDrawer from "./TripDocumentDrawer";
import { buildWhatsAppUrl, buildRecordHoraHelpMessage } from "@/lib/contactInfo";

interface Reservation {
  id: string;
  reservation_status: string;
  payment_status: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  price_snapshot: number | null;
  currency_snapshot: string | null;
  moneda: string;
  metodo_pago: string;
  notas: string | null;
  admin_notes: string | null;
  participant_notes: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  next_due_date: string | null;
}

interface CancellationPolicy {
  allow_cancellation: boolean;
  cancellation_days_before: number;
  cancellation_type: string;
  cancellation_text_short: string;
  cancellation_text_full: string;
  require_reason: boolean;
}

interface ReservationStatusCardProps {
  reservation: Reservation;
  alumnoId: string;
  eventCurrency: string;
  eventDate: string;
  eventTitle: string;
  eventType?: string;
  eventMetadata?: any;
  reglamentoUrl?: string;
  whatsappUrl?: string;
  alumnoNombre?: string | null;
  onPaymentReported: () => void;
}

interface TimelineEntry {
  date: string;
  label: string;
  type: "reservation" | "payment" | "notification" | "status";
  detail?: string;
}

interface NotificationRecord {
  id: string;
  tipo: string;
  canal: string;
  asunto: string;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  status: string;
  created_at: string;
}

const installmentFromMetadata = (meta: any) => {
  if (!meta?.installments_enabled || !meta?.installments) return [];
  return meta.installments as { number: number; amount: string; due_date: string; label: string }[];
};

/* ─── Human-friendly status messages ─── */
const getHumanStatus = (reservation: Reservation, isTripLike: boolean = true): { title: string; subtitle: string; tone: "success" | "info" | "warning" | "error" | "neutral" } => {
  const rs = reservation.reservation_status;
  const ps = reservation.payment_status;

  // Non-trip events (record_hora, carrera, otro): simple school-event experience
  if (!isTripLike) {
    if (["cancelada", "rechazada"].includes(rs))
      return { title: "Inscripción cancelada", subtitle: "", tone: "neutral" };
    if (rs === "reserva_confirmada" && ps === "pago_validado")
      return { title: "Inscripción y pago confirmados 🎉", subtitle: "Te esperamos el día del evento.", tone: "success" };
    if (rs === "reserva_confirmada" && ps === "pago_informado")
      return { title: "Pago informado, en revisión", subtitle: "Estamos verificando tu pago. Te avisamos cuando esté confirmado.", tone: "info" };
    if (rs === "reserva_confirmada" && ps === "no_aplica")
      return { title: "Inscripción confirmada 🎉", subtitle: "Te esperamos el día del evento.", tone: "success" };
    if (rs === "reserva_confirmada")
      return { title: "Inscripción confirmada", subtitle: "Realizá tu pago e informalo para asegurar tu lugar.", tone: "warning" };
    if (ps === "pago_informado")
      return { title: "Pago informado, en revisión", subtitle: "Estamos verificando tu pago. Te avisamos cuando esté confirmado.", tone: "info" };
    return { title: "Inscripción recibida", subtitle: "El equipo está revisando tu inscripción. Te avisamos pronto.", tone: "info" };
  }

  if (rs === "reserva_confirmada" && ps === "pago_validado")
    return { title: "¡Tu lugar está confirmado! 🎉", subtitle: "Todo en orden. Ahora a preparar el viaje.", tone: "success" };
  if (rs === "reserva_confirmada" && ps === "parcial")
    return { title: "Tu lugar ya está reservado", subtitle: "Registramos correctamente tu pago inicial. Seguí completando tu plan de pago.", tone: "info" };
  if (rs === "reserva_confirmada" && ps === "pago_informado")
    return { title: "Tu lugar ya está reservado", subtitle: "Estamos verificando tu último pago. No necesitás hacer nada más por ahora.", tone: "info" };
  if (rs === "reserva_confirmada" && ps === "no_informado")
    return { title: "Tu lugar ya está reservado", subtitle: "Realizá tu pago para asegurar tu lugar.", tone: "warning" };
  if (rs === "solicitud_enviada")
    return { title: "Solicitud recibida", subtitle: "El equipo está revisando tu solicitud. Te avisamos pronto.", tone: "info" };
  if (rs === "reserva_pendiente")
    return { title: "Reserva pendiente", subtitle: "Estamos procesando tu reserva.", tone: "info" };
  if (ps === "pago_rechazado")
    return { title: "Revisá tu pago", subtitle: "Hubo un problema con tu comprobante. Actualizalo para continuar.", tone: "error" };
  if (rs === "cancelacion_solicitada")
    return { title: "Cancelación en proceso", subtitle: "Tu solicitud de cancelación está siendo revisada.", tone: "neutral" };
  if (rs === "cancelada")
    return { title: "Reserva cancelada", subtitle: "Tu reserva fue cancelada.", tone: "neutral" };
  if (rs === "rechazada")
    return { title: "Reserva rechazada", subtitle: "Contactá al equipo para más información.", tone: "error" };
  if (ps === "pago_informado")
    return { title: "Pago en revisión", subtitle: "Estamos verificando tu pago. Te avisamos cuando esté confirmado.", tone: "info" };
  return { title: "Tu reserva está activa", subtitle: "", tone: "info" };
};

const toneStyles: Record<string, { border: string; bg: string; icon: string; iconBg: string }> = {
  success: { border: "border-emerald-500/40", bg: "bg-emerald-500/5", icon: "text-emerald-400", iconBg: "bg-emerald-500/20" },
  info: { border: "border-primary/30", bg: "bg-primary/5", icon: "text-primary", iconBg: "bg-primary/20" },
  warning: { border: "border-amber-500/40", bg: "bg-amber-500/5", icon: "text-amber-400", iconBg: "bg-amber-500/20" },
  error: { border: "border-destructive/40", bg: "bg-destructive/5", icon: "text-destructive", iconBg: "bg-destructive/20" },
  neutral: { border: "border-border", bg: "bg-muted/30", icon: "text-muted-foreground", iconBg: "bg-muted" },
};

const toneIcon: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  info: Shield,
  warning: AlertCircle,
  error: XCircle,
  neutral: Ban,
};

/* ─── Onboarding stepper ─── */
const stepperSteps = [
  { key: "reserva", label: "Reserva realizada", description: "Tu lugar fue separado" },
  { key: "pago", label: "Pago cargado", description: "Informaste tu comprobante" },
  { key: "validacion", label: "Pago validado", description: "Confirmado por administración" },
];

const getStepperIndex = (reservation: Reservation): number => {
  if (reservation.reservation_status === "reserva_confirmada" && reservation.payment_status === "pago_validado") return 3;
  if (["pago_informado", "pago_validado"].includes(reservation.payment_status)) return 2;
  if (reservation.payment_status === "parcial") return 2;
  return 1;
};

const getStepperLabel = (index: number): string => {
  if (index >= 3) return "¡Todo listo!";
  if (index === 2) return "Estás acá: verificación en curso";
  return "Estás acá: completando tu plan de pago";
};

/* ─── Checklist items ─── */
interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Bike;
  completed: boolean;
  actionType: "bike" | "pedals" | "document" | "payment" | "none";
}

const buildChecklist = (reservation: Reservation, meta: any, checklistData: Record<string, any>): ChecklistItem[] => {
  const items: ChecklistItem[] = [
    {
      id: "reserva",
      label: "Reserva realizada",
      description: "Tu lugar está separado",
      icon: CheckCircle,
      completed: true,
      actionType: "none",
    },
    {
      id: "pago",
      label: "Informar próximo pago",
      description: "Cargá tu comprobante de pago",
      icon: Banknote,
      completed: reservation.payment_status === "pago_validado" ||
        (reservation.amount_total != null && reservation.amount_paid >= reservation.amount_total),
      actionType: "payment",
    },
    {
      id: "bici",
      label: "Bicicleta y posición",
      description: "Cargá tu estatura, talle o fitting",
      icon: Bike,
      completed: !!checklistData["bici"]?.completed,
      actionType: "bike",
    },
    {
      id: "pedales",
      label: "Pedales y calas",
      description: "Contanos qué usás o subí una foto",
      icon: Footprints,
      completed: !!checklistData["pedales"]?.completed,
      actionType: "pedals",
    },
    {
      id: "pasaje",
      label: "Pasaje o transporte",
      description: "Subí tu reserva de vuelo o transporte",
      icon: Plane,
      completed: !!checklistData["pasaje"]?.completed,
      actionType: "document",
    },
    {
      id: "seguro",
      label: "Seguro viajero",
      description: "Adjuntá tu póliza de seguro",
      icon: ShieldCheck,
      completed: !!checklistData["seguro"]?.completed,
      actionType: "document",
    },
    {
      id: "extras",
      label: "Elegir extras del viaje",
      description: "Opciones adicionales disponibles",
      icon: Package,
      completed: false,
      actionType: "none",
    },
  ];

  const enabledSteps = meta?.checklist_steps;
  if (enabledSteps && Array.isArray(enabledSteps)) {
    return items.filter(item => enabledSteps.includes(item.id));
  }

  return items;
};

const ReservationStatusCard = ({
  reservation, alumnoId, eventCurrency, eventDate, eventTitle, eventType, eventMetadata,
  reglamentoUrl, whatsappUrl, alumnoNombre, onPaymentReported,
}: ReservationStatusCardProps) => {
  // Trip-like events show full onboarding (checklist + stepper + payment plan).
  // School events (record_hora, carrera, otro) show only the confirmation banner.
  const isTripLike = eventType === "camp" || eventType === "viaje";
  const { toast } = useToast();
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [mpLoading, setMpLoading] = useState(false);
  const [showCancelDrawer, setShowCancelDrawer] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBikeDrawer, setShowBikeDrawer] = useState(false);
  const [showPedalsDrawer, setShowPedalsDrawer] = useState(false);
  const [docDrawer, setDocDrawer] = useState<{ open: boolean; stepKey: string; title: string; description: string; helpText: string; icon: React.ReactNode }>({
    open: false, stepKey: "", title: "", description: "", helpText: "", icon: null,
  });
  const [checklistData, setChecklistData] = useState<Record<string, any>>({});
  const [pendingPayments, setPendingPayments] = useState<Array<{ id: string; original_amount: number; original_currency: string; review_notes: string | null; status: string }>>([]);

  const loadChecklistData = useCallback(async () => {
    const { data } = await supabase
      .from("reservation_checklist_data")
      .select("*")
      .eq("reservation_id", reservation.id);
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((row) => { map[row.step_key] = row; });
      setChecklistData(map);
    }
  }, [reservation.id]);

  // Pagos del alumno: pendientes (informado) y rechazados recientes,
  // para mostrar el aviso "no reconocido todavía".
  const loadPendingPayments = useCallback(async () => {
    const { data } = await supabase
      .from("reservation_payments" as any)
      .select("id, original_amount, original_currency, amount, currency, review_notes, status")
      .eq("reservation_id", reservation.id)
      .in("status", ["informado", "rechazado"])
      .order("created_at", { ascending: false });
    if (data) {
      setPendingPayments(
        (data as any[]).map((p) => ({
          id: p.id,
          original_amount: p.original_amount ?? p.amount,
          original_currency: p.original_currency ?? p.currency,
          review_notes: p.review_notes,
          status: p.status,
        })),
      );
    }
  }, [reservation.id]);

  useEffect(() => {
    loadChecklistData();
    loadPendingPayments();
  }, [loadChecklistData, loadPendingPayments, reservation.updated_at]);

  const installments = installmentFromMetadata(eventMetadata);
  const currency = reservation.currency_snapshot || reservation.moneda || eventCurrency;
  const humanStatus = getHumanStatus(reservation, isTripLike);
  const tone = toneStyles[humanStatus.tone];
  const StatusIcon = toneIcon[humanStatus.tone];

  const isPaymentValidated = reservation.payment_status === "pago_validado";
  const isConfirmed = reservation.reservation_status === "reserva_confirmada";
  const hasInformedPayment = ["pago_informado", "parcial"].includes(reservation.payment_status);
  const isPayable = !isPaymentValidated && reservation.payment_status !== "no_aplica"
    && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status);
  const isFullyDone = isConfirmed && isPaymentValidated;

  // Cancellation policy
  const cancellationPolicy: CancellationPolicy = {
    allow_cancellation: eventMetadata?.allow_cancellation ?? false,
    cancellation_days_before: eventMetadata?.cancellation_days_before ?? 7,
    cancellation_type: eventMetadata?.cancellation_type ?? "sin_penalidad",
    cancellation_text_short: eventMetadata?.cancellation_text_short ?? "",
    cancellation_text_full: eventMetadata?.cancellation_text_full ?? "",
    require_reason: eventMetadata?.require_cancellation_reason ?? false,
  };

  const daysUntilEvent = eventDate
    ? Math.ceil((new Date(eventDate + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 999;
  const withinCancellationWindow = daysUntilEvent >= cancellationPolicy.cancellation_days_before;
  const canCancel = cancellationPolicy.allow_cancellation
    && withinCancellationWindow
    && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status);

  const stepperIndex = getStepperIndex(reservation);

  /* ─── Installment helpers ─── */
  const paidInstallments = installments.filter((_inst, idx) => {
    const accBefore = installments.slice(0, idx).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    return (reservation.amount_paid || 0) >= accBefore + (parseFloat(_inst.amount) || 0);
  }).length;
  const pendingInstallments = installments.length - paidInstallments;
  const nextInstallment = installments[paidInstallments] || null;

  /* ─── Financial percentage ─── */
  const total = reservation.amount_total || 0;
  const paid = reservation.amount_paid || 0;
  const paidPercent = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;

  /* ─── Next due date ─── */
  const nextDueDate = nextInstallment?.due_date
    ? new Date(nextInstallment.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })
    : reservation.next_due_date
      ? new Date(reservation.next_due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })
      : null;

  /* ─── Next step message ─── */
  const getNextStep = (): { text: string; urgent: boolean } | null => {
    if (isFullyDone) return null;
    if (reservation.reservation_status === "solicitud_enviada")
      return { text: "El equipo está revisando tu solicitud. Te avisamos pronto.", urgent: false };
    if (reservation.payment_status === "pago_informado")
      return { text: "Estamos verificando tu pago. No necesitás hacer nada más por ahora.", urgent: false };
    if (reservation.payment_status === "no_informado" && total > 0)
      return { text: "Realizá tu pago e informalo para asegurar tu lugar.", urgent: true };
    if (reservation.payment_status === "parcial") {
      if (nextInstallment) {
        const dueDate = nextInstallment.due_date
          ? new Date(nextInstallment.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })
          : null;
        return {
          text: `Próximo paso: informar tu siguiente pago de ${formatPrice(parseFloat(nextInstallment.amount), currency)}${dueDate ? ` antes del ${dueDate}` : ""}.`,
          urgent: true,
        };
      }
      return { text: "Tenés un saldo pendiente. Informá tu próximo pago.", urgent: true };
    }
    if (reservation.payment_status === "pago_rechazado")
      return { text: "Tu pago fue rechazado. Revisá los datos e intentá nuevamente.", urgent: true };
    if (reservation.reservation_status === "cancelacion_solicitada")
      return { text: "Tu solicitud de cancelación está siendo revisada.", urgent: false };
    return null;
  };
  const nextStep = getNextStep();

  /* ─── Checklist ─── */
  const checklist = buildChecklist(reservation, eventMetadata, checklistData);
  const completedCount = checklist.filter(c => c.completed).length;
  const checklistPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  /* ─── Primary & secondary CTAs ─── */
  const getPrimaryCTA = () => {
    if (reservation.payment_status === "pago_rechazado")
      return { label: "Actualizar comprobante", icon: Upload, action: () => setShowPaymentDrawer(true) };
    if (isPayable && (reservation.payment_status === "no_informado" || reservation.payment_status === "parcial" || reservation.payment_status === "pago_pendiente"))
      return { label: "Informar pago", icon: Banknote, action: () => setShowPaymentDrawer(true) };
    return null;
  };

  const getSecondaryCTA = () => {
    if (hasInformedPayment && !isPaymentValidated)
      return { label: "Ver último pago informado", icon: Eye, action: () => setShowPaymentDrawer(true) };
    return null;
  };

  const primaryCTA = getPrimaryCTA();
  const secondaryCTA = getSecondaryCTA();

  /* ─── Pay with Mercado Pago ─── */
  // Mostramos el botón siempre que la reserva permita pagar y haya saldo > 0,
  // tanto en "solicitud_enviada" (Inscripción recibida) como en confirmada con saldo.
  const pendingForMP = Number(
    reservation.balance_due ?? reservation.amount_total ?? 0
  );
  const canPayWithMP =
    isPayable &&
    pendingForMP > 0 &&
    ["no_informado", "parcial", "pago_pendiente", "pago_rechazado"].includes(
      reservation.payment_status
    );

  const handlePayWithMP = async () => {
    if (mpLoading) return;
    setMpLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-event-mp-preference`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ reservation_id: reservation.id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.init_point) {
        toast({
          title: "No pudimos abrir Mercado Pago",
          description: data?.error || "Intentá nuevamente en unos segundos.",
          variant: "destructive",
        });
        setMpLoading(false);
        return;
      }
      window.location.href = data.init_point;
    } catch {
      toast({
        title: "Error de conexión con Mercado Pago",
        description: "Revisá tu conexión a internet e intentá nuevamente.",
        variant: "destructive",
      });
      setMpLoading(false);
    }
  };

  /* ─── Load timeline ─── */
  const loadTimeline = async () => {
    if (timeline.length > 0) { setShowTimeline(!showTimeline); return; }
    setLoadingTimeline(true);
    const entries: TimelineEntry[] = [];

    entries.push({ date: reservation.created_at, label: eventType === "record_hora" ? "Inscripción creada" : "Reserva creada", type: "reservation" });
    if (reservation.confirmed_at)
      entries.push({ date: reservation.confirmed_at, label: eventType === "record_hora" ? "Inscripción confirmada" : "Reserva confirmada", type: "status" });

    const { data: payments } = await supabase
      .from("reservation_payments" as any)
      .select("id, amount, currency, payment_date, status, created_at")
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: true });
    if (payments) {
      (payments as unknown as PaymentRecord[]).forEach(p => {
        const statusLabel = p.status === "validado" ? "Pago validado" : p.status === "rechazado" ? "Pago rechazado" : "Pago informado";
        entries.push({ date: p.created_at, label: statusLabel, type: "payment", detail: formatPrice(p.amount, p.currency || currency) });
      });
    }

    const { data: notifs } = await supabase
      .from("reservation_notifications" as any)
      .select("id, tipo, canal, asunto, created_at")
      .eq("reservation_id", reservation.id)
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: true });
    if (notifs) {
      (notifs as unknown as NotificationRecord[]).forEach(n => {
        const tipoLabel: Record<string, string> = {
          pago_registrado: "Confirmación de pago recibida",
          cuota_pendiente: "Recordatorio de cuota",
          cuota_proxima: "Aviso de próximo vencimiento",
          novedad: "Novedad del equipo",
        };
        entries.push({ date: n.created_at, label: tipoLabel[n.tipo] || n.asunto, type: "notification", detail: n.canal === "email" ? "por email" : n.canal === "whatsapp" ? "por WhatsApp" : undefined });
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setTimeline(entries);
    setShowTimeline(true);
    setLoadingTimeline(false);
  };

  return (
    <>
      <div className="space-y-4 animate-fade-in">

        {/* ═══ 1. STATUS BANNER — human-friendly ═══ */}
        <div className={`rounded-xl border-2 p-5 ${tone.border} ${tone.bg}`}>
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${tone.iconBg}`}>
              <StatusIcon className={`w-5 h-5 ${tone.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-heading font-bold leading-snug ${tone.icon}`}>
                {humanStatus.title}
              </p>
              {humanStatus.subtitle && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {humanStatus.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ 2. NEXT STEP — prominent CTA area ═══ */}
        {nextStep && (
          <div className={`rounded-xl p-4 flex items-start gap-3 ${
            nextStep.urgent
              ? "bg-amber-500/10 border border-amber-500/30"
              : "bg-muted/50 border border-border/50"
          }`}>
            <ArrowRight className={`w-5 h-5 mt-0.5 shrink-0 ${nextStep.urgent ? "text-amber-400" : "text-muted-foreground"}`} />
            <div>
              <p className="text-xs font-heading font-semibold text-foreground uppercase tracking-wide mb-1">Próximo paso</p>
              <p className={`text-sm leading-relaxed ${nextStep.urgent ? "text-amber-200" : "text-muted-foreground"}`}>
                {nextStep.text}
              </p>
            </div>
          </div>
        )}

        {/* ═══ 3. PRIMARY CTA ═══ */}
        {canPayWithMP && (
          <Button
            variant="gold"
            className="w-full h-12 text-sm"
            onClick={handlePayWithMP}
            disabled={mpLoading}
          >
            {mpLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Abriendo Mercado Pago...</>
            ) : (
              <><CreditCard className="w-4 h-4 mr-2" /> Pagar con Mercado Pago</>
            )}
          </Button>
        )}
        {primaryCTA && (
          <Button
            variant={canPayWithMP ? "outline" : "gold"}
            className="w-full h-12 text-sm"
            onClick={primaryCTA.action}
          >
            <primaryCTA.icon className="w-4 h-4 mr-2" />
            {canPayWithMP ? "O informar otro medio de pago" : primaryCTA.label}
          </Button>
        )}

        {/* Secondary CTA */}
        {secondaryCTA && (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={secondaryCTA.action}>
            <secondaryCTA.icon className="w-3.5 h-3.5 mr-1.5" /> {secondaryCTA.label}
          </Button>
        )}

        {/* ═══ 4a. SIMPLE FINANCIAL SUMMARY (school events) ═══ */}
        {!isTripLike && total > 0 && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Pago del evento</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/40 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Total</p>
                <p className="text-sm font-heading font-bold text-foreground">{formatPrice(total, currency)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-2.5">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wide mb-0.5">Abonado</p>
                <p className="text-sm font-heading font-bold text-emerald-400">{formatPrice(paid, currency)}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${(reservation.balance_due ?? total - paid) > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${(reservation.balance_due ?? total - paid) > 0 ? "text-amber-400" : "text-emerald-400"}`}>Saldo</p>
                <p className={`text-sm font-heading font-bold ${(reservation.balance_due ?? total - paid) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatPrice(reservation.balance_due ?? Math.max(total - paid, 0), currency)}
                </p>
              </div>
            </div>
            <PendingPaymentsNote payments={pendingPayments} eventCurrency={currency} />
          </div>
        )}

        {/* ═══ 4. FINANCIAL SUMMARY (trip-like) ═══ */}
        {isTripLike && total > 0 && (
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Resumen de pago</h3>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{paidPercent}% abonado</span>
                <span className="text-muted-foreground font-medium">{formatPrice(paid, currency)} / {formatPrice(total, currency)}</span>
              </div>
              <Progress value={paidPercent} className="h-2.5" />
            </div>

            {/* Main amounts */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total</p>
                <p className="text-sm font-heading font-bold text-foreground">{formatPrice(total, currency)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wide mb-1">Abonado</p>
                <p className="text-sm font-heading font-bold text-emerald-400">{formatPrice(paid, currency)}</p>
              </div>
              <div className={`rounded-lg p-3 ${(reservation.balance_due ?? 0) > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                <p className={`text-[10px] uppercase tracking-wide mb-1 ${(reservation.balance_due ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>Saldo</p>
                <p className={`text-sm font-heading font-bold ${(reservation.balance_due ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatPrice(reservation.balance_due ?? 0, currency)}
                </p>
              </div>
            </div>

            {/* Next due date */}
            {nextDueDate && (reservation.balance_due ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Próximo vencimiento: <span className="text-foreground font-semibold">{nextDueDate}</span>
                </p>
              </div>
            )}

            {/* Installments detail */}
            {installments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Cuotas pagadas</span>
                  <span className="font-semibold text-foreground">{paidInstallments} de {installments.length}</span>
                </div>
                <div className="space-y-1.5">
                  {installments.map((inst, idx) => {
                    const instAmount = parseFloat(inst.amount || "0");
                    const accBefore = installments.slice(0, idx).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
                    const isPaidInst = (reservation.amount_paid || 0) >= accBefore + instAmount;
                    const isOverdue = inst.due_date && new Date(inst.due_date) < new Date() && !isPaidInst;
                    return (
                      <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                        isPaidInst ? "bg-emerald-500/10 border border-emerald-500/20" : isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted/40 border border-border/30"
                      }`}>
                        <div className="flex items-center gap-2">
                          {isPaidInst ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span className="font-medium">{inst.label || `Cuota ${idx + 1}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{formatPrice(instAmount, currency)}</span>
                          {inst.due_date && (
                            <span className={isOverdue ? "text-destructive" : "text-muted-foreground"}>
                              {new Date(inst.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ 5. ONBOARDING STEPPER ═══ */}
        {isTripLike && reservation.payment_status !== "no_aplica" && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status) && (
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Progreso de tu reserva</h3>

            {/* Stepper */}
            <div className="space-y-0">
              {stepperSteps.map((step, i) => {
                const isCompleted = i < stepperIndex;
                const isCurrent = i === stepperIndex - 1 && stepperIndex < 3;
                return (
                  <div key={step.key} className="flex gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-all ${
                        isCompleted
                          ? "bg-primary border-primary text-primary-foreground"
                          : isCurrent
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-muted border-border text-muted-foreground"
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : isCurrent ? (
                          <CircleDot className="w-4 h-4" />
                        ) : (
                          <span className="text-[10px] font-bold">{i + 1}</span>
                        )}
                      </div>
                      {i < stepperSteps.length - 1 && (
                        <div className={`w-0.5 h-8 ${isCompleted ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                    <div className="pb-3 pt-0.5">
                      <p className={`text-sm font-medium ${isCompleted ? "text-foreground" : isCurrent ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Current position label */}
            {stepperIndex < 3 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <CircleDot className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-primary font-medium">{getStepperLabel(stepperIndex)}</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ 6. TRIP PREPARATION CHECKLIST ═══ */}
        {isTripLike && checklist.length > 0 && !["cancelada", "rechazada"].includes(reservation.reservation_status) && (
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Preparación del viaje</h3>
              <Badge variant="outline" className="text-[10px]">{completedCount} de {checklist.length}</Badge>
            </div>

            <Progress value={checklistPercent} className="h-2" />

            <div className="space-y-2">
              {checklist.map((item) => {
                const isClickable = item.actionType !== "none" && !item.completed;
                const handleClick = () => {
                  if (item.actionType === "bike") setShowBikeDrawer(true);
                  else if (item.actionType === "pedals") setShowPedalsDrawer(true);
                  else if (item.actionType === "payment") setShowPaymentDrawer(true);
                  else if (item.actionType === "document") {
                    const configs: Record<string, { title: string; description: string; helpText: string; icon: React.ReactNode }> = {
                      pasaje: {
                        title: "Pasaje o transporte",
                        description: "Subí tu reserva de vuelo o transporte",
                        helpText: "Adjuntá tu pasaje de avión, bus o cualquier documento de transporte. Puede ser PDF, foto o captura de pantalla.",
                        icon: <Plane className="w-5 h-5 text-primary" />,
                      },
                      seguro: {
                        title: "Seguro viajero",
                        description: "Adjuntá tu póliza de seguro",
                        helpText: "Subí tu póliza de seguro de viaje. Es un requisito importante para tu seguridad.",
                        icon: <ShieldCheck className="w-5 h-5 text-primary" />,
                      },
                    };
                    const cfg = configs[item.id] || { title: item.label, description: item.description, helpText: "", icon: <FileText className="w-5 h-5 text-primary" /> };
                    setDocDrawer({ open: true, stepKey: item.id, ...cfg });
                  }
                };

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.actionType !== "none" ? handleClick : undefined}
                    disabled={item.actionType === "none"}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-left ${
                      item.completed
                        ? "bg-emerald-500/5 border border-emerald-500/20"
                        : item.actionType !== "none"
                          ? "bg-muted/30 border border-border/30 hover:bg-muted/50 hover:border-primary/30 active:scale-[0.98] cursor-pointer"
                          : "bg-muted/20 border border-border/20 opacity-60"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      item.completed ? "bg-emerald-500/20" : "bg-muted"
                    }`}>
                      {item.completed ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${item.completed ? "text-emerald-400" : "text-foreground font-medium"}`}>
                        {item.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{item.description}</p>
                    </div>
                    {item.completed ? (
                      <span className="text-[10px] text-emerald-400 font-medium shrink-0">Listo</span>
                    ) : item.actionType !== "none" ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ 7. ADMIN NOTES ═══ */}
        {(reservation.admin_notes || reservation.notas) && (
          <div className="glass-card rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Mensaje del equipo:</span>{" "}
              {reservation.admin_notes || reservation.notas}
            </p>
          </div>
        )}

        {/* ═══ 8. TIMELINE / HISTORY ═══ */}
        <button
          onClick={loadTimeline}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors text-sm"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            <span className="font-medium">{eventType === "record_hora" ? "Historial de mi inscripción" : "Historial de mi reserva"}</span>
          </span>
          {loadingTimeline ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : showTimeline ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {showTimeline && timeline.length > 0 && (
          <div className="space-y-0 pl-2">
            {timeline.map((entry, i) => {
              const typeIcon: Record<string, typeof CheckCircle> = {
                reservation: Shield,
                payment: Banknote,
                notification: Bell,
                status: CheckCircle,
              };
              const Icon = typeIcon[entry.type] || Clock;
              return (
                <div key={i} className="flex gap-3 relative">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center shrink-0 z-10">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                    </div>
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-border/50" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className="text-xs font-medium text-foreground">{entry.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                      {entry.detail && ` · ${entry.detail}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {showTimeline && timeline.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sin actividad registrada aún.</p>
        )}

        {/* ═══ 9. HELP SECTION ═══ */}
        <div className="glass-card rounded-xl overflow-hidden">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              <span className="font-heading font-semibold text-foreground">¿Necesitás ayuda?</span>
            </span>
            {showHelp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showHelp && (
            <div className="px-4 pb-4 space-y-3">
              {eventType === "record_hora" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Si tenés dudas sobre tu inscripción, el pago, el check-in o la carga de tu resultado, podés escribirnos por WhatsApp.
                  </p>
                  <a
                    href={buildWhatsAppUrl(buildRecordHoraHelpMessage({ alumnoNombre, fechaEvento: eventDate }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Escribir por WhatsApp
                    </Button>
                  </a>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Consultanos por dudas sobre pagos, bicicleta, pedales, documentación o cualquier tema del viaje.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reglamentoUrl && (
                      <a href={reglamentoUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full text-xs">
                          <FileText className="w-3.5 h-3.5 mr-1.5" /> Reglamento
                        </Button>
                      </a>
                    )}
                    {whatsappUrl && (
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full text-xs">
                          <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Chatear por WhatsApp
                        </Button>
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ═══ 10. CANCEL ═══ */}
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[11px] text-muted-foreground/60 hover:text-destructive mt-2"
            onClick={() => setShowCancelDrawer(true)}
          >
            <X className="w-3 h-3 mr-1" /> Cancelar reserva
          </Button>
        )}

        {/* Request date */}
        <p className="text-[10px] text-muted-foreground/50 text-center">
          {eventType === "record_hora" ? "Inscripción creada" : "Reserva creada"} el {new Date(reservation.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <ReportPaymentDrawer
        open={showPaymentDrawer}
        onOpenChange={setShowPaymentDrawer}
        reservation={reservation}
        alumnoId={alumnoId}
        currency={currency}
        onSuccess={onPaymentReported}
      />

      <CancelReservationDrawer
        open={showCancelDrawer}
        onOpenChange={setShowCancelDrawer}
        reservationId={reservation.id}
        eventTitle={eventTitle}
        eventDate={eventDate}
        cancellationPolicy={cancellationPolicy}
        onCancelled={onPaymentReported}
      />

      <TripBikeDrawer
        open={showBikeDrawer}
        onOpenChange={setShowBikeDrawer}
        reservationId={reservation.id}
        alumnoId={alumnoId}
        onSaved={loadChecklistData}
      />

      <TripPedalsDrawer
        open={showPedalsDrawer}
        onOpenChange={setShowPedalsDrawer}
        reservationId={reservation.id}
        alumnoId={alumnoId}
        onSaved={loadChecklistData}
      />

      <TripDocumentDrawer
        open={docDrawer.open}
        onOpenChange={(open) => setDocDrawer(prev => ({ ...prev, open }))}
        reservationId={reservation.id}
        alumnoId={alumnoId}
        stepKey={docDrawer.stepKey}
        title={docDrawer.title}
        description={docDrawer.description}
        icon={docDrawer.icon}
        helpText={docDrawer.helpText}
        onSaved={loadChecklistData}
      />
    </>
  );
};

const PendingPaymentsNote = ({
  payments, eventCurrency,
}: {
  payments: Array<{ id: string; original_amount: number; original_currency: string; review_notes: string | null; status: string }>;
  eventCurrency: string;
}) => {
  const informed = payments.filter((p) => p.status === "informado");
  const rejected = payments.filter((p) => p.status === "rechazado");
  if (informed.length === 0 && rejected.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {informed.map((p) => (
        <div key={p.id} className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
          ⏳ Pago informado de <strong>{formatPrice(p.original_amount, p.original_currency)}</strong> pendiente de reconocer en {eventCurrency}. No reduce tu saldo hasta validación.
        </div>
      ))}
      {rejected.map((p) => (
        <div key={p.id} className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-1.5">
          ❌ Pago de {formatPrice(p.original_amount, p.original_currency)} rechazado{p.review_notes ? `: ${p.review_notes}` : "."}
        </div>
      ))}
    </div>
  );
};

export default ReservationStatusCard;
