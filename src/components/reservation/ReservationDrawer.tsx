import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  CalendarDays, MapPin, Users, Mountain, Loader2, CheckCircle,
  CreditCard, ArrowRight, X, UserCheck,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface Event {
  id: string;
  title: string;
  date: string;
  location: string | null;
  price: number | null;
  currency: string;
  level: string | null;
  max_capacity: number | null;
  spots_taken: number;
  type: string;
}

interface ReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  alumno: Alumno;
  onReserved: (reservation: any) => void;
  eventNature?: string;
}

const ReservationDrawer = ({ open, onOpenChange, event, alumno, onReserved, eventNature = "propio_con_reserva" }: ReservationDrawerProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"summary" | "form" | "submitting" | "success">("summary");
  const [notes, setNotes] = useState("");

  const isInscriptionOnly = eventNature === "propio_solo_inscripcion";
  const spotsLeft = event.max_capacity != null ? event.max_capacity - event.spots_taken : null;
  const isPaid = event.price != null && event.price > 0;
  const d = new Date(event.date + "T12:00:00");
  const dateStr = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  // Check profile completeness
  const missingFields: string[] = [];
  if (!alumno.nombre) missingFields.push("Nombre");
  if (!alumno.apellido) missingFields.push("Apellido");
  if (!alumno.telefono) missingFields.push("Teléfono");

  // Labels based on event nature
  const labels = isInscriptionOnly
    ? {
        drawerTitle: "Inscripción",
        drawerTitleSuccess: "¡Inscripción confirmada!",
        drawerDesc: event.title,
        drawerDescSuccess: "Tu inscripción fue registrada correctamente.",
        summaryHint: "Estás por inscribirte a este evento. Tu lugar queda confirmado al enviar.",
        confirmBtn: "Confirmar inscripción",
        confirmIcon: UserCheck,
        successTitle: "¡Te inscribiste con éxito!",
        successDesc: "Tu lugar está confirmado. ¡Nos vemos ahí! 🎉",
        successBtn: "Ver mi estado",
        toastTitle: "¡Inscripción confirmada!",
      }
    : {
        drawerTitle: "Reservar lugar",
        drawerTitleSuccess: "¡Reserva enviada!",
        drawerDesc: event.title,
        drawerDescSuccess: "Tu solicitud fue registrada correctamente.",
        summaryHint: 'Estás por iniciar la reserva de este evento. Una vez enviada, vas a poder seguir el estado desde "Mis eventos".',
        confirmBtn: "Confirmar reserva",
        confirmIcon: CreditCard,
        successTitle: "Tu solicitud de reserva fue enviada con éxito.",
        successDesc: 'Ya podés seguir el estado de este evento desde "Mis eventos".',
        successBtn: "Ver mi estado",
        toastTitle: "¡Solicitud de reserva enviada!",
      };

  const handleSubmit = async () => {
    setStep("submitting");

    // For inscription-only: confirm immediately
    const reservationStatus = isInscriptionOnly ? "reserva_confirmada" : "solicitud_enviada";
    const paymentStatus = isInscriptionOnly || !isPaid ? "no_aplica" : "no_informado";

    const reservationPayload = {
      event_id: event.id,
      alumno_id: alumno.id,
      reservation_status: reservationStatus,
      payment_status: paymentStatus,
      estado: reservationStatus,
      metodo_pago: isInscriptionOnly ? "no_aplica" : "pendiente",
      amount_total: event.price,
      amount_paid: 0,
      price_snapshot: event.price,
      currency_snapshot: event.currency,
      moneda: event.currency,
      monto: event.price,
      balance_due: isInscriptionOnly ? 0 : event.price,
      participant_notes: notes.trim() || null,
      created_by: "cliente",
      confirmed_at: isInscriptionOnly ? new Date().toISOString() : null,
      cancelled_at: null,
      cancellation_reason: null,
      cancellation_requested_at: null,
    };

    // Check if there's an existing (cancelled) reservation to reactivate
    const { data: existing } = await supabase
      .from("event_reservations" as any)
      .select("id, reservation_status")
      .eq("event_id", event.id)
      .eq("alumno_id", alumno.id)
      .maybeSingle();

    let data: any;
    let error: any;

    if (existing) {
      // Reactivate the existing reservation
      const { data: updated, error: updateError } = await supabase
        .from("event_reservations" as any)
        .update(reservationPayload as any)
        .eq("id", (existing as any).id)
        .select("*")
        .single();
      data = updated;
      error = updateError;
    } else {
      // Create new reservation
      const { data: inserted, error: insertError } = await supabase
        .from("event_reservations" as any)
        .insert(reservationPayload as any)
        .select("*")
        .single();
      data = inserted;
      error = insertError;
    }

    if (error) {
      toast({ title: "Error al registrar.", description: error.message, variant: "destructive" });
      setStep("form");
      return;
    }

    // Log status history
    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: (data as any).id,
      new_reservation_status: reservationStatus,
      new_payment_status: paymentStatus,
      changed_by: alumno.user_id,
      changed_by_role: "alumno",
      note: isInscriptionOnly ? "Inscripción confirmada automáticamente" : "Reserva iniciada por el alumno",
    } as any);

    // Notify admin (fire and forget)
    if (!isInscriptionOnly) {
      try {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-event-cash-payment`;
        fetch(functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ alumno_id: alumno.id, event_id: event.id, reservation_id: (data as any)?.id }),
        }).catch(() => {});
      } catch { /* fire and forget */ }
    }

    setStep("success");
    onReserved(data);
    toast({ title: labels.toastTitle });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("summary");
      setNotes("");
    }, 300);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {step === "success" ? labels.drawerTitleSuccess : labels.drawerTitle}
          </DrawerTitle>
          <DrawerDescription>
            {step === "success" ? labels.drawerDescSuccess : labels.drawerDesc}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">

          {/* ── Step: Summary ── */}
          {step === "summary" && (
            <>
              <div className="glass-card rounded-xl p-4 space-y-3">
                <h4 className="font-heading font-semibold text-sm text-foreground">{event.title}</h4>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> <span className="capitalize">{dateStr}</span></p>
                  {event.location && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {event.location}</p>}
                  {event.level && <p className="flex items-center gap-2"><Mountain className="w-4 h-4 text-primary" /> Nivel: {event.level}</p>}
                  {spotsLeft != null && <p className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {spotsLeft > 0 ? `${spotsLeft} cupos disponibles` : "Sin cupos"}</p>}
                </div>
                {isPaid && !isInscriptionOnly && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">Precio por persona</p>
                    <p className="text-xl font-heading font-bold text-primary">{formatPrice(event.price!, event.currency)}</p>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {labels.summaryHint}
              </p>

              {missingFields.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  Recordá completar estos datos en tu perfil: {missingFields.join(", ")}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  variant="gold"
                  className="flex-1"
                  onClick={() => setStep("form")}
                  disabled={spotsLeft !== null && spotsLeft <= 0}
                >
                  Continuar <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Form ── */}
          {step === "form" && (
            <>
              <div className="glass-card rounded-xl p-4 space-y-3">
                <h4 className="font-heading font-semibold text-sm text-foreground">Tus datos</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-foreground">{alumno.nombre} {alumno.apellido || ""}</p>
                  <p className="text-muted-foreground">{alumno.email}</p>
                  {alumno.telefono && <p className="text-muted-foreground">{alumno.telefono}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
                <Textarea
                  placeholder={
                    event.type === "camp" || event.type === "viaje"
                      ? "Ej: necesito habitación individual, soy celíaco, etc."
                      : "Ej: llego 30 min tarde, voy con un acompañante, etc."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("summary")}>
                  Volver
                </Button>
                <Button variant="gold" className="flex-1" onClick={handleSubmit}>
                  <labels.confirmIcon className="w-4 h-4 mr-2" /> {labels.confirmBtn}
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Submitting ── */}
          {step === "submitting" && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
              <p className="text-sm text-muted-foreground">
                {isInscriptionOnly ? "Confirmando tu inscripción..." : "Procesando tu reserva..."}
              </p>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-heading font-semibold text-foreground">{labels.successTitle}</h3>
                <p className="text-sm text-muted-foreground">{labels.successDesc}</p>
              </div>
              <Button variant="gold" className="w-full" onClick={handleClose}>
                {labels.successBtn}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ReservationDrawer;
