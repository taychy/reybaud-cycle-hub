import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import TripFoodSurveyDrawer from "@/components/reservation/TripFoodSurveyDrawer";
import { isFoodSurveyEnabled } from "@/lib/foodSurvey";
import { Button } from "@/components/ui/button";
import { Loader2, Utensils } from "lucide-react";

export default function TripFoodSurvey() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reservation, setReservation] = useState<{ id: string; alumno_id: string | null } | null>(null);
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const eventId = params.get("evento");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setReservation(null); setError(""); setOpen(false);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
        return;
      }
      if (!eventId) { setError("No encontramos el viaje de este enlace."); setLoading(false); return; }
      const { data, error: readError } = await supabase.rpc("get_my_trip_food_survey", { p_event: eventId });
      if (cancelled) return;
      const context = data as { reservation?: { id: string; alumno_id: string | null }; event?: { title: string; metadata: unknown } } | null;
      if (readError || !context?.reservation || !isFoodSurveyEnabled(context.event?.metadata)) {
        setError("No hay una reserva confirmada de este viaje vinculada a tu cuenta. Si reservaste como invitado, usá tu enlace personal.");
      } else {
        setReservation(context.reservation); setTitle(context.event?.title ?? "Mi viaje"); setOpen(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId, navigate, location.pathname, location.search]);
  return <main className="min-h-screen bg-background text-foreground px-4 py-10">
    <div className="mx-auto max-w-xl space-y-5">
      <Utensils className="text-primary h-8 w-8" />
      <h1 className="text-2xl font-semibold">{title || "Encuesta gastronómica"}</h1>
      {loading ? <Loader2 className="animate-spin" /> : error ? <p role="alert">{error}</p> : <Button className="w-full h-12" onClick={() => setOpen(true)}>Editar mis preferencias alimentarias</Button>}
      <Link className="block text-primary underline" to="/eventos">Mis viajes</Link>
    </div>
    {reservation && <TripFoodSurveyDrawer open={open} onOpenChange={setOpen} reservationId={reservation.id} alumnoId={reservation.alumno_id} onSaved={() => {}} />}
  </main>;
}