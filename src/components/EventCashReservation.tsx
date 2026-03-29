import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, Banknote, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EventCashReservationProps {
  eventId: string;
  eventTitle: string;
  alumnoId: string;
  price: number | null;
  currency: string;
  onReserved: () => void;
}

const EventCashReservation = ({
  eventId,
  eventTitle,
  alumnoId,
  price,
  currency,
  onReserved,
}: EventCashReservationProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [processing, setProcessing] = useState(false);

  const currencySymbol = currency === "USD" ? "US$" : currency === "EUR" ? "€" : "$";

  const handleConfirm = async () => {
    setProcessing(true);

    const { data: reservation, error } = await supabase
      .from("event_reservations" as any)
      .insert({
        event_id: eventId,
        alumno_id: alumnoId,
        estado: "pendiente_verificacion",
        metodo_pago: "efectivo",
        monto: price,
        moneda: currency,
      } as any)
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Ya tenés una reserva para este evento.", variant: "destructive" });
      } else {
        toast({ title: "Error al registrar la reserva.", variant: "destructive" });
      }
      setProcessing(false);
      return;
    }

    // Notify admin (fire and forget)
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-event-cash-payment`;
      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          alumno_id: alumnoId,
          event_id: eventId,
          reservation_id: (reservation as any)?.id,
        }),
      }).catch(() => {});
    } catch {
      // fire and forget
    }

    // Increment spots_taken
    await supabase.rpc("has_role" as any, { _user_id: alumnoId, _role: "alumno" }).then(() => {
      // We can't directly increment, so we skip - admin handles capacity
    });

    setProcessing(false);
    setStep("done");
    onReserved();
  };

  if (step === "done") {
    return (
      <div className="glass-card rounded-xl p-5 text-center space-y-3 animate-fade-in">
        <CheckCircle className="w-10 h-10 text-primary mx-auto" />
        <h3 className="font-heading font-semibold text-foreground text-sm">
          Reserva registrada
        </h3>
        <p className="text-xs text-muted-foreground">
          Tu pago en efectivo está <strong>pendiente de verificación</strong> por el administrador. Te avisaremos cuando se confirme.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Banknote className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-semibold text-foreground text-sm uppercase tracking-wide">
          Avisar pago en efectivo
        </h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Confirmás que pagaste <strong>{eventTitle}</strong> en efectivo al profesor.
        {price != null && price > 0 && (
          <> Monto: <strong>{currencySymbol} {price.toLocaleString("es-AR")}</strong></>
        )}
      </p>

      <Button
        variant="gold"
        className="w-full"
        disabled={processing}
        onClick={handleConfirm}
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Registrando...
          </>
        ) : (
          <>
            <Banknote className="w-4 h-4 mr-2" />
            Confirmar pago en efectivo
          </>
        )}
      </Button>
    </div>
  );
};

export default EventCashReservation;
