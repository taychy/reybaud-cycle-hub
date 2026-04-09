import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import {
  Shield, CheckCircle, AlertCircle, Clock, XCircle, Ban,
  Banknote, FileText, MessageCircle, CreditCard, Eye, Upload, X,
  ChevronDown, ChevronUp, Bell, CalendarDays, ArrowRight,
} from "lucide-react";
import ReportPaymentDrawer from "./ReportPaymentDrawer";
import CancelReservationDrawer from "./CancelReservationDrawer";

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
  eventMetadata?: any;
  reglamentoUrl?: string;
  whatsappUrl?: string;
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

/* ─── Status configs ─── */
const reservationStatusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  solicitud_enviada: { label: "Reserva enviada", icon: Clock, className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  reserva_pendiente: { label: "Reserva pendiente", icon: AlertCircle, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  reserva_confirmada: { label: "¡Reserva confirmada!", icon: CheckCircle, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelada: { label: "Reserva cancelada", icon: Ban, className: "bg-muted text-muted-foreground border-border" },
  cancelacion_solicitada: { label: "Cancelación en proceso", icon: Clock, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  rechazada: { label: "Reserva rechazada", icon: XCircle, className: "bg-destructive/15 text-destructive border-destructive/30" },
  lista_espera: { label: "En lista de espera", icon: Clock, className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

const paymentStatusLabels: Record<string, string> = {
  no_informado: "Todavía no registramos tu pago",
  no_aplica: "Sin costo",
  pago_pendiente: "Tu pago está pendiente",
  pago_informado: "Pago enviado · Estamos verificándolo",
  pago_validado: "Pago confirmado ✓",
  pago_rechazado: "Tu pago fue rechazado — revisá los datos",
  parcial: "Pago parcial registrado",
};

const paymentStatusBadge: Record<string, string> = {
  no_informado: "bg-muted text-muted-foreground",
  no_aplica: "bg-emerald-500/15 text-emerald-400",
  pago_pendiente: "bg-amber-500/15 text-amber-400",
  pago_informado: "bg-sky-500/15 text-sky-400",
  pago_validado: "bg-emerald-500/15 text-emerald-400",
  pago_rechazado: "bg-destructive/15 text-destructive",
  parcial: "bg-amber-500/15 text-amber-400",
};

/* ─── Progress steps (client-friendly) ─── */
const progressSteps = [
  { key: "reserva", label: "Reserva hecha" },
  { key: "pago", label: "Pago informado" },
  { key: "validacion", label: "Pago validado" },
];

const getProgressIndex = (reservation: Reservation): number => {
  if (reservation.reservation_status === "reserva_confirmada" && reservation.payment_status === "pago_validado") return 3;
  if (["pago_informado", "pago_validado"].includes(reservation.payment_status)) return 2;
  return 1;
};

const ReservationStatusCard = ({
  reservation, alumnoId, eventCurrency, eventDate, eventTitle, eventMetadata,
  reglamentoUrl, whatsappUrl, onPaymentReported,
}: ReservationStatusCardProps) => {
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [showCancelDrawer, setShowCancelDrawer] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const installments = installmentFromMetadata(eventMetadata);
  const resSt = reservationStatusConfig[reservation.reservation_status] || reservationStatusConfig.solicitud_enviada;
  const currency = reservation.currency_snapshot || reservation.moneda || eventCurrency;

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

  const progressIndex = getProgressIndex(reservation);

  /* ─── Installment helpers ─── */
  const paidInstallments = installments.filter((inst, idx) => {
    const accBefore = installments.slice(0, idx).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    return (reservation.amount_paid || 0) >= accBefore + (parseFloat(inst.amount) || 0);
  }).length;
  const pendingInstallments = installments.length - paidInstallments;
  const nextInstallment = installments[paidInstallments] || null;

  /* ─── Next step message ─── */
  const getNextStep = (): { text: string; urgent: boolean } | null => {
    if (isFullyDone) return null;
    if (reservation.reservation_status === "solicitud_enviada")
      return { text: "El equipo está revisando tu solicitud. Te avisamos pronto.", urgent: false };
    if (reservation.payment_status === "pago_informado")
      return { text: "Estamos verificando tu pago. No necesitás hacer nada más por ahora.", urgent: false };
    if (reservation.payment_status === "no_informado" && reservation.amount_total && reservation.amount_total > 0)
      return { text: "Realizá tu pago e informalo para asegurar tu lugar.", urgent: true };
    if (reservation.payment_status === "parcial") {
      if (nextInstallment) {
        const dueDate = nextInstallment.due_date
          ? new Date(nextInstallment.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })
          : null;
        return {
          text: `Tu próxima cuota es de ${formatPrice(parseFloat(nextInstallment.amount), currency)}${dueDate ? ` — vence el ${dueDate}` : ""}. Informá tu pago.`,
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

  /* ─── Primary CTA ─── */
  const getPrimaryCTA = () => {
    if (hasInformedPayment && !isPaymentValidated)
      return { label: "Ver pago informado", icon: Eye, action: () => setShowPaymentDrawer(true) };
    if (reservation.payment_status === "pago_rechazado")
      return { label: "Actualizar comprobante", icon: Upload, action: () => setShowPaymentDrawer(true) };
    if (isPayable && reservation.payment_status === "parcial")
      return { label: "Informar próxima cuota", icon: Banknote, action: () => setShowPaymentDrawer(true) };
    if (isPayable && reservation.payment_status === "no_informado")
      return { label: "Informar pago", icon: Banknote, action: () => setShowPaymentDrawer(true) };
    return null;
  };
  const primaryCTA = getPrimaryCTA();

  /* ─── Load timeline ─── */
  const loadTimeline = async () => {
    if (timeline.length > 0) { setShowTimeline(!showTimeline); return; }
    setLoadingTimeline(true);
    const entries: TimelineEntry[] = [];

    // Reservation created
    entries.push({ date: reservation.created_at, label: "Reserva creada", type: "reservation" });
    if (reservation.confirmed_at)
      entries.push({ date: reservation.confirmed_at, label: "Reserva confirmada", type: "status" });

    // Payments
    const { data: payments } = await supabase
      .from("reservation_payments" as any)
      .select("id, amount, currency, payment_date, status, created_at")
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: true });
    if (payments) {
      (payments as unknown as PaymentRecord[]).forEach(p => {
        const statusLabel = p.status === "validado" ? "Pago validado" : p.status === "rechazado" ? "Pago rechazado" : "Pago informado";
        entries.push({
          date: p.created_at,
          label: statusLabel,
          type: "payment",
          detail: formatPrice(p.amount, p.currency || currency),
        });
      });
    }

    // Notifications
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
        entries.push({
          date: n.created_at,
          label: tipoLabel[n.tipo] || n.asunto,
          type: "notification",
          detail: n.canal === "email" ? "por email" : n.canal === "whatsapp" ? "por WhatsApp" : undefined,
        });
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

        {/* ═══ MAIN STATUS BANNER ═══ */}
        <div className={`rounded-xl border-2 p-4 ${isFullyDone
          ? "border-emerald-500/40 bg-emerald-500/5"
          : reservation.payment_status === "pago_rechazado"
            ? "border-destructive/40 bg-destructive/5"
            : "border-primary/30 bg-primary/5"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isFullyDone ? "bg-emerald-500/20" : "bg-primary/20"
            }`}>
              <resSt.icon className={`w-5 h-5 ${isFullyDone ? "text-emerald-400" : "text-primary"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-base font-heading font-bold ${isFullyDone ? "text-emerald-400" : "text-foreground"}`}>
                {resSt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {paymentStatusLabels[reservation.payment_status] || ""}
              </p>
            </div>
          </div>

          {isFullyDone && (
            <p className="text-sm text-emerald-400/80 mt-3 pl-[52px]">
              Tu lugar está asegurado. ¡Nos vemos ahí! 🎉
            </p>
          )}
        </div>

        {/* ═══ PROGRESS STEPPER ═══ */}
        {reservation.payment_status !== "no_aplica" && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status) && (
          <div className="flex items-center gap-1 px-1">
            {progressSteps.map((step, i) => (
              <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex items-center w-full gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    i < progressIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {i < progressIndex ? "✓" : i + 1}
                  </div>
                  {i < progressSteps.length - 1 && (
                    <div className={`h-0.5 flex-1 rounded-full ${i < progressIndex - 1 ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
                <span className={`text-[10px] leading-tight text-center ${
                  i < progressIndex ? "text-primary font-semibold" : "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ NEXT STEP (PROMINENT) ═══ */}
        {nextStep && (
          <div className={`rounded-xl p-4 flex items-start gap-3 ${
            nextStep.urgent
              ? "bg-amber-500/10 border border-amber-500/30"
              : "bg-muted/50 border border-border/50"
          }`}>
            <ArrowRight className={`w-5 h-5 mt-0.5 shrink-0 ${nextStep.urgent ? "text-amber-400" : "text-muted-foreground"}`} />
            <div>
              <p className="text-xs font-heading font-semibold text-foreground uppercase tracking-wide mb-1">Próximo paso</p>
              <p className={`text-sm ${nextStep.urgent ? "text-amber-200" : "text-muted-foreground"}`}>
                {nextStep.text}
              </p>
            </div>
          </div>
        )}

        {/* ═══ PRIMARY CTA ═══ */}
        {primaryCTA && (
          <Button variant="gold" className="w-full h-12 text-sm" onClick={primaryCTA.action}>
            <primaryCTA.icon className="w-4 h-4 mr-2" /> {primaryCTA.label}
          </Button>
        )}

        {/* ═══ FINANCIAL SUMMARY ═══ */}
        {reservation.amount_total != null && reservation.amount_total > 0 && (
          <div className="glass-card rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Resumen de pago</h3>
            </div>

            {/* Main amounts */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total</p>
                <p className="text-base font-heading font-bold text-foreground">{formatPrice(reservation.amount_total, currency)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wide mb-1">Abonado</p>
                <p className="text-base font-heading font-bold text-emerald-400">{formatPrice(reservation.amount_paid || 0, currency)}</p>
              </div>
              <div className={`rounded-lg p-3 ${reservation.balance_due && reservation.balance_due > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                <p className={`text-[10px] uppercase tracking-wide mb-1 ${reservation.balance_due && reservation.balance_due > 0 ? "text-amber-400" : "text-emerald-400"}`}>Saldo</p>
                <p className={`text-base font-heading font-bold ${reservation.balance_due && reservation.balance_due > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatPrice(reservation.balance_due ?? 0, currency)}
                </p>
              </div>
            </div>

            {/* Installments info */}
            {installments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Cuotas pagadas</span>
                  <span className="font-semibold text-foreground">{paidInstallments} de {installments.length}</span>
                </div>
                {pendingInstallments > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cuotas pendientes</span>
                    <span className="font-semibold text-amber-400">{pendingInstallments}</span>
                  </div>
                )}
                {nextInstallment && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Próxima cuota</span>
                      <span className="font-semibold text-foreground">{formatPrice(parseFloat(nextInstallment.amount), currency)}</span>
                    </div>
                    {nextInstallment.due_date && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Vencimiento</span>
                        <span className="font-semibold text-foreground">
                          {new Date(nextInstallment.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Installment detail list */}
                <div className="space-y-1.5 pt-2">
                  {installments.map((inst, idx) => {
                    const instAmount = parseFloat(inst.amount || "0");
                    const accBefore = installments.slice(0, idx).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
                    const isPaid = (reservation.amount_paid || 0) >= accBefore + instAmount;
                    const isOverdue = inst.due_date && new Date(inst.due_date) < new Date() && !isPaid;
                    return (
                      <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                        isPaid ? "bg-emerald-500/10 border border-emerald-500/20" : isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted/40 border border-border/30"
                      }`}>
                        <div className="flex items-center gap-2">
                          {isPaid ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
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

            {/* Simple financial summary without installments */}
            {installments.length === 0 && reservation.next_due_date && (
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Próximo vencimiento</span>
                <span className="text-foreground font-semibold">
                  {new Date(reservation.next_due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ═══ ADMIN NOTES ═══ */}
        {(reservation.admin_notes || reservation.notas) && (
          <div className="glass-card rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Mensaje del equipo:</span>{" "}
              {reservation.admin_notes || reservation.notas}
            </p>
          </div>
        )}

        {/* ═══ TIMELINE / HISTORY ═══ */}
        <button
          onClick={loadTimeline}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors text-sm"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            <span className="font-medium">Historial de mi reserva</span>
          </span>
          {loadingTimeline ? (
            <Clock className="w-4 h-4 animate-spin text-muted-foreground" />
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

        {/* ═══ QUICK LINKS ═══ */}
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
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Chatear
              </Button>
            </a>
          )}
        </div>

        {/* ═══ CANCEL ═══ */}
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
          Reserva creada el {new Date(reservation.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
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
    </>
  );
};

export default ReservationStatusCard;
