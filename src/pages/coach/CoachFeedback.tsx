import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

const TIPOS = [
  { value: "tecnica", label: "Técnica" },
  { value: "rendimiento", label: "Rendimiento" },
  { value: "actitud", label: "Actitud" },
  { value: "recomendacion", label: "Recomendación" },
  { value: "general", label: "General" },
];

const CoachFeedback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [coachId, setCoachId] = useState("");
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [coachesList, setCoachesList] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedAlumno, setSelectedAlumno] = useState("");
  const [coachSecundario, setCoachSecundario] = useState("");
  const [tipo, setTipo] = useState("general");
  const [comentario, setComentario] = useState("");

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

      setCoachId(coach.id);
      const coachGrupos = (coach as any).grupos || [];

      if (coachGrupos.length > 0) {
        const { data: studentData } = await supabase
          .from("alumnos")
          .select("*")
          .in("grupo", coachGrupos as any)
          .eq("estado", "activo")
          .order("nombre");
        setAlumnos(studentData || []);
      }

      // Otros coaches (para asignar co-feedback)
      const { data: otherCoaches } = await supabase
        .from("coaches")
        .select("id, nombre")
        .neq("id", coach.id)
        .order("nombre");
      setCoachesList((otherCoaches || []) as any);

      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleSubmit = async () => {
    if (!selectedAlumno || !comentario.trim()) {
      toast({ title: "Completá los campos", description: "Seleccioná un alumno y escribí un comentario.", variant: "destructive" });
      return;
    }
    setSending(true);

    const { data: inserted, error } = await supabase.from("feedback_coach").insert({
      alumno_id: selectedAlumno,
      coach_id: coachId,
      coach_id_secundario: coachSecundario || null,
      comentario: comentario.trim(),
      tipo,
      fecha: new Date().toISOString().split("T")[0],
      origen: "directo",
    } as any).select("id").single();

    if (error || !inserted) {
      setSending(false);
      toast({ title: "Error", description: "No se pudo enviar el feedback.", variant: "destructive" });
      return;
    }

    // Enviar mail al alumno (siempre)
    try {
      await supabase.functions.invoke("notify-coach-feedback", { body: { feedback_id: (inserted as any).id } });
    } catch (e) {
      console.error("notify-coach-feedback error", e);
    }

    setSending(false);
    toast({ title: "✅ Feedback enviado", description: "El alumno lo recibió por mail y lo verá en su sección de Progreso." });
    setComentario("");
    setSelectedAlumno("");
    setCoachSecundario("");
    setTipo("general");
  };

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
            Feedback
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Alumno selector */}
        <div className="space-y-2">
          <label className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Alumno
          </label>
          <select
            value={selectedAlumno}
            onChange={(e) => setSelectedAlumno(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">-- Seleccionar alumno --</option>
            {alumnos.map(a => (
              <option key={a.id} value={a.id}>{a.nombre} ({a.grupo})</option>
            ))}
          </select>
        </div>

        {/* Coach secundario */}
        <div className="space-y-2">
          <label className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Co-entrenador (opcional)
          </label>
          <select
            value={coachSecundario}
            onChange={(e) => setCoachSecundario(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">-- Ninguno --</option>
            {coachesList.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Si el feedback lo hicieron entre dos, sumá al otro coach.</p>
        </div>

        {/* Tipo */}
        <div className="space-y-2">
          <label className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Tipo de feedback
          </label>
          <div className="flex flex-wrap gap-2">
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tipo === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <label className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Comentario
          </label>
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Escribí tu observación sobre el alumno..."
            rows={4}
          />
        </div>

        <Button variant="gold" className="w-full" onClick={handleSubmit} disabled={sending}>
          <Send className="w-4 h-4 mr-2" />
          {sending ? "Enviando..." : "Enviar feedback"}
        </Button>
      </main>
    </div>
  );
};

export default CoachFeedback;
