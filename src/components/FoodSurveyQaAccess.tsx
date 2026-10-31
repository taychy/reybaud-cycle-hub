import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/** Authorization is event-scoped in the server allowlist, never a global role. */
export default function FoodSurveyQaAccess({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const eventId = params.get("evento");
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [identity, setIdentity] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let sequence = 0;
    const check = async () => {
      const request = ++sequence;
      setStatus("loading");
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || request !== sequence) return;
      setIdentity(session?.user.id ?? null);
      if (!session) {
        navigate(`/admin/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
        return;
      }
      if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) { setStatus("denied"); return; }
      const { data, error } = await supabase.rpc("can_access_trip_food_survey_qa", { p_event_id: eventId });
      if (!cancelled && request === sequence) setStatus(!error && data === true ? "allowed" : "denied");
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { setStatus("loading"); window.setTimeout(() => { if (!cancelled) void check(); }, 0); });
    void check();
    return () => { cancelled = true; sequence++; subscription.unsubscribe(); };
  }, [eventId, navigate]);
  if (status === "allowed") return <div key={identity}>{children}</div>;
  return <main className="min-h-screen bg-background text-foreground p-6"><p role={status === "denied" ? "alert" : "status"}>{status === "denied" ? "No hay pruebas habilitadas para esta cuenta y este evento." : "Verificando acceso…"}</p></main>;
}