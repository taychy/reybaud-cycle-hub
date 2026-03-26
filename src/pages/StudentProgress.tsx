import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import logo from "@/assets/logo.png";
import { MonthlyProgressCard } from "@/components/progress/MonthlyProgressCard";
import { useMonthlyProgress } from "@/hooks/useMonthlyProgress";

interface FeedbackRecord {
  id: string;
  fecha: string;
  comentario: string;
  tipo: string;
  coach: { nombre: string } | null;
}

interface SessionRecord {
  id: string;
  estado: string;
  fecha: string;
  titulo: string;
  tipo: string | null;
  source: "registro" | "asistencia";
}

const tipoLabel = (tipo: string) => {
  switch (tipo) {
    case "tecnica": return "Técnica";
    case "rendimiento": return "Rendimiento";
    case "actitud": return "Actitud";
    case "recomendacion": return "Recomendación";
    default: return "General";
  }
};

export const StudentProgressContent = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);

  const progress = useMonthlyProgress(alumnoId, grupo);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate("/"); return; }

      let alumno = (await supabase
        .from("alumnos")
        .select("id, grupo")
        .eq("user_id", session.user.id)
        .maybeSingle()).data;

      if (!alumno) {
        alumno = (await supabase
          .from("alumnos")
          .select("id, grupo")
          .eq("email", session.user.email?.toLowerCase().trim() || "")
          .maybeSingle()).data;
      }

      if (!alumno) { navigate("/"); return; }

      setAlumnoId(alumno.id);
      setGrupo(alumno.grupo);
      await loadDetails(alumno.id, alumno.grupo);
      setLoading(false);
    };

    const loadDetails = async (aId: string, grp: string) => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fromDate = firstDay.toISOString().split("T")[0];
      const toDate = lastDay.toISOString().split("T")[0];

      // Session history: merge registro_sesiones + asistencias
      const { data: entrenamientos } = await supabase
        .from("entrenamientos")
        .select("id, fecha, titulo, tipo")
        .eq("grupo", grp as any)
        .eq("visible", true)
        .gte("fecha", fromDate)
        .lte("fecha", toDate)
        .order("fecha", { ascending: false });

      const entIds = (entrenamientos || []).map(e => e.id);

      const { data: registros } = await supabase
        .from("registro_sesiones")
        .select("id, entrenamiento_id, estado")
        .eq("alumno_id", aId)
        .in("entrenamiento_id", entIds.length > 0 ? entIds : ["__none__"]);

      const { data: asistencias } = await supabase
        .from("asistencias")
        .select("id, entrenamiento_id, estado")
        .eq("alumno_id", aId)
        .in("entrenamiento_id", entIds.length > 0 ? entIds : ["__none__"]);

      const regMap = new Map((registros || []).map(r => [r.entrenamiento_id, r]));
      const asistMap = new Map((asistencias || []).map(a => [a.entrenamiento_id, a]));

      const merged: SessionRecord[] = [];
      for (const ent of (entrenamientos || [])) {
        const reg = regMap.get(ent.id);
        const asist = asistMap.get(ent.id);

        if (reg) {
          merged.push({
            id: reg.id,
            estado: reg.estado,
            fecha: ent.fecha,
            titulo: ent.titulo,
            tipo: ent.tipo,
            source: "registro",
          });
        } else if (asist && asist.estado === "asistio") {
          merged.push({
            id: asist.id,
            estado: "realizada",
            fecha: ent.fecha,
            titulo: ent.titulo,
            tipo: ent.tipo,
            source: "asistencia",
          });
        }
      }
      setSessions(merged);

      // Feedback
      const { data: feedbackData } = await supabase
        .from("feedback_coach")
        .select("id, fecha, comentario, tipo, coach_id")
        .eq("alumno_id", aId)
        .order("fecha", { ascending: false })
        .limit(20);

      if (feedbackData && feedbackData.length > 0) {
        const coachIds = [...new Set(feedbackData.map(f => f.coach_id))];
        const { data: coaches } = await supabase
          .from("coaches")
          .select("id, nombre")
          .in("id", coachIds);

        setFeedback(feedbackData.map(f => ({
          id: f.id,
          fecha: f.fecha,
          comentario: f.comentario,
          tipo: f.tipo || "general",
          coach: coaches?.find(c => c.id === f.coach_id)
            ? { nombre: coaches.find(c => c.id === f.coach_id)!.nombre }
            : null,
        })));
      }
    };

    load();
  }, [navigate]);

  if (loading || progress.loading) {
    return <div className="animate-pulse text-muted-foreground text-center py-8">Cargando...</div>;
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6 animate-fade-in pt-2">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-heading font-semibold text-foreground">Mi Progreso</h1>
        <p className="text-xs text-muted-foreground">Rendimiento y sesiones del mes</p>
      </div>

      {/* Monthly Progress */}
      <MonthlyProgressCard data={progress} />

      {/* Session History */}
      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
        <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
          Historial de sesiones
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Todavía no registraste sesiones</p>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 15).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                {s.estado === "realizada"
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{s.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                    {s.tipo ? ` · ${s.tipo}` : ""}
                    {s.source === "asistencia" ? " · Presencial" : " · Plan"}
                  </p>
                </div>
                <span className={`text-xs font-medium ${s.estado === "realizada" ? "text-emerald-500" : "text-destructive"}`}>
                  {s.estado === "realizada" ? "Realizada" : "No realizada"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Coach Feedback */}
      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
        <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Feedback del entrenador
        </h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Todavía no tenés feedback de tu entrenador</p>
        ) : (
          <div className="space-y-4">
            {feedback.map((f) => (
              <div key={f.id} className="border-l-2 border-primary/50 pl-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{f.coach?.nombre || "Entrenador"}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tipoLabel(f.tipo)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-sm text-foreground/90 italic">"{f.comentario}"</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StudentProgress = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 pt-5 pb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/alumno")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
        <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Mi Progreso</h1>
      </header>
      <main className="px-4 pb-8">
        <StudentProgressContent />
      </main>
    </div>
  );
};

export default StudentProgress;
