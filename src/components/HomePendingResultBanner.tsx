import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Ruler, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PendingResult {
  participantId: string;
  token: string;
  eventTitle: string;
  eventDate: string;
}

interface HomePendingResultBannerProps {
  alumnoEmail: string | null | undefined;
}

/**
 * Detecta si el alumno está vinculado a un evento tipo Record que ya pasó
 * y todavía no cargó su resultado (time_value IS NULL). Si es así, muestra
 * un CTA destacado para que vaya al flujo público de carga de resultado.
 */
const HomePendingResultBanner = ({ alumnoEmail }: HomePendingResultBannerProps) => {
  const [pending, setPending] = useState<PendingResult | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!alumnoEmail) return;
    const email = alumnoEmail.toLowerCase().trim();
    const today = new Date().toISOString().slice(0, 10);

    (async () => {
      // Buscar participaciones del alumno sin resultado cargado
      const { data: parts } = await supabase
        .from("event_participants")
        .select("id, event_id, public_access_token, time_value, event_slug")
        .eq("email", email)
        .is("time_value", null);

      if (!parts || parts.length === 0) return;

      // Filtrar por eventos tipo record_hora que ya hayan pasado
      const eventIds = parts.map((p: any) => p.event_id).filter(Boolean);
      if (eventIds.length === 0) return;

      const { data: evs } = await supabase
        .from("events")
        .select("id, title, date, end_date, type")
        .in("id", eventIds)
        .eq("type", "record_hora" as any);

      if (!evs || evs.length === 0) return;

      // Tomar el más reciente que ya ocurrió
      const passed = (evs as any[])
        .filter((e) => (e.end_date || e.date) <= today)
        .sort((a, b) => (b.end_date || b.date).localeCompare(a.end_date || a.date));

      if (passed.length === 0) return;

      const ev = passed[0];
      const part = (parts as any[]).find((p) => p.event_id === ev.id);
      if (!part?.public_access_token) return;

      setPending({
        participantId: part.id,
        token: part.public_access_token,
        eventTitle: ev.title,
        eventDate: ev.date,
      });
    })();
  }, [alumnoEmail]);

  if (!pending) return null;

  return (
    <button
      onClick={() => navigate(`/eventos/record-de-la-hora/mi-resultados?token=${pending.token}`)}
      className="w-full text-left rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-2 shadow-lg shadow-black/10 transition-all hover:border-primary/60 active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        <Ruler className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-primary truncate flex-1">
          Resultado pendiente
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-primary/15 text-primary border-primary/30">
          Acción
        </Badge>
        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
      </div>
      <p className="text-xs text-foreground/80 line-clamp-2">
        Cargá tu resultado del <span className="font-semibold">{pending.eventTitle}</span> para que quede registrado en tu historial.
      </p>
    </button>
  );
};

export default HomePendingResultBanner;
