import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import { Trophy, User, Medal, MessageSquare, Clock, CalendarDays, MapPin } from "lucide-react";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  team_name: string;
  score: number | null;
  time_result: string | null;
  position: number | null;
  staff_feedback: string | null;
  results_updated_at: string | null;
}

interface RankingEntry {
  first_name: string;
  last_name: string;
  team_name: string;
  score: number | null;
  time_result: string | null;
  position: number | null;
}

const EventResults = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token inválido o ausente.");
      setLoading(false);
      return;
    }

    const load = async () => {
      // Fetch participant by token
      const { data: p, error: pErr } = await supabase
        .from("event_participants")
        .select("*")
        .eq("public_access_token", token)
        .eq("event_slug", "record-del-ahora")
        .maybeSingle();

      if (pErr || !p) {
        setError("Token inválido o expirado.");
        setLoading(false);
        return;
      }

      // Check expiry
      if (p.token_expires_at && new Date(p.token_expires_at) < new Date()) {
        setError("Este link ha expirado.");
        setLoading(false);
        return;
      }

      setParticipant(p as Participant);

      // Fetch ranking (top 20, ordered by score desc)
      const { data: rankData } = await supabase
        .from("event_participants")
        .select("first_name, last_name, team_name, score, time_result, position")
        .eq("event_slug", "record-del-ahora")
        .not("score", "is", null)
        .order("score", { ascending: false })
        .limit(20);

      setRanking((rankData as RankingEntry[]) || []);
      setLoading(false);
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 gap-4">
        <img src={logo} alt="Reybaud" className="w-12 h-12 rounded-full" />
        <p className="text-destructive text-center">{error}</p>
      </div>
    );
  }

  const hasResults = participant?.score !== null || participant?.time_result !== null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8 gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <img src={logo} alt="Reybaud" className="w-12 h-12 rounded-full" />
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Record del Ahora
        </h1>
        <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-primary" />29/02/2026</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-primary" />08:00</span>
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />KDT, Palermo</span>
        </div>
      </div>

      {/* Card: My Data */}
      <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mis datos</h2>
        </div>
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Nombre:</span> {participant?.first_name} {participant?.last_name}</p>
          <p><span className="text-muted-foreground">Equipo:</span> {participant?.team_name}</p>
        </div>
      </div>

      {/* Card: My Results */}
      <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Medal className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi calificación</h2>
        </div>

        {!hasResults ? (
          <p className="text-sm text-muted-foreground">Tu calificación aún no está disponible.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {participant?.score !== null && (
              <p><span className="text-muted-foreground">Puntaje:</span> <span className="font-semibold text-primary text-lg">{participant?.score}</span></p>
            )}
            {participant?.time_result && (
              <p><span className="text-muted-foreground">Tiempo:</span> <span className="font-semibold">{participant?.time_result}</span></p>
            )}
            {participant?.position !== null && (
              <p><span className="text-muted-foreground">Posición:</span> <span className="font-semibold">#{participant?.position}</span></p>
            )}
            {participant?.staff_feedback && (
              <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Comentario del staff</span>
                </div>
                <p className="text-sm">{participant?.staff_feedback}</p>
              </div>
            )}
            {participant?.results_updated_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Actualizado: {new Date(participant.results_updated_at).toLocaleString("es-AR")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Card: Ranking */}
      <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Ranking general</h2>
        </div>

        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">El ranking aún no está disponible.</p>
        ) : (
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                  r.first_name === participant?.first_name && r.last_name === participant?.last_name
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-secondary/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-heading font-bold text-primary w-6 text-center">
                    {r.position ?? i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{r.first_name} {r.last_name}</p>
                    <p className="text-xs text-muted-foreground">{r.team_name}</p>
                  </div>
                </div>
                <span className="font-semibold">
                  {r.score !== null ? r.score : r.time_result ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventResults;
