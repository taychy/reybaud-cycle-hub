import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Compatibilidad con mails viejos: /mis-reservas?reservation=<id>
 * Resuelve server-side el access_token y redirige a /viaje/mi-reserva?token=...
 * No requiere login y no expone datos del participante.
 */
const MisReservasLegacyRedirect = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const reservationId = params.get("reservation") || params.get("reserva");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reservationId) {
        setError("El enlace está incompleto. Pedinos que te lo reenviemos y lo resolvemos enseguida.");
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke<any>(
        "get-event-participant-by-token",
        { body: { action: "resolve_reservation_link", reservation_id: reservationId } },
      );
      if (cancelled) return;
      const token = data?.token;
      if (token) {
        navigate(`/viaje/mi-reserva?token=${encodeURIComponent(token)}`, { replace: true });
        return;
      }
      const code = data?.error;
      if (code === "cancelled") {
        setError("Esta reserva figura cancelada. Si creés que es un error, escribinos y lo revisamos.");
      } else if (code === "not_found" || code === "invalid_reservation_id") {
        setError("No encontramos esta reserva. Revisá el enlace o escribinos y te mandamos uno nuevo.");
      } else if (fnErr || code) {
        setError("No pudimos abrir tu reserva en este momento. Probá de nuevo en unos minutos o escribinos.");
      }
    })();
    return () => { cancelled = true; };
  }, [reservationId, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-foreground mb-6 max-w-md">{error}</p>
        <Button onClick={() => navigate("/")}>Volver al inicio</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default MisReservasLegacyRedirect;
