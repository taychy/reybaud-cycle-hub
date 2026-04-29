import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users } from "lucide-react";

interface RankingEntry {
  id: string;
  avg_speed_kmh: number;
  nombre: string;
  grupo: string;
}

interface TeamRanking {
  grupo: string;
  avgSpeed: number;
  count: number;
}

interface Props {
  eventId: string;
  eventType?: string;
  eventDate?: string; // ISO YYYY-MM-DD; si es record_hora y la fecha es futura, no se muestra ranking
}

export default function EventRankings({ eventId, eventType, eventDate }: Props) {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [teams, setTeams] = useState<TeamRanking[]>([]);
  const [loading, setLoading] = useState(true);

  // Para record_hora: no cargar ni mostrar ranking si el evento todavía no ocurrió.
  const isRecordHora = eventType === "record_hora";
  const eventNotYetHappened = (() => {
    if (!isRecordHora || !eventDate) return false;
    try {
      const [y, m, d] = eventDate.split("T")[0].split("-").map((s) => parseInt(s, 10));
      const evt = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return evt.getTime() > today.getTime();
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (eventNotYetHappened) {
      setLoading(false);
      setEntries([]);
      setTeams([]);
      return;
    }
    if (eventType === "record_hora") {
      loadParticipantRankings();
    } else {
      loadRankings();
    }
  }, [eventId, eventType, eventNotYetHappened]);

  const loadParticipantRankings = async () => {
    // Usa la vista pública sin PII (sin email, sin token).
    const { data } = await (supabase as any)
      .from("event_participants_ranking")
      .select("id, first_name, last_name, team_name, time_value")
      .eq("event_id", eventId)
      .order("time_value", { ascending: false });

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    const mapped: RankingEntry[] = data.map((r: any) => ({
      id: r.id,
      avg_speed_kmh: r.time_value,
      nombre: `${r.first_name} ${r.last_name}`,
      grupo: r.team_name || "Sin equipo",
    }));

    setEntries(mapped);
    computeTeams(mapped);
    setLoading(false);
  };

  const loadRankings = async () => {
    const { data } = await supabase
      .from("event_results")
      .select("alumno_id, avg_speed_kmh, alumnos(nombre, grupo)")
      .eq("event_id", eventId)
      .not("avg_speed_kmh", "is", null)
      .order("avg_speed_kmh", { ascending: false });

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    const mapped: RankingEntry[] = data.map((r: any) => ({
      id: r.alumno_id,
      avg_speed_kmh: r.avg_speed_kmh,
      nombre: r.alumnos?.nombre || "Desconocido",
      grupo: r.alumnos?.grupo || "Sin equipo",
    }));

    setEntries(mapped);
    computeTeams(mapped);
    setLoading(false);
  };

  const computeTeams = (mapped: RankingEntry[]) => {
    const groupMap: Record<string, { total: number; count: number }> = {};
    mapped.forEach((e) => {
      if (!groupMap[e.grupo]) groupMap[e.grupo] = { total: 0, count: 0 };
      groupMap[e.grupo].total += e.avg_speed_kmh;
      groupMap[e.grupo].count += 1;
    });

    const teamArr: TeamRanking[] = Object.entries(groupMap)
      .map(([grupo, v]) => ({
        grupo,
        avgSpeed: v.total / v.count,
        count: v.count,
      }))
      .sort((a, b) => b.avgSpeed - a.avgSpeed);

    setTeams(teamArr);
  };

  if (eventNotYetHappened) {
    return (
      <div className="glass-card rounded-xl p-5 text-center text-muted-foreground text-sm">
        El ranking estará disponible después del evento.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-5 text-center text-muted-foreground text-sm animate-pulse">
        Cargando rankings...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="glass-card rounded-xl p-5 text-center text-muted-foreground text-sm">
        Todavía no hay resultados cargados para este evento.
      </div>
    );
  }

  const unit = eventType === "record_hora" ? "km" : "km/h";

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Rankings</h2>
      </div>

      <Tabs defaultValue="cyclists" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="cyclists" className="text-xs">Por ciclista</TabsTrigger>
          <TabsTrigger value="teams" className="text-xs">Por equipo</TabsTrigger>
        </TabsList>

        <TabsContent value="cyclists" className="space-y-2 mt-3">
          {entries.map((e, i) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
            >
              <span className={`text-sm font-bold min-w-[24px] text-center ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{e.nombre}</p>
                <p className="text-xs text-muted-foreground">{e.grupo}</p>
              </div>
              <span className="text-sm font-semibold text-primary whitespace-nowrap">
                {e.avg_speed_kmh.toFixed(1)} {unit}
              </span>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="teams" className="space-y-2 mt-3">
          {teams.map((t, i) => (
            <div
              key={t.grupo}
              className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
            >
              <span className={`text-sm font-bold min-w-[24px] text-center ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.grupo}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {t.count} participante{t.count !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="text-sm font-semibold text-primary whitespace-nowrap">
                {t.avgSpeed.toFixed(1)} {unit}
              </span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
