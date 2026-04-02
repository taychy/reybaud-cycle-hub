import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import {
  Shield, CheckCircle, AlertCircle, Clock, XCircle, Ban,
  Banknote, FileText, MessageCircle, CreditCard, Eye, Upload, X,
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

const installmentFromMetadata = (meta: any) => {
  if (!meta?.installments_enabled || !meta?.installments) return [];
  return meta.installments as { number: number; amount: string; due_date: string; label: string }[];
};

const reservationStatusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  solicitud_enviada: { label: "Solicitud enviada", icon: Clock, className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  reserva_pendiente: { label: "Reserva pendiente", icon: AlertCircle, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  reserva_confirmada: { label: "Reserva confirmada", icon: CheckCircle, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelada: { label: "Reserva cancelada", icon: Ban, className: "bg-muted text-muted-foreground border-border" },
  cancelacion_solicitada: { label: "Cancelación solicitada", icon: Clock, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  rechazada: { label: "Rechazada", icon: XCircle, className: "bg-destructive/15 text-destructive border-destructive/30" },
  lista_espera: { label: "Lista de espera", icon: Clock, className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  no_informado: { label: "Pago no informado", className: "bg-muted text-muted-foreground" },
  no_aplica: { label: "Gratuito", className: "bg-emerald-500/15 text-emerald-400" },
  pago_pendiente: { label: "Pago pendiente", className: "bg-amber-500/15 text-amber-400" },
  pago_informado: { label: "Pago informado · Pendiente de validación", className: "bg-amber-500/15 text-amber-400" },
  pago_validado: { label: "Pago validado", className: "bg-emerald-500/15 text-emerald-400" },
  pago_rechazado: { label: "Pago rechazado", className: "bg-destructive/15 text-destructive" },
  parcial: { label: "Pago parcial", className: "bg-sky-500/15 text-sky-400" },
};

// Progress step definitions
const progressSteps = [
  { key: "solicitud", label: "Solicitud" },
  { key: "pago", label: "Pago" },
  { key: "validacion", label: "Validación" },
];

const getProgressIndex = (reservation: Reservation): number => {
  if (reservation.reservation_status === "reserva_confirmada" && reservation.payment_status === "pago_validado") return 3;
  if (["pago_informado", "pago_validado"].includes(reservation.payment_status)) return 2;
  if (reservation.payment_status !== "no_informado" && reservation.payment_status !== "no_aplica") return 1;
  return 1;
};

const ReservationStatusCard = ({
  reservation, alumnoId, eventCurrency, eventDate, eventTitle, eventMetadata,
  reglamentoUrl, whatsappUrl, onPaymentReported,
}: ReservationStatusCardProps) => {
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [showCancelDrawer, setShowCancelDrawer] = useState(false);
  const [hasPayments, setHasPayments] = useState(false);

  const installments = installmentFromMetadata(eventMetadata);
  const resSt = reservationStatusConfig[reservation.reservation_status] || reservationStatusConfig.solicitud_enviada;
  const paySt = paymentStatusConfig[reservation.payment_status] || paymentStatusConfig.no_informado;
  const currency = reservation.currency_snapshot || reservation.moneda || eventCurrency;

  const isPaymentValidated = reservation.payment_status === "pago_validado";
  const isConfirmed = reservation.reservation_status === "reserva_confirmada";
  const hasInformedPayment = ["pago_informado", "parcial"].includes(reservation.payment_status);
  const isPayable = !isPaymentValidated && reservation.payment_status !== "no_aplica"
    && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status);

  // Check if user has existing payments
  useEffect(() => {
    supabase
      .from("reservation_payments" as any)
      .select("id")
      .eq("reservation_id", reservation.id)
      .eq("alumno_id", alumnoId)
      .limit(1)
      .then(({ data }) => {
        if (data && (data as any[]).length > 0) setHasPayments(true);
      });
  }, [reservation.id, alumnoId]);

  // Cancellation policy from event metadata
  const cancellationPolicy: CancellationPolicy = {
    allow_cancellation: eventMetadata?.allow_cancellation ?? false,
    cancellation_days_before: eventMetadata?.cancellation_days_before ?? 7,
    cancellation_type: eventMetadata?.cancellation_type ?? "sin_penalidad",
    cancellation_text_short: eventMetadata?.cancellation_text_short ?? "",
    cancellation_text_full: eventMetadata?.cancellation_text_full ?? "",
    require_reason: eventMetadata?.require_cancellation_reason ?? false,
  };

  // Can the user cancel?
  const daysUntilEvent = eventDate
    ? Math.ceil((new Date(eventDate + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 999;
  const withinCancellationWindow = daysUntilEvent >= cancellationPolicy.cancellation_days_before;
  const canCancel = cancellationPolicy.allow_cancellation
    && withinCancellationWindow
    && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status);
  const cancellationExpired = cancellationPolicy.allow_cancellation && !withinCancellationWindow
    && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status);

  const progressIndex = getProgressIndex(reservation);

  // Determine next step
  const getNextStep = () => {
    if (isConfirmed && isPaymentValidated) return null;
    if (reservation.reservation_status === "solicitud_enviada") return "El equipo revisará tu solicitud.";
    if (reservation.payment_status === "pago_informado") return "El equipo está revisando tu pago.";
    if (reservation.payment_status === "no_informado" && reservation.amount_total && reservation.amount_total > 0)
      return "Realizá el pago e informalo para confirmar tu lugar.";
    if (reservation.payment_status === "parcial") return "Tenés un saldo pendiente. Informá tu próximo pago.";
    if (reservation.payment_status === "pago_rechazado") return "Tu pago fue rechazado. Revisá e intentá de nuevo.";
    if (reservation.reservation_status === "cancelacion_solicitada") return "El equipo está revisando tu solicitud de cancelación.";
    return null;
  };
  const nextStep = getNextStep();

  // Primary CTA
  const getPrimaryCTA = () => {
    if (hasInformedPayment && !isPaymentValidated) {
      return { label: "Ver pago informado", icon: Eye, action: () => setShowPaymentDrawer(true) };
    }
    if (reservation.payment_status === "pago_rechazado") {
      return { label: "Actualizar comprobante", icon: Upload, action: () => setShowPaymentDrawer(true) };
    }
    if (isPayable && !hasPayments) {
      return { label: "Informar pago", icon: Banknote, action: () => setShowPaymentDrawer(true) };
    }
    if (isPayable && hasPayments && reservation.payment_status === "parcial") {
      return { label: "Informar nuevo pago", icon: Banknote, action: () => setShowPaymentDrawer(true) };
    }
    return null;
  };
  const primaryCTA = getPrimaryCTA();

  return (
    <>
      <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Mi estado</h3>
        </div>

        {/* Mini progress bar */}
        {reservation.payment_status !== "no_aplica" && !["cancelada", "rechazada", "cancelacion_solicitada"].includes(reservation.reservation_status) && (
          <div className="flex items-center gap-1">
            {progressSteps.map((step, i) => (
              <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
                <div className={`h-1.5 w-full rounded-full transition-colors ${
                  i < progressIndex ? "bg-primary" : "bg-muted"
                }`} />
                <span className={`text-[10px] ${i < progressIndex ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Reservation status badge */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${resSt.className}`}>
          <resSt.icon className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">{resSt.label}</span>
        </div>

        {/* Payment status badge */}
        {reservation.payment_status !== "no_aplica" && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${paySt.className}`}>
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">{paySt.label}</span>
          </div>
        )}

        {/* Financial details */}
        <div className="space-y-2 text-sm">
          {reservation.amount_total != null && reservation.amount_total > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto total</span>
                <span className="font-semibold text-foreground">{formatPrice(reservation.amount_total, currency)}</span>
              </div>
              {reservation.amount_paid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abonado</span>
                  <span className="font-semibold text-emerald-400">{formatPrice(reservation.amount_paid, currency)}</span>
                </div>
              )}
              {reservation.balance_due != null && reservation.balance_due > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo pendiente</span>
                  <span className="font-semibold text-amber-400">{formatPrice(reservation.balance_due, currency)}</span>
                </div>
              )}
            </>
          )}
          {reservation.next_due_date && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Próximo vencimiento</span>
              <span className="text-foreground">
                {new Date(reservation.next_due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fecha de solicitud</span>
            <span className="text-foreground">
              {new Date(reservation.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Admin notes */}
        {reservation.admin_notes && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Observaciones del equipo:</span> {reservation.admin_notes}
            </p>
          </div>
        )}
        {!reservation.admin_notes && reservation.notas && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Observaciones del equipo:</span> {reservation.notas}
            </p>
          </div>
        )}

        {/* Next step */}
        {nextStep && (
          <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/30">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Próximo paso:</span> {nextStep}
            </p>
          </div>
        )}

        {/* Confirmed success state */}
        {isConfirmed && isPaymentValidated && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Reserva confirmada</p>
              <p className="text-xs text-muted-foreground">Tu lugar está asegurado. ¡Nos vemos ahí! 🎉</p>
            </div>
          </div>
        )}

        {/* Dynamic CTAs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {primaryCTA && (
            <Button variant="gold" className="flex-1" onClick={primaryCTA.action}>
              <primaryCTA.icon className="w-4 h-4 mr-2" /> {primaryCTA.label}
            </Button>
          )}
          {reglamentoUrl && (
            <a href={reglamentoUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" className="w-full text-xs">
                <FileText className="w-4 h-4 mr-1" /> Reglamento
              </Button>
            </a>
          )}
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" className="w-full text-xs">
                <MessageCircle className="w-4 h-4 mr-1" /> Chatear
              </Button>
            </a>
          )}
        </div>

        {/* Cancel reservation */}
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setShowCancelDrawer(true)}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar reserva
          </Button>
        )}

        {/* Cancellation expired message */}
        {cancellationExpired && (
          <p className="text-[10px] text-muted-foreground text-center px-2">
            La cancelación online ya no está disponible. Si necesitás ayuda, contactate con el equipo.
          </p>
        )}
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
