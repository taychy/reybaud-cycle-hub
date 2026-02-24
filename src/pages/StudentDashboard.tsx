import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar, MapPin, Dumbbell, Monitor, Wrench, ExternalLink } from "lucide-react";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;
type Entrenamiento = Tables<"entrenamientos">;

const tipoIcons: Record<string, React.ReactNode> = {
  ruta: <MapPin className="w-5 h-5" />,
  rodillo: <Monitor className="w-5 h-5" />,
  gimnasio: <Dumbbell className="w-5 h-5" />,
  tecnica: <Wrench className="w-5 h-5" />,
};

const tipoLabels: Record<string, string> = {
  ruta: "Ruta",
  rodillo: "Rodillo",
  gimnasio: "Gimnasio",
  tecnica: "Técnica",
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [entrenamiento, setEntrenamiento] = useState<Entrenamiento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("alumno");
    if (!stored) {
      navigate("/");
      return;
    }

    const alumnoData = JSON.parse(stored) as Alumno;
    setAlumno(alumnoData);

    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("entrenamientos")
      .select("*")
      .eq("fecha", today)
      .eq("grupo", alumnoData.grupo)
      .eq("visible", true)
      .maybeSingle()
      .then(({ data }) => {
        setEntrenamiento(data);
        setLoading(false);
      });
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("alumno");
    navigate("/");
  };

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
      <header className="border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
              <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground">
                Ciclismo Reybaud
              </h1>
              <p className="text-xs text-muted-foreground">
                {alumno?.nombre} · {alumno?.grupo}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-6 animate-fade-in">
          {/* Date */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">
              {new Date().toLocaleDateString("es-AR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>

          {entrenamiento ? (
            <div className="glass-card rounded-lg p-6 space-y-4 card-glow">
              {/* Type badge */}
              {entrenamiento.tipo && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium uppercase tracking-wider">
                  {tipoIcons[entrenamiento.tipo]}
                  {tipoLabels[entrenamiento.tipo]}
                </div>
              )}

              <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
                {entrenamiento.titulo}
              </h2>

              {entrenamiento.descripcion && (
                <p className="text-secondary-foreground leading-relaxed whitespace-pre-wrap">
                  {entrenamiento.descripcion}
                </p>
              )}

              {entrenamiento.link_archivo && (
                <a
                  href={entrenamiento.link_archivo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:text-gold-light transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver archivo adjunto
                </a>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-lg p-8 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Hoy no hay entrenamiento cargado para tu grupo.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
