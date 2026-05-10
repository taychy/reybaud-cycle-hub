import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Ruler, ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Mode = "needs_checkin" | "needs_result";

interface PendingItem {
  mode: Mode;
  eventId: string;
  eventTitle: string;
  eventDate: string;
}

interface HomePendingResultBannerProps {
  alumnoEmail: string | null | undefined;
}

/**
 * Banner adaptable para eventos tipo Record:
 *  - "needs_checkin": el alumno está inscripto, la ventana de check-in ya abrió
 *    pero todavía no marcó presente. CTA -> ir al evento a hacer check-in.
 *  - "needs_result": el alumno ya hizo check-in y todavía no cargó el resultado.
 *    CTA -> ir al evento a cargar resultado.
 */
const HomePendingResultBanner = ({ alumnoEmail }: HomePendingResultBannerProps) => {
  const [pending, setPending] = useState<PendingItem | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!alumnoEmail) return;
    const email = alumnoEmail.toLowerCase().trim();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    (async () => {
      const { data: parts } = await supabase
        .from("event_participants")
        .select("id, event_id, time_value, status, checked_in_at")
        .eq("email", email)
        .is("time_value", null);

      if (!parts || parts.length === 0) return;
      const eventIds = (parts as any[]).map((p) => p.event_id).filter(Boolean);
      if (eventIds.length === 0) return;

      const { data: evs } = await supabase
        .from("events")
        .select("id, title, date, end_date, type, metadata")
        .in("id", eventIds)
        .eq("type", "record_hora" as any);

      if (!evs || evs.length === 0) return;

      // Recorremos eventos vigentes/recientes (no muy viejos)
      const candidates = (evs as any[])
        .map((e) => {
          const part = (parts as any[]).find((p) => p.event_id === e.id);
          const checkinOpensAt = e.metadata?.checkin_opens_at
            ? new Date(e.metadata.checkin_opens_at)
            : new Date(`${e.date}T00:00:00`);
          const eventEnd = e.end_date || e.date;
          const isCheckedIn = part?.status === "checked_in" || !!part?.checked_in_at;
          return { e, part, checkinOpensAt, eventEnd, isCheckedIn };
        })
        .filter((c) => !!c.part);

      // 1) Prioridad: needs_result (ya hizo check-in, evento ya pasó o está en curso)
      const needsResult = candidates
        .filter((c) => c.isCheckedIn && c.eventEnd <= today)
        .sort((a, b) => b.eventEnd.localeCompare(a.eventEnd))[0];

      if (needsResult) {
        setPending({
          mode: "needs_result",
          eventId: needsResult.e.id,
          eventTitle: needsResult.e.title,
          eventDate: needsResult.e.date,
        });
        return;
      }

      // 2) needs_checkin: ventana abierta, evento aún no terminó, no hizo check-in
      const needsCheckin = candidates
        .filter(
          (c) =>
            !c.isCheckedIn &&
            c.checkinOpensAt <= now &&
            c.eventEnd >= today,
        )
        .sort((a, b) => a.checkinOpensAt.getTime() - b.checkinOpensAt.getTime())[0];

      if (needsCheckin) {
        setPending({
          mode: "needs_checkin",
          eventId: needsCheckin.e.id,
          eventTitle: needsCheckin.e.title,
          eventDate: needsCheckin.e.date,
        });
      }
    })();
  }, [alumnoEmail]);

  if (!pending) return null;

  const isCheckin = pending.mode === "needs_checkin";
  const Icon = isCheckin ? MapPin : Ruler;
  const label = isCheckin ? "Check-in disponible" : "Resultado pendiente";
  const description = isCheckin
    ? `El check-in está abierto. Marcá tu presencia en ${pending.eventTitle}.`
    : `Cargá tu resultado del ${pending.eventTitle} para que quede registrado en tu historial.`;

  return (
    <button
      onClick={() => navigate(`/eventos/${pending.eventId}`)}
      className="w-full text-left rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-2 shadow-lg shadow-black/10 transition-all hover:border-primary/60 hover:shadow-primary/20 active:scale-[0.98] cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-primary truncate flex-1">
          {label}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-primary/15 text-primary border-primary/30">
          Acción
        </Badge>
        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
      </div>
      <p className="text-xs text-foreground/80 line-clamp-2">{description}</p>
    </button>
  );
};

export default HomePendingResultBanner;
