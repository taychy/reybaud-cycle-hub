import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar, MapPin, Dumbbell, Monitor, Wrench, ExternalLink, Download, X } from "lucide-react";
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

const parseTrainingSections = (text: string) => {
  const result: { entradaEnCalor?: string; trabajoPrincipal?: string; vueltaALaCalma?: string; descripcionExtra?: string } = {};
  
  const patterns = [
    { key: "entradaEnCalor" as const, regex: /(?:entrada\s*en\s*calor|calentamiento|warm\s*up)[:\-\s]*/i },
    { key: "trabajoPrincipal" as const, regex: /(?:trabajo\s*principal|parte\s*principal|main\s*set)[:\-\s]*/i },
    { key: "vueltaALaCalma" as const, regex: /(?:vuelta\s*a\s*la\s*calma|enfriamiento|cool\s*down)[:\-\s]*/i },
  ];

  const positions: { key: keyof typeof result; start: number; headerEnd: number }[] = [];

  for (const p of patterns) {
    const match = p.regex.exec(text);
    if (match) {
      positions.push({ key: p.key, start: match.index, headerEnd: match.index + match[0].length });
    }
  }

  if (positions.length === 0) return result;

  positions.sort((a, b) => a.start - b.start);

  for (let i = 0; i < positions.length; i++) {
    const end = i < positions.length - 1 ? positions[i + 1].start : text.length;
    result[positions[i].key] = text.slice(positions[i].headerEnd, end).trim();
  }

  // Any text before the first section marker
  const beforeFirst = text.slice(0, positions[0].start).trim();
  if (beforeFirst) result.descripcionExtra = beforeFirst;

  return result;
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [entrenamiento, setEntrenamiento] = useState<Entrenamiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstallBanner, setShowInstallBanner] = useState(
    () => localStorage.getItem("hide_install_banner") !== "1"
  );

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
      {/* Install banner */}
          {showInstallBanner && !window.matchMedia("(display-mode: standalone)").matches && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              <Download className="w-5 h-5 shrink-0" />
              <a href="/instalar" className="font-medium flex-1 hover:underline">
                Instalá la app en tu teléfono para acceder más rápido
              </a>
              <button
                onClick={() => {
                  setShowInstallBanner(false);
                  localStorage.setItem("hide_install_banner", "1");
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
            <div className="glass-card rounded-lg overflow-hidden card-glow">
              {/* Header */}
              <div className="p-5 pb-4 space-y-2">
                {entrenamiento.tipo && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium uppercase tracking-wider">
                    {tipoIcons[entrenamiento.tipo]}
                    {tipoLabels[entrenamiento.tipo]}
                  </div>
                )}
                <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
                  {entrenamiento.titulo}
                </h2>
              </div>

              {/* Sections */}
              {(() => {
                const sections = parseTrainingSections(entrenamiento.descripcion || "");
                return (
                  <div className="divide-y divide-border">
                    {sections.entradaEnCalor && (
                      <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                          <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-accent">
                            Entrada en calor
                          </h3>
                        </div>
                        <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">
                          {sections.entradaEnCalor}
                        </p>
                      </div>
                    )}

                    {sections.trabajoPrincipal && (
                      <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-primary">
                            Trabajo principal
                          </h3>
                        </div>
                        <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">
                          {sections.trabajoPrincipal}
                        </p>
                      </div>
                    )}

                    {sections.vueltaALaCalma && (
                      <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                          <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                            Vuelta a la calma
                          </h3>
                        </div>
                        <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">
                          {sections.vueltaALaCalma}
                        </p>
                      </div>
                    )}

                    {sections.descripcionExtra && (
                      <div className="px-5 py-4">
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {sections.descripcionExtra}
                        </p>
                      </div>
                    )}

                    {!sections.entradaEnCalor && !sections.trabajoPrincipal && !sections.vueltaALaCalma && entrenamiento.descripcion && (
                      <div className="px-5 py-4">
                        <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">
                          {entrenamiento.descripcion}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {entrenamiento.link_archivo && (
                <div className="px-5 py-4 border-t border-border">
                  <a
                    href={entrenamiento.link_archivo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-gold-light transition-colors text-sm font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver archivo adjunto
                  </a>
                </div>
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
