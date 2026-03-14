import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar, ExternalLink, Download, X, CheckCircle2, Home, Trophy, CreditCard, User, ChevronRight, TrendingUp } from "lucide-react";
import TrainingDetailView from "@/components/TrainingDetailView";
import WeatherBar from "@/components/WeatherBar";
import PaymentStatusCard from "@/components/PaymentStatusCard";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;
type Entrenamiento = Tables<"entrenamientos">;

interface PendingPaymentInfo {
  estado: string;
  planName: string;
  precio: number;
  fechaPago: string;
  medioPago: string;
}

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
  const [weekTrainings, setWeekTrainings] = useState<(Entrenamiento | null)[]>([null, null, null, null, null, null, null]);
  const [loading, setLoading] = useState(true);
  const [realizado, setRealizado] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"hoy" | "eventos" | "pagos" | "perfil">("hoy");
  const { toast } = useToast();
  const [showInstallBanner, setShowInstallBanner] = useState(
    () => localStorage.getItem("hide_install_banner") !== "1"
  );
  
  // Day index: 0=Mon, 6=Sun
  const todayDayIndex = (() => {
    const d = new Date().getDay(); // 0=Sun
    return d === 0 ? 6 : d - 1;
  })();
  const [selectedDay, setSelectedDay] = useState(todayDayIndex);

  // Load alumno from Supabase Auth session
  useEffect(() => {
    const loadAlumno = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        navigate("/");
        return;
      }

      const { data: alumnoData } = await supabase
        .from("alumnos")
        .select("*")
        .eq("email", session.user.email.toLowerCase().trim())
        .maybeSingle();

      if (!alumnoData) {
        navigate("/");
        return;
      }

      setAlumno(alumnoData);

      // Check for pending/recent payment
      const { data: recentSubs } = await supabase
        .from("suscripciones")
        .select("estado, created_at, plan_id, planes(nombre, precio)")
        .eq("alumno_id", alumnoData.id)
        .in("estado", ["pendiente_verificacion", "rechazada"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (recentSubs && recentSubs.length > 0) {
        const sub = recentSubs[0] as any;
        setPendingPayment({
          estado: sub.estado,
          planName: sub.planes?.nombre || "Plan",
          precio: sub.planes?.precio || 0,
          fechaPago: sub.created_at,
          medioPago: "pendiente_verificacion",
        });
      }

      // Get Monday of current week
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }

      const { data: trainings, error } = await supabase
        .from("entrenamientos")
        .select("*")
        .in("fecha", weekDates)
        .eq("grupo", alumnoData.grupo)
        .eq("visible", true)
        .order("fecha", { ascending: true });

      if (error) {
        setLoading(false);
        return;
      }

      const mapped: (Entrenamiento | null)[] = weekDates.map(
        (date) => trainings?.find((e) => e.fecha === date) ?? null
      );
      setWeekTrainings(mapped);

      const todayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const todayTraining = mapped[todayIdx] ?? null;
      setEntrenamiento(todayTraining);
      setLoading(false);

      if (todayTraining) {
        const { data: done } = await supabase
          .from("entrenamientos_realizados")
          .select("id")
          .eq("alumno_id", alumnoData.id)
          .eq("entrenamiento_id", todayTraining.id)
          .maybeSingle();
        if (done) setRealizado(true);
      }
    };

    loadAlumno();
  }, [navigate]);

  // When user selects a different day
  useEffect(() => {
    const training = weekTrainings[selectedDay] ?? null;
    setEntrenamiento(training);
    setRealizado(false);
    if (training && alumno) {
      supabase
        .from("entrenamientos_realizados")
        .select("id")
        .eq("alumno_id", alumno.id)
        .eq("entrenamiento_id", training.id)
        .maybeSingle()
        .then(({ data: done }) => {
          if (done) setRealizado(true);
        });
    }
  }, [selectedDay, weekTrainings, alumno]);

  const handleLogout = async () => {
    localStorage.removeItem("alumno");
    await supabase.auth.signOut();
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

  const renderContent = () => {
    switch (activeTab) {
      case "eventos":
        navigate("/eventos");
        return null;
      case "pagos":
        navigate("/alumno/pagos");
        return null;
      case "perfil":
        return (
          <div className="w-full max-w-md space-y-6 animate-fade-in pt-4">
            {/* Profile header */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted">
                <User className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-heading font-semibold text-foreground">{alumno?.nombre}</h2>
                <p className="text-sm text-muted-foreground">{alumno?.email}</p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  Pelotón {alumno?.grupo}
                </span>
              </div>
            </div>

            {/* Cuenta section */}
            <div className="space-y-3">
              <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Cuenta
              </h3>
              <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
                <button
                  onClick={() => navigate("/alumno/pagos")}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">Pagos y suscripción</p>
                    <p className="text-xs text-muted-foreground">Ver estado de tu plan y tus pagos</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Logout */}
            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        );
      default: // "hoy"
        return (
          <div className="w-full max-w-md space-y-5 animate-fade-in">
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

            {/* Weather */}
            <WeatherBar />

            {/* Payment status */}
            {pendingPayment && (
              <PaymentStatusCard
                estado={pendingPayment.estado}
                planName={pendingPayment.planName}
                precio={pendingPayment.precio}
                fechaPago={pendingPayment.fechaPago}
                medioPago={pendingPayment.medioPago}
              />
            )}

            {/* Training detail view */}
            {entrenamiento ? (
              <>
                <TrainingDetailView
                  entrenamiento={entrenamiento}
                  alumnoName={firstName}
                  selectedDayIndex={selectedDay}
                  onDayChange={setSelectedDay}
                />

                {/* Actions */}
                <div className="space-y-2">
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

                {/* Training metrics */}
                {entrenamiento.resistencia + entrenamiento.tecnica + entrenamiento.intensidad > 0 && (
                  <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
                    <MetricBar label="Resistencia" value={entrenamiento.resistencia ?? 0} />
                    <MetricBar label="Técnica" value={entrenamiento.tecnica ?? 0} />
                    <MetricBar label="Intensidad" value={entrenamiento.intensidad ?? 0} />
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Day header + selector even when no training */}
                <TrainingDetailView
                  entrenamiento={{ id: "", fecha: (() => {
                    const now = new Date();
                    const dow = now.getDay();
                    const monday = new Date(now);
                    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + selectedDay);
                    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
                  })(), grupo: alumno?.grupo || "G1", titulo: "", descripcion: "", tipo: null, visible: true, created_at: "", updated_at: "", intensidad: 0, resistencia: 0, tecnica: 0, link_archivo: null, origen_importacion_id: null } as Entrenamiento}
                  alumnoName={firstName}
                  selectedDayIndex={selectedDay}
                  onDayChange={setSelectedDay}
                />
                <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-8 text-center space-y-3 shadow-lg shadow-black/20">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                    <Calendar className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    No hay entrenamiento cargado para este día.
                  </p>
                </div>
              </>
            )}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <img src={logo} alt="Ciclismo Reybaud" className="w-9 h-9" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-heading">{firstName}</span>
          {activeTab !== "perfil" && (
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-24">
        {renderContent()}
      </main>

      {/* Bottom navigation */}
      <nav className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-center justify-around py-2">
          <NavItem 
            icon={<Home className="w-5 h-5" />} 
            label="Hoy" 
            active={activeTab === "hoy"} 
            onClick={() => setActiveTab("hoy")} 
          />
          <NavItem 
            icon={<Trophy className="w-5 h-5" />} 
            label="Eventos" 
            active={activeTab === "eventos"} 
            onClick={() => setActiveTab("eventos")} 
          />
          <NavItem 
            icon={<CreditCard className="w-5 h-5" />} 
            label="Pagos" 
            active={activeTab === "pagos"} 
            onClick={() => setActiveTab("pagos")} 
          />
          <NavItem 
            icon={<User className="w-5 h-5" />} 
            label="Perfil" 
            active={activeTab === "perfil"} 
            onClick={() => setActiveTab("perfil")} 
          />
        </div>
      </nav>
    </div>
  );
};

const MetricBar = ({ label, value }: { label: string; value: number }) => {
  const max = 5;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-heading font-semibold text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex gap-1 flex-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`h-4 flex-1 rounded-sm transition-colors ${
              i < value
                ? "bg-gradient-to-b from-primary to-primary/70"
                : "bg-muted/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
    {icon}
    <span className="text-[10px] font-heading font-medium">{label}</span>
  </button>
);

export default StudentDashboard;
