import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User, ChevronRight, PauseCircle, Trophy, Mail, RefreshCw, ShoppingCart } from "lucide-react";
import { EventosContent } from "@/pages/Eventos";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface VacationDashboardProps {
  alumno: Alumno;
  onLogout: () => void;
}

type VacTab = "inicio" | "eventos" | "perfil";

const VacNavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
    {icon}
    <span className="text-[10px] font-heading font-medium">{label}</span>
  </button>
);

const VacationDashboard = ({ alumno, onLogout }: VacationDashboardProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<VacTab>("inicio");
  const firstName = alumno.nombre?.split(" ")[0] || "";

  const renderContent = () => {
    switch (activeTab) {
      case "eventos":
        return <EventosContent />;
      case "perfil":
        return (
          <div className="w-full max-w-md space-y-6 animate-fade-in pt-4">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted">
                <User className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-heading font-semibold text-foreground">{alumno.nombre}</h2>
                <p className="text-sm text-muted-foreground">{alumno.email}</p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                  ⏸️ En pausa
                </span>
                {alumno.grupo !== "Sin grupo" && (
                  <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                    Pelotón {alumno.grupo}
                  </span>
                )}
              </div>
            </div>

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
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">Pagos y suscripción</p>
                    <p className="text-xs text-muted-foreground">Ver estado de tu plan</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={onLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        );
      default: // "inicio"
        return (
          <div className="w-full max-w-md space-y-5 animate-fade-in">
            {/* Greeting */}
            <div className="text-center space-y-1 pt-2">
              <h1 className="text-xl font-heading font-semibold text-foreground">
                Hola, <span className="gold-text-gradient">{firstName}</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Tu membresía está en pausa
              </p>
            </div>

            {/* Membership paused banner */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <PauseCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-heading font-semibold text-foreground text-sm">Tu plan está en pausa</h2>
                  <p className="text-xs text-muted-foreground">
                    Seguís en la comunidad. Cuando estés listo, reactivás tu plan y volvés a entrenar.
                  </p>
                </div>
              </div>
              <Button
                variant="gold"
                className="w-full"
                onClick={() => {
                  localStorage.setItem("registro_alumno_id", alumno.id);
                  localStorage.setItem("alumno_renewal", "1");
                  localStorage.setItem("alumno_from_vacation", "1");
                  navigate("/planes");
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reactivar mi plan
              </Button>
            </div>

            {/* Contact admin */}
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4">
              <button
                onClick={() => window.open("mailto:info@ciclismoreybaud.com", "_blank")}
                className="w-full flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground text-sm">¿Querés volver?</p>
                  <p className="text-xs text-muted-foreground">Contactá administración para reactivar tu cuenta</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Quick links to events/store */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setActiveTab("eventos")}
                className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 text-center space-y-2 hover:bg-accent/50 transition-colors"
              >
                <Trophy className="w-6 h-6 text-primary mx-auto" />
                <p className="text-sm font-heading font-medium text-foreground">Eventos</p>
                <p className="text-[10px] text-muted-foreground">Viajes, camps y más</p>
              </button>
              <button
                onClick={() => navigate("/alumno", { state: { tab: "tienda" } })}
                className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 text-center space-y-2 hover:bg-accent/50 transition-colors"
              >
                <ShoppingCart className="w-6 h-6 text-primary mx-auto" />
                <p className="text-sm font-heading font-medium text-foreground">Tienda</p>
                <p className="text-[10px] text-muted-foreground">Productos y ofertas</p>
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <img src={logo} alt="Ciclismo Reybaud" className="w-9 h-9" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 font-heading">🏖️ Vacaciones</span>
          <Button variant="ghost" size="icon" onClick={onLogout} className="text-muted-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-24">
        {renderContent()}
      </main>

      {/* Simplified bottom nav */}
      <nav className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md z-30">
        <div className="max-w-md mx-auto flex items-center justify-around py-2">
          <VacNavItem
            icon={<Palmtree className="w-5 h-5" />}
            label="Inicio"
            active={activeTab === "inicio"}
            onClick={() => setActiveTab("inicio")}
          />
          <VacNavItem
            icon={<Trophy className="w-5 h-5" />}
            label="Eventos"
            active={activeTab === "eventos"}
            onClick={() => setActiveTab("eventos")}
          />
          <VacNavItem
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

export default VacationDashboard;
