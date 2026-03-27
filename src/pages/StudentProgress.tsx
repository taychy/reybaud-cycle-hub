import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";
import { MonthlyProgressCard } from "@/components/progress/MonthlyProgressCard";
import { UnregisteredSessions } from "@/components/progress/UnregisteredSessions";
import { ExtraSessionForm } from "@/components/progress/ExtraSessionForm";
import { MainGoalCard } from "@/components/progress/MainGoalCard";
import { SessionHistory, type SessionRecord } from "@/components/progress/SessionHistory";
import { CoachFeedbackCard, type FeedbackRecord } from "@/components/progress/CoachFeedbackCard";
import { useMonthlyProgress } from "@/hooks/useMonthlyProgress";

export const StudentProgressContent = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const progress = useMonthlyProgress(alumnoId, grupo, refreshKey);
  const handleProgressUpdate = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const resolveAlumno = async (userId: string, userEmail: string) => {
      let alumno = (await supabase
        .from("alumnos")
        .select("id, grupo")
        .eq("user_id", userId)
        .maybeSingle()).data;

      if (!alumno) {
        alumno = (await supabase
          .from("alumnos")
          .select("id, grupo")
          .eq("email", userEmail)
          .maybeSingle()).data;
      }

      if (cancelled) return;

      if (!alumno) { navigate("/"); return; }

      setAlumnoId(alumno.id);
      setGrupo(alumno.grupo);
      await loadDetails(alumno.id, alumno.grupo);
      if (!cancelled) setLoading(false);
    };

    const loadDetails = async (aId: string, grp: string) => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fromDate = firstDay.toISOString().split("T")[0];
      const toDate = lastDay.toISOString().split("T")[0];

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
          merged.push({ id: reg.id, estado: reg.estado, fecha: ent.fecha, titulo: ent.titulo, tipo: ent.tipo, source: "registro" });
        } else if (asist && asist.estado === "asistio") {
          merged.push({ id: asist.id, estado: "realizada", fecha: ent.fecha, titulo: ent.titulo, tipo: ent.tipo, source: "asistencia" });
        }
      }
      // Fetch sesiones extra del mes
      const { data: extras } = await supabase
        .from("sesiones_extra")
        .select("id, fecha, tipo, nombre, comentario")
        .eq("alumno_id", aId)
        .gte("fecha", fromDate)
        .lte("fecha", toDate)
        .order("fecha", { ascending: false });

      for (const ex of (extras || [])) {
        merged.push({
          id: ex.id,
          estado: "realizada",
          fecha: ex.fecha,
          titulo: (ex as any).nombre || `Sesión extra`,
          tipo: ex.tipo,
          source: "extra",
        });
      }

      // Sort by date descending
      merged.sort((a, b) => b.fecha.localeCompare(a.fecha));

      if (!cancelled) setSessions(merged);

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

        if (!cancelled) {
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
      }
    };

    // First restore session from storage (waits for token refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        navigate("/");
        return;
      }
      const email = session.user.email?.toLowerCase().trim() || "";
      resolveAlumno(session.user.id, email);
    });

    // Then listen for future auth changes (sign out, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // Already handled by getSession
      if (!session?.user) {
        if (!cancelled) navigate("/");
        return;
      }
      const email = session.user.email?.toLowerCase().trim() || "";
      resolveAlumno(session.user.id, email);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
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

      <MonthlyProgressCard data={progress} />

      {alumnoId && grupo && (
        <UnregisteredSessions alumnoId={alumnoId} grupo={grupo} onUpdate={handleProgressUpdate} />
      )}

      {alumnoId && (
        <ExtraSessionForm alumnoId={alumnoId} onCreated={handleProgressUpdate} />
      )}

      {alumnoId && <MainGoalCard alumnoId={alumnoId} />}

      <SessionHistory sessions={sessions} />

      <CoachFeedbackCard feedback={feedback} />
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
