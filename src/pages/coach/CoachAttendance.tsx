import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;
type Alumno = Tables<"alumnos">;

interface AttendanceEntry {
  alumnoId: string;
  nombre: string;
  estado: "asistio" | "ausente" | "justificado";
}

const CoachAttendance = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [selectedEntrenamiento, setSelectedEntrenamiento] = useState<string>("");
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/coach"); return; }

      const { data: coach } = await supabase
        .from("coaches")
        .select("*")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) { navigate("/coach"); return; }

      const coachGrupos = (coach as any).grupos || [];
      setGrupos(coachGrupos);

      // Load recent trainings for coach's groups
      const today = new Date().toISOString().split("T")[0];
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const fromDate = twoWeeksAgo.toISOString().split("T")[0];

      if (coachGrupos.length > 0) {
        const { data: trainings } = await supabase
          .from("entrenamientos")
          .select("*")
          .in("grupo", coachGrupos as any)
          .gte("fecha", fromDate)
          .lte("fecha", today)
          .eq("visible", true)
          .order("fecha", { ascending: false });

        setEntrenamientos(trainings || []);

        const entrenamientoId = searchParams.get("entrenamiento");
        if (entrenamientoId && trainings?.find(t => t.id === entrenamientoId)) {
          setSelectedEntrenamiento(entrenamientoId);
        }
      }

      setLoading(false);
    };
    init();
  }, [navigate, searchParams]);

  // Load students when training is selected
  useEffect(() => {
    if (!selectedEntrenamiento) { setEntries([]); return; }

    const loadStudents = async () => {
      const training = entrenamientos.find(e => e.id === selectedEntrenamiento);
      if (!training) return;

      const { data: alumnos } = await supabase
        .from("alumnos")
        .select("id, nombre")
        .eq("grupo", training.grupo)
        .eq("estado", "activo")
        .order("nombre");

      if (!alumnos) return;

      // Check existing attendance
      const { data: existing } = await supabase
        .from("asistencias")
        .select("alumno_id, estado")
        .eq("entrenamiento_id", selectedEntrenamiento);

      const mapped: AttendanceEntry[] = alumnos.map(a => {
        const prev = existing?.find(e => e.alumno_id === a.id);
        return {
          alumnoId: a.id,
          nombre: a.nombre,
          estado: (prev?.estado as any) || "ausente",
        };
      });
      setEntries(mapped);
    };
    loadStudents();
  }, [selectedEntrenamiento, entrenamientos]);

  const toggleEstado = (alumnoId: string) => {
    setEntries(prev => prev.map(e => {
      if (e.alumnoId !== alumnoId) return e;
      const next = e.estado === "ausente" ? "asistio" : e.estado === "asistio" ? "justificado" : "ausente";
      return { ...e, estado: next };
    }));
  };

  const handleSave = async () => {
    if (!selectedEntrenamiento || entries.length === 0) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();

    const upserts = entries.map(e => ({
      alumno_id: e.alumnoId,
      entrenamiento_id: selectedEntrenamiento,
      estado: e.estado,
      registrado_por: session?.user.id || null,
    }));

    const { error } = await supabase
      .from("asistencias")
      .upsert(upserts, { onConflict: "alumno_id,entrenamiento_id" });

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "No se pudo guardar la asistencia.", variant: "destructive" });
    } else {
      toast({ title: "✅ Asistencia guardada", description: `${entries.filter(e => e.estado === "asistio").length} presentes registrados.` });
    }
  };

  const selectedTraining = entrenamientos.find(e => e.id === selectedEntrenamiento);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
          <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
            Asistencia
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Training selector */}
        <div className="space-y-2">
          <label className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Seleccionar entrenamiento
          </label>
          <select
            value={selectedEntrenamiento}
            onChange={(e) => setSelectedEntrenamiento(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">-- Elegí un entrenamiento --</option>
            {entrenamientos.map(t => (
              <option key={t.id} value={t.id}>
                {new Date(t.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – {t.titulo || t.grupo} ({t.grupo})
              </option>
            ))}
          </select>
        </div>

        {/* Attendance list */}
        {selectedEntrenamiento && entries.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground">
              {selectedTraining && (
                <span className="capitalize">
                  {new Date(selectedTraining.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                  {" · "}{selectedTraining.grupo}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20">
              {entries.map((entry, idx) => (
                <button
                  key={entry.alumnoId}
                  onClick={() => toggleEstado(entry.alumnoId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30 ${
                    idx < entries.length - 1 ? "border-b border-border/50" : ""
                  }`}
                >
                  {entry.estado === "asistio" && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                  {entry.estado === "ausente" && <XCircle className="w-5 h-5 text-destructive shrink-0" />}
                  {entry.estado === "justificado" && <Clock className="w-5 h-5 text-yellow-500 shrink-0" />}
                  <span className="flex-1 text-sm text-foreground">{entry.nombre}</span>
                  <span className={`text-xs font-medium ${
                    entry.estado === "asistio" ? "text-emerald-500" :
                    entry.estado === "justificado" ? "text-yellow-500" : "text-destructive"
                  }`}>
                    {entry.estado === "asistio" ? "Asistió" : entry.estado === "justificado" ? "Justificado" : "Ausente"}
                  </span>
                </button>
              ))}
            </div>

            <Button variant="gold" className="w-full" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Guardando..." : "Guardar asistencia"}
            </Button>
          </>
        )}

        {selectedEntrenamiento && entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay alumnos activos en este grupo.
          </p>
        )}
      </main>
    </div>
  );
};

export default CoachAttendance;
