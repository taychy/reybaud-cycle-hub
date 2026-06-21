import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bridge page: validates reservation ownership via `get_my_reservation` RPC
 * and redirects to the event detail page with the appropriate action param so
 * `ReservationStatusCard` can auto-open the right drawer.
 */
const MisReservas = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate(`/login?redirect=${encodeURIComponent(`/mis-reservas/${id}${window.location.search}`)}`, { replace: true });
        return;
      }
      const { data, error: rpcErr } = await supabase.rpc("get_my_reservation", { _reservation_id: id });
      if (cancelled) return;
      if (rpcErr || !data) {
        setError("No tenés acceso a esta reserva o no existe.");
        return;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      const eventId = row?.event_id;
      if (!eventId) {
        setError("No se pudo localizar el evento de la reserva.");
        return;
      }
      const action = params.get("action");
      const qs = new URLSearchParams();
      qs.set("reserva", id);
      if (action) qs.set("action", action);
      navigate(`/eventos/${eventId}?${qs.toString()}`, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [id, params, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-foreground mb-6">{error}</p>
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

export default MisReservas;
