import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { Trophy, User, Medal, MessageSquare, Clock, CalendarDays, MapPin, Upload } from "lucide-react";

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
}

interface RankingEntry {
  first_name: string;
  last_name: string;
  team_name: string;
  time_result: string | null;
  time_value: number | null;
  position: number | null;
}

const EventResults = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Time submission form
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState({ hours: "", minutes: "", seconds: "", comment: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!token) {
      setError("Token inválido o ausente.");
      setLoading(false);
      return;
    }

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

    if (p.token_expires_at && new Date(p.token_expires_at) < new Date()) {
      setError("Este link ha expirado.");
      setLoading(false);
      return;
    }

    setParticipant(p as unknown as Participant);

    // Fetch ranking (approved only, sorted by time_value ASC)
    const { data: rankData } = await supabase
      .from("event_participants")
      .select("first_name, last_name, team_name, time_result, time_value, position")
      .eq("event_slug", "record-del-ahora")
      .eq("status", "approved" as any)
      .not("time_value", "is", null)
      .order("time_value", { ascending: true })
      .limit(20);

    setRanking((rankData as unknown as RankingEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [token]);

  const parseTimeToSeconds = (h: string, m: string, s: string): number | null => {
    const hours = parseInt(h) || 0;
    const minutes = parseInt(m) || 0;
    const seconds = parseInt(s) || 0;
    if (hours === 0 && minutes === 0 && seconds === 0) return null;
    return hours * 3600 + minutes * 60 + seconds;
  };

  const formatTimeDisplay = (h: string, m: string, s: string): string => {
    const pad = (v: string) => v.padStart(2, "0");
    return `${pad(h || "0")}:${pad(m || "0")}:${pad(s || "0")}`;
  };

  const handleSubmitTime = async () => {
    const totalSeconds = parseTimeToSeconds(timeForm.hours, timeForm.minutes, timeForm.seconds);
    if (totalSeconds === null || totalSeconds <= 0) {
      toast({ title: "Error", description: "Ingresá un tiempo válido.", variant: "destructive" });
      return;
    }
    if (!participant) return;

    setSubmitting(true);
    const timeDisplay = formatTimeDisplay(timeForm.hours, timeForm.minutes, timeForm.seconds);

    const { error: updateErr } = await supabase
      .from("event_participants")
      .update({
        time_value: totalSeconds,
        time_result: timeDisplay,
        participant_comment: timeForm.comment.trim() || null,
        status: "result_submitted",
        results_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", participant.id);

    if (updateErr) {
      toast({ title: "Error", description: "No se pudo guardar. Intentá de nuevo.", variant: "destructive" });
    } else {
      toast({ title: "¡Tiempo cargado!", description: "Tu resultado fue enviado para revisión." });
      setShowTimeForm(false);
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

  const canSubmitTime =
    participant?.status === "checked_in" || participant?.status === "rejected";

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

      {/* Card: Submit Time */}
      {canSubmitTime && (
        <div className="w-full max-w-md glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Cargar mi tiempo</h2>
          </div>

          {participant?.status === "rejected" && participant?.rejection_reason && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
              Tu resultado anterior fue rechazado: "{participant.rejection_reason}". Podés cargar uno nuevo.
            </div>
          )}

          {!showTimeForm ? (
            <Button variant="gold" className="w-full h-12" onClick={() => setShowTimeForm(true)}>
              <Clock className="w-4 h-4 mr-2" />
              Cargar mi tiempo
            </Button>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Tiempo (hh:mm:ss)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    placeholder="HH"
                    value={timeForm.hours}
                    onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="MM"
                    value={timeForm.minutes}
                    onChange={(e) => setTimeForm({ ...timeForm, minutes: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="SS"
                    value={timeForm.seconds}
                    onChange={(e) => setTimeForm({ ...timeForm, seconds: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Comentario (opcional)</Label>
                <Textarea
                  placeholder="Alguna observación sobre tu resultado..."
                  value={timeForm.comment}
                  onChange={(e) => setTimeForm({ ...timeForm, comment: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="gold"
                  className="flex-1"
                  onClick={handleSubmitTime}
                  disabled={submitting}
                >
                  {submitting ? "Enviando..." : "Enviar resultado"}
                </Button>
                <Button variant="outline" onClick={() => setShowTimeForm(false)}>
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
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Tu tiempo <span className="font-semibold text-foreground">{participant.time_result}</span> fue enviado y está pendiente de revisión por el coach.
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
              <p><span className="text-muted-foreground">Tiempo:</span> <span className="font-semibold text-primary text-lg">{participant.time_result}</span></p>
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
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{r.first_name} {r.last_name}</p>
                    <p className="text-xs text-muted-foreground">{r.team_name}</p>
                  </div>
                </div>
                <span className="font-mono font-semibold">
                  {r.time_result ?? "-"}
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
