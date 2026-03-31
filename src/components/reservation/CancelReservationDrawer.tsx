import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";

interface CancelReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  eventTitle: string;
  eventDate: string;
  cancellationPolicy: {
    allow_cancellation: boolean;
    cancellation_days_before: number;
    cancellation_type: string;
    cancellation_text_short: string;
    cancellation_text_full: string;
    require_reason: boolean;
  };
  onCancelled: () => void;
}

const policyConsequences: Record<string, string> = {
  sin_penalidad: "La reserva será cancelada sin penalidad.",
  seña_no_reembolsable: "La seña no es reembolsable.",
  credito_a_favor: "Tu pago quedará como crédito a favor.",
  sujeta_revision: "La solicitud de cancelación será revisada por el equipo.",
  personalizada: "",
};

const CancelReservationDrawer = ({
  open, onOpenChange, reservationId, eventTitle, eventDate,
  cancellationPolicy, onCancelled,
}: CancelReservationDrawerProps) => {
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const consequence = cancellationPolicy.cancellation_type === "personalizada"
    ? cancellationPolicy.cancellation_text_short
    : policyConsequences[cancellationPolicy.cancellation_type] || "La reserva será cancelada.";

  const newStatus = cancellationPolicy.cancellation_type === "sujeta_revision"
    ? "cancelacion_solicitada"
    : "cancelada";

  const handleConfirm = async () => {
    if (!accepted) return;
    if (cancellationPolicy.require_reason && !reason.trim()) {
      toast({ title: "Por favor ingresá un motivo de cancelación.", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from("event_reservations" as any)
      .update({
        reservation_status: newStatus,
        cancellation_reason: reason.trim() || null,
        cancellation_requested_at: new Date().toISOString(),
        cancelled_at: newStatus === "cancelada" ? new Date().toISOString() : null,
      } as any)
      .eq("id", reservationId);

    if (error) {
      toast({ title: "Error al cancelar la reserva.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Log history
    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: reservationId,
      new_reservation_status: newStatus,
      changed_by_role: "alumno",
      note: reason.trim() ? `Cancelación solicitada: ${reason.trim()}` : "Cancelación solicitada por el alumno",
    } as any);

    setSubmitting(false);
    setSuccess(true);
    onCancelled();
    toast({ title: newStatus === "cancelada" ? "Reserva cancelada." : "Solicitud de cancelación enviada." });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSuccess(false);
      setAccepted(false);
      setReason("");
    }, 300);
  };

  const d = new Date(eventDate + "T12:00:00");
  const dateStr = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {success ? "Cancelación procesada" : "Cancelar reserva"}
          </DrawerTitle>
          <DrawerDescription>
            {success ? "Tu solicitud fue procesada." : "Revisá las condiciones antes de confirmar."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-heading font-semibold text-foreground">
                  {newStatus === "cancelada" ? "Tu reserva fue cancelada." : "Tu solicitud de cancelación fue enviada."}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {newStatus === "cancelada"
                    ? "La reserva ha sido cancelada exitosamente."
                    : "El equipo revisará tu solicitud y te notificará."}
                </p>
              </div>
              <Button variant="gold" className="w-full" onClick={handleClose}>Cerrar</Button>
            </div>
          ) : (
            <>
              {/* Event summary */}
              <div className="glass-card rounded-xl p-4 space-y-2">
                <h4 className="font-heading font-semibold text-sm text-foreground">{eventTitle}</h4>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="capitalize">{dateStr}</span>
                </p>
              </div>

              {/* Consequence */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Consecuencia de la cancelación</p>
                  <p className="text-sm text-muted-foreground">{consequence}</p>
                </div>
              </div>

              {/* Full policy text */}
              {cancellationPolicy.cancellation_text_full && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border/30">
                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                    {cancellationPolicy.cancellation_text_full}
                  </p>
                </div>
              )}

              {/* Reason */}
              {cancellationPolicy.require_reason && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">Motivo de cancelación *</label>
                  <Textarea
                    placeholder="Contanos por qué querés cancelar..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </div>
              )}

              {/* Checkbox */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Checkbox
                  id="accept-cancel"
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(!!v)}
                  className="mt-0.5"
                />
                <label htmlFor="accept-cancel" className="text-xs text-muted-foreground cursor-pointer">
                  He leído y acepto las políticas de cancelación
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Volver
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={!accepted || submitting || (cancellationPolicy.require_reason && !reason.trim())}
                  onClick={handleConfirm}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                  ) : (
                    "Confirmar cancelación"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default CancelReservationDrawer;
