import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import logo from "@/assets/logo.png";

interface AsistenciaRecord {
  id: string;
  estado: string;
  entrenamiento: {
    fecha: string;
    titulo: string;
  } | null;
}

interface FeedbackRecord {
  id: string;
  fecha: string;
  comentario: string;
  tipo: string;
  coach: {
    nombre: string;
  } | null;
}

const estadoIcon = (estado: string) => {
  switch (estado) {
    case "asistio": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "ausente": return <XCircle className="w-4 h-4 text-destructive" />;
    case "justificado": return <Clock className="w-4 h-4 text-yellow-500" />;
    default: return null;
  }
};

const estadoLabel = (estado: string) => {
  switch (estado) {
    case "asistio": return "Asistió";
    case "ausente": return "Ausente";
    case "justificado": return "Justificado";
    default: return estado;
  }
};

const tipoLabel = (tipo: string) => {
  switch (tipo) {
    case "tecnica": return "Técnica";
    case "rendimiento": return "Rendimiento";
    case "actitud": return "Actitud";
    case "recomendacion": return "Recomendación";
    default: return "General";
  }
};

const StudentProgress = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [asistencias, setAsistencias] = useState<AsistenciaRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [totalProgramados, setTotalProgramados] = useState(0);
  const [totalAsistencias, setTotalAsistencias] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate("/"); return; }

      // Get alumno
      const { data: alumno } = await supabase
        .from("alumnos")
        .select("id, grupo")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!alumno) {
        // Try by email
        const { data: alumnoByEmail } = await supabase
          .from("alumnos")
          .select("id, grupo")
          .eq("email", session.user.email?.toLowerCase().trim() || "")
          .maybeSingle();
        if (!alumnoByEmail) { navigate("/"); return; }
        await loadData(alumnoByEmail.id, alumnoByEmail.grupo);
      } else {
        await loadData(alumno.id, alumno.grupo);
      }
      setLoading(false);
    };

    const loadData = async (alumnoId: string, grupo: string) => {
      // Last 30 days range
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
      const toDate = now.toISOString().split("T")[0];

      // Count programmed trainings in last 30 days
      const { count: programados } = await supabase
        .from("entrenamientos")
        .select("id", { count: "exact", head: true })
        .eq("grupo", grupo as any)
        .eq("visible", true)
        .gte("fecha", fromDate)
        .lte("fecha", toDate);

      setTotalProgramados(programados || 0);

      // Get attendance records
      const { data: asistData } = await supabase
        .from("asistencias")
        .select("id, estado, entrenamiento_id")
        .eq("alumno_id", alumnoId)
        .order("created_at", { ascending: false });

      // Get related trainings for attendance
      if (asistData && asistData.length > 0) {
        const entrenamientoIds = asistData.map(a => a.entrenamiento_id);
        const { data: entrenamientos } = await supabase
          .from("entrenamientos")
          .select("id, fecha, titulo")
          .in("id", entrenamientoIds);

        const mapped: AsistenciaRecord[] = asistData.map(a => ({
          id: a.id,
          estado: a.estado,
          entrenamiento: entrenamientos?.find(e => e.id === a.entrenamiento_id)
            ? { fecha: entrenamientos.find(e => e.id === a.entrenamiento_id)!.fecha, titulo: entrenamientos.find(e => e.id === a.entrenamiento_id)!.titulo }
            : null,
        }));
        setAsistencias(mapped);

        // Count asistencias in last 30 days
        const asistenciasDelMes = mapped.filter(a => {
          if (!a.entrenamiento) return false;
          return a.entrenamiento.fecha >= fromDate && a.entrenamiento.fecha <= toDate && a.estado === "asistio";
        });
        setTotalAsistencias(asistenciasDelMes.length);
      }

      // Get feedback
      const { data: feedbackData } = await supabase
        .from("feedback_coach")
        .select("id, fecha, comentario, tipo, coach_id")
        .eq("alumno_id", alumnoId)
        .order("fecha", { ascending: false })
        .limit(20);

      if (feedbackData && feedbackData.length > 0) {
        const coachIds = [...new Set(feedbackData.map(f => f.coach_id))];
        const { data: coaches } = await supabase
          .from("coaches")
          .select("id, nombre")
          .in("id", coachIds);

        const mappedFeedback: FeedbackRecord[] = feedbackData.map(f => ({
          id: f.id,
          fecha: f.fecha,
          comentario: f.comentario,
          tipo: f.tipo || "general",
          coach: coaches?.find(c => c.id === f.coach_id)
            ? { nombre: coaches.find(c => c.id === f.coach_id)!.nombre }
            : null,
        }));
        setFeedback(mappedFeedback);
      }
    };

    load();
  }, [navigate]);

  const porcentaje = totalProgramados > 0 ? Math.round((totalAsistencias / totalProgramados) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-5 pb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/alumno")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
        <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
          Mi Progreso
        </h1>
      </header>

      <main className="max-w-md mx-auto px-4 pb-8 space-y-6">
        {/* Attendance Summary */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Asistencia último mes
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{totalProgramados} entrenamientos programados</span>
              <span className="text-foreground font-semibold">{totalAsistencias} asistencias</span>
            </div>
            <Progress value={porcentaje} className="h-3" />
            <div className="flex items-center gap-2">
              <span className={`text-lg font-heading font-bold ${porcentaje >= 75 ? "text-emerald-500" : porcentaje >= 50 ? "text-yellow-500" : "text-destructive"}`}>
                {porcentaje}%
              </span>
              <span className="text-xs text-muted-foreground">de asistencia</span>
            </div>
          </div>
        </div>

        {/* Attendance History */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Historial de asistencia
          </h2>
          {asistencias.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay registros de asistencia aún.
            </p>
          ) : (
            <div className="space-y-2">
              {asistencias.slice(0, 15).map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  {estadoIcon(a.estado)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {a.entrenamiento?.titulo || "Entrenamiento"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.entrenamiento?.fecha
                        ? new Date(a.entrenamiento.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })
                        : ""}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${
                    a.estado === "asistio" ? "text-emerald-500" :
                    a.estado === "justificado" ? "text-yellow-500" : "text-destructive"
                  }`}>
                    {estadoLabel(a.estado)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coach Feedback */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Feedback del entrenador
          </h2>
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay feedback registrado aún.
            </p>
          ) : (
            <div className="space-y-4">
              {feedback.map((f) => (
                <div key={f.id} className="border-l-2 border-primary/50 pl-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {f.coach?.nombre || "Entrenador"}
                    </p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {tipoLabel(f.tipo)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-sm text-foreground/90 italic">
                    "{f.comentario}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentProgress;
