import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { Trophy, User, Medal, MessageSquare, Clock, CalendarDays, MapPin, Upload, Ruler, X, Download } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { logEventResultSubmission } from "@/lib/logEventResultSubmission";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  team_name: string;
  status: string;
  score: number | null;
  time_result: string | null;
  time_value: number | null;
  position: number | null;
  staff_feedback: string | null;
  results_updated_at: string | null;
  participant_comment: string | null;
  rejection_reason: string | null;
  event_id: string | null;
}

interface TeamRanking {
  team_name: string;
  total_distance: number;
  members: { first_name: string; last_name: string; distance: number }[];
}

const EventResults = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const [hideBanner, setHideBanner] = useState(() => localStorage.getItem("hide_install_banner") === "true");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [teamRanking, setTeamRanking] = useState<TeamRanking[]>([]);
  const [stages, setStages] = useState<Array<{ id: string; date: string; location: string | null; metadata: any }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Distance submission form
  const [showDistanceForm, setShowDistanceForm] = useState(false);
  const [distanceKm, setDistanceKm] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!token) {
      setError("Token inválido o ausente.");
      setLoading(false);
      return;
    }

    // 1) Lookup seguro vía edge function (no expone otros participantes)
    const { data: getRes, error: getErr } = await supabase.functions.invoke(
      "get-event-participant-by-token",
      { body: { action: "get", token } }
    );

    if (getErr || !getRes?.ok || !getRes?.participant) {
      const code = (getRes as any)?.error;
      if (code === "token_expired") setError("Este link ha expirado.");
      else setError("Token inválido o expirado.");
      setLoading(false);
      return;
    }

    const p = getRes.participant as Participant;
    setParticipant(p);

    // 2) Ranking del evento, sin PII (sin email, sin token), vía edge function
    if (p.event_id) {
      const { data: rankRes } = await supabase.functions.invoke(
        "get-event-participant-by-token",
        { body: { action: "ranking", event_id: p.event_id } }
      );

      const rankData: any[] = rankRes?.ranking ?? [];
      const teamMap = new Map<string, TeamRanking>();
      rankData.forEach((r) => {
        const team = r.team_name || "Sin equipo";
        if (!teamMap.has(team)) {
          teamMap.set(team, { team_name: team, total_distance: 0, members: [] });
        }
        const t = teamMap.get(team)!;
        const dist = Number(r.time_value) || 0;
        t.total_distance += dist;
        t.members.push({ first_name: r.first_name, last_name: r.last_name, distance: dist });
      });
      const sorted = Array.from(teamMap.values()).sort((a, b) => b.total_distance - a.total_distance);
      setTeamRanking(sorted);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [token]);

  // Load all record_hora stages to show dynamic header (avoid stale hardcoded date)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, date, location, metadata")
        .eq("type", "record_hora" as any)
        .eq("is_active", true)
        .order("date", { ascending: true });
      setStages((data || []) as any);
    })();
  }, []);

  const handleSubmitDistance = async () => {
    const km = parseFloat(distanceKm);
    if (!km || km <= 0) {
      toast({ title: "Error", description: "Ingresá una distancia válida.", variant: "destructive" });
      return;
    }
    if (!participant || !token) return;

    setSubmitting(true);

    const { data: subRes, error: subErr } = await supabase.functions.invoke(
      "get-event-participant-by-token",
      {
        body: {
          action: "submit_distance",
          token,
          distance_km: km,
          comment: comment.trim() || null,
        },
      }
    );

    if (subErr || !subRes?.ok) {
      const code = (subRes as any)?.error;
      const msg =
        code === "token_expired"
          ? "Tu link expiró. Pedile al staff un link nuevo."
          : code === "invalid_distance"
          ? "Ingresá una distancia válida."
          : "No se pudo guardar tu resultado. Probá de nuevo en un momento.";
      toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
    } else {
      toast({ title: "¡Distancia cargada!", description: "Tu resultado fue enviado para revisión." });
      setShowDistanceForm(false);
      // Audit log: registra cada submit/edición vía token público
      logEventResultSubmission({
        eventId: participant.event_id || "",
        alumnoEmail: participant.email,
        participantId: participant.id,
        source: "public_token",
        distanceKm: km,
        comment: comment.trim() || null,
        isEdit: !!subRes.was_edit,
      });
      await load();
    }
    setSubmitting(false);
  };

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

  const canSubmitDistance =
    participant?.status === "checked_in" || participant?.status === "rejected";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8 gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <img src={logo} alt="Reybaud" className="w-12 h-12 rounded-full" />
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Record de la Hora
        </h1>
        {stages.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2 mt-1">
            {stages.map((s, idx) => {
              const [y, m, d] = s.date.split("-");
              const dateStr = `${d}/${m}/${y}`;
              const timeStr = (s.metadata?.start_time as string | undefined)?.trim() || "08:00";
              const loc = s.location || s.metadata?.location_name || "KDT, Palermo";
              const isActive = participant?.event_id === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg px-3 py-2 border ${isActive ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20 opacity-70"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      Etapa {idx + 1}{isActive ? " · Actual" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-primary" />{dateStr}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-primary" />{timeStr}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />{loc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Install app banner - mobile only, not installed, not dismissed */}
      {isMobile && !isStandalone && !hideBanner && (
        <div className="w-full max-w-md bg-secondary/50 border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            📲 <span className="font-semibold text-foreground">Instalá la app en tu teléfono</span> para una mejor experiencia
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/instalar")}>
              Instalar
            </Button>
            <button
              onClick={() => {
                localStorage.setItem("hide_install_banner", "true");
                setHideBanner(true);
              }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mis datos</h2>
        </div>
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Nombre:</span> {participant?.first_name} {participant?.last_name}</p>
          <p><span className="text-muted-foreground">Equipo:</span> {participant?.team_name || "Sin equipo"}</p>
        </div>
      </div>

      {/* Card: Submit Distance */}
      {canSubmitDistance && (
        <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Cargar mi distancia</h2>
          </div>

          {participant?.status === "rejected" && participant?.rejection_reason && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
              Tu resultado anterior fue rechazado: "{participant.rejection_reason}". Podés cargar uno nuevo.
            </div>
          )}

          {!showDistanceForm ? (
            <Button variant="gold" className="w-full h-12" onClick={() => setShowDistanceForm(true)}>
              <Ruler className="w-4 h-4 mr-2" />
              Cargar mi distancia
            </Button>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Distancia (km)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 32.50"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Comentario (opcional)</Label>
                <Textarea
                  placeholder="Alguna observación sobre tu resultado..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="gold"
                  className="flex-1"
                  onClick={handleSubmitDistance}
                  disabled={submitting}
                >
                  {submitting ? "Enviando..." : "Enviar resultado"}
                </Button>
                <Button variant="outline" onClick={() => setShowDistanceForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card: Status info */}
      {participant?.status === "result_submitted" && (
        <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Tu distancia <span className="font-semibold text-foreground">{participant.time_result}</span> fue enviada y está pendiente de revisión por el coach.
          </p>
        </div>
      )}

      {/* Card: My Results (approved) */}
      {participant?.status === "approved" && (
        <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Medal className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi calificación</h2>
          </div>
          <div className="space-y-2 text-sm">
            {participant.time_result && (
              <p><span className="text-muted-foreground">Distancia:</span> <span className="font-semibold text-primary text-lg">{participant.time_result}</span></p>
            )}
            {participant.position !== null && (
              <p><span className="text-muted-foreground">Posición:</span> <span className="font-semibold">#{participant.position}</span></p>
            )}
            {participant.staff_feedback && (
              <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Comentario del staff</span>
                </div>
                <p className="text-sm">{participant.staff_feedback}</p>
              </div>
            )}
            {participant.results_updated_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Actualizado: {new Date(participant.results_updated_at).toLocaleString("es-AR")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Card: Team Ranking */}
      <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Ranking por equipo</h2>
        </div>

        {teamRanking.length === 0 ? (
          <p className="text-sm text-muted-foreground">El ranking aún no está disponible.</p>
        ) : (
          <div className="space-y-3">
            {teamRanking.map((team, i) => (
              <div
                key={team.team_name}
                className={`p-3 rounded-lg text-sm ${
                  team.team_name === (participant?.team_name || "Sin equipo")
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-bold text-primary w-6 text-center">
                      {i + 1}
                    </span>
                    <span className="font-semibold">{team.team_name}</span>
                  </div>
                  <span className="font-mono font-semibold text-primary">
                    {team.total_distance.toFixed(2)} km
                  </span>
                </div>
                <div className="pl-9 space-y-0.5">
                  {team.members.map((m, j) => (
                    <p key={j} className="text-xs text-muted-foreground">
                      {m.first_name} {m.last_name} — {m.distance.toFixed(2)} km
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventResults;
