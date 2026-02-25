import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar, MapPin, Dumbbell, Monitor, Wrench, ExternalLink, Download, X, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;
type Entrenamiento = Tables<"entrenamientos">;

const tipoIcons: Record<string, React.ReactNode> = {
  ruta: <MapPin className="w-4 h-4" />,
  rodillo: <Monitor className="w-4 h-4" />,
  gimnasio: <Dumbbell className="w-4 h-4" />,
  tecnica: <Wrench className="w-4 h-4" />,
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

  const beforeFirst = text.slice(0, positions[0].start).trim();
  if (beforeFirst) result.descripcionExtra = beforeFirst;

  return result;
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buen día";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [entrenamiento, setEntrenamiento] = useState<Entrenamiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [realizado, setRealizado] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const { toast } = useToast();
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

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    supabase
      .from("entrenamientos")
      .select("*")
      .eq("fecha", today)
      .eq("grupo", alumnoData.grupo)
      .eq("visible", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          setEntrenamiento(null);
          setLoading(false);
          return;
        }

        const entrenamientoDelDia = data?.[0] ?? null;
        setEntrenamiento(entrenamientoDelDia);
        setLoading(false);

        if (entrenamientoDelDia) {
          supabase
            .from("entrenamientos_realizados")
            .select("id")
            .eq("alumno_id", alumnoData.id)
            .eq("entrenamiento_id", entrenamientoDelDia.id)
            .maybeSingle()
            .then(({ data: done }) => {
              if (done) setRealizado(true);
            });
        }
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

  const firstName = alumno?.nombre?.split(" ")[0] || "";
  const todayFormatted = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <img src={logo} alt="Ciclismo Reybaud" className="w-9 h-9" />
        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-8">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          {/* Install banner */}
          {showInstallBanner && !window.matchMedia("(display-mode: standalone)").matches && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              <Download className="w-5 h-5 shrink-0" />
              <a href="/instalar" className="font-medium flex-1 hover:underline">
                Instalá la app en tu teléfono
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

          {/* Greeting */}
          <div className="text-center space-y-1 pt-2">
            <h1 className="text-xl font-heading font-semibold text-foreground">
              {getGreeting()}, <span className="gold-text-gradient">{firstName}</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Pelotón {alumno?.grupo} · <span className="capitalize">{todayFormatted}</span>
            </p>
          </div>

          {/* Training card */}
          {entrenamiento ? (
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20">
              {/* Card header */}
              <div className="px-6 pt-6 pb-4 text-center space-y-3 border-b border-border">
                <h2 className="text-lg font-heading font-bold text-foreground uppercase tracking-wider">
                  Entrenamiento de Hoy
                </h2>
                {entrenamiento.tipo && (
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                    {tipoIcons[entrenamiento.tipo]}
                    {tipoLabels[entrenamiento.tipo]}
                    {entrenamiento.titulo && <span> — {entrenamiento.titulo}</span>}
                  </p>
                )}
              </div>

              {/* Sections */}
              {(() => {
                const sections = parseTrainingSections(entrenamiento.descripcion || "");
                const hasSections = !!(sections.entradaEnCalor || sections.trabajoPrincipal || sections.vueltaALaCalma);

                return (
                  <>
                    {/* Summary view */}
                    {hasSections && !showDetail && (
                      <div className="px-6 py-5 space-y-3">
                        {sections.entradaEnCalor && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                            <div>
                              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-accent">Entrada en calor</span>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sections.entradaEnCalor}</p>
                            </div>
                          </div>
                        )}
                        {sections.trabajoPrincipal && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                            <div>
                              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-primary">Trabajo principal</span>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sections.trabajoPrincipal}</p>
                            </div>
                          </div>
                        )}
                        {sections.vueltaALaCalma && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                            <div>
                              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">Vuelta a la calma</span>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sections.vueltaALaCalma}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Detail view */}
                    {hasSections && showDetail && (
                      <div className="divide-y divide-border">
                        {sections.entradaEnCalor && (
                          <div className="px-6 py-4 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-accent" />
                              <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-accent">Entrada en calor</h3>
                            </div>
                            <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">{sections.entradaEnCalor}</p>
                          </div>
                        )}
                        {sections.trabajoPrincipal && (
                          <div className="px-6 py-4 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-primary">Trabajo principal</h3>
                            </div>
                            <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">{sections.trabajoPrincipal}</p>
                          </div>
                        )}
                        {sections.vueltaALaCalma && (
                          <div className="px-6 py-4 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground">Vuelta a la calma</h3>
                            </div>
                            <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap pl-4">{sections.vueltaALaCalma}</p>
                          </div>
                        )}
                        {sections.descripcionExtra && (
                          <div className="px-6 py-4">
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{sections.descripcionExtra}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fallback if no sections parsed */}
                    {!hasSections && entrenamiento.descripcion && (
                      <div className="px-6 py-5">
                        <p className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">{entrenamiento.descripcion}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="px-6 py-4 border-t border-border space-y-2">
                      {hasSections && (
                        <Button
                          variant="gold-outline"
                          className="w-full"
                          onClick={() => setShowDetail(!showDetail)}
                        >
                          {showDetail ? "Ver resumen" : "Ver Detalle Completo"}
                          {showDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button
                        variant={realizado ? "secondary" : "gold"}
                        className="w-full"
                        disabled={realizado || markingDone}
                        onClick={async () => {
                          if (!alumno || !entrenamiento) return;
                          setMarkingDone(true);
                          const { error } = await supabase.from("entrenamientos_realizados").insert({
                            alumno_id: alumno.id,
                            entrenamiento_id: entrenamiento.id,
                          });
                          setMarkingDone(false);
                          if (error) {
                            toast({ title: "Error", description: "No se pudo registrar. Intentá de nuevo.", variant: "destructive" });
                            return;
                          }
                          setRealizado(true);
                          toast({ title: "¡Bien hecho! 💪", description: "Entrenamiento marcado como realizado." });
                        }}
                      >
                        {realizado ? (
                          <><CheckCircle2 className="w-4 h-4" /> Realizado</>
                        ) : markingDone ? (
                          "Guardando..."
                        ) : (
                          "Marcar como Realizado"
                        )}
                      </Button>
                      {entrenamiento.link_archivo && (
                        <a
                          href={entrenamiento.link_archivo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full rounded-md border border-border px-4 py-2.5 text-sm font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ver archivo adjunto
                        </a>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-8 text-center space-y-3 shadow-lg shadow-black/20">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
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
