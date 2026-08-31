import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Users, ClipboardList, CheckSquare, MessageSquare, ListTodo,
  Banknote, Plane, ClipboardCheck, Trophy, CalendarClock, ChevronRight,
} from "lucide-react";
import logo from "@/assets/logo.png";
import MisClasesHoy from "@/components/coach/MisClasesHoy";
import ProximaClaseCard from "@/components/coach/ProximaClaseCard";
import ProximoTurnoCard from "@/components/coach/ProximoTurnoCard";
import LiquidacionResumenCard from "@/components/coach/LiquidacionResumenCard";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import AusenciasCoachManager from "@/components/AusenciasCoachManager";
import SwitchPortalButton from "@/components/SwitchPortalButton";
import { useCoachHome } from "@/hooks/useCoachHome";

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [showAusencias, setShowAusencias] = useState(false);

  const { loading, coachId, proximaClase, proximoTurno, resumen, tareasPendientes, reload } = useCoachHome();

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: coach } = await supabase
        .from("coaches").select("*").eq("user_id", session.user.id).maybeSingle();
      if (!coach) return;
      setCoachName((coach as any).nombre);
      setGrupos((coach as any).grupos || []);
      if (!(coach as any).password_set) {
        await supabase.from("coaches").update({ password_set: true } as any).eq("id", (coach as any).id);
      }
    };
    init();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const initial = (coachName || "?").trim().charAt(0).toUpperCase();

  const accesos = [
    { icon: Users, label: "Mis alumnos", to: "/coach/alumnos" },
    { icon: ClipboardList, label: "Plan del grupo", to: "/coach/entrenamientos" },
    { icon: CheckSquare, label: "Registrar asistencia", to: "/coach/asistencia" },
    { icon: MessageSquare, label: "Dar feedback", to: "/coach/feedback" },
    { icon: ClipboardCheck, label: "Chequeo de alumnos", to: "/coach/chequeo-alumnos" },
    { icon: ClipboardList, label: "Asesoría personalizada", to: "/coach/asesoria" },
    { icon: CalendarClock, label: "Mis horarios y sedes", to: "/coach/agenda" },
    { icon: Banknote, label: "Mis liquidaciones", to: "/coach/liquidaciones" },
    { icon: Trophy, label: "Récord de la Hora", to: "/coach/eventos/record-de-la-hora" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Panel Coach</h1>
          </div>
          <div className="flex items-center gap-1">
            <SwitchPortalButton size="sm" />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4 pb-10">
        {/* Saludo */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center font-heading font-semibold text-lg flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-heading font-semibold text-foreground truncate">Hola, {coachName}</p>
              <p className="text-[13px] text-muted-foreground">Este es tu panel de trabajo</p>
            </div>
          </div>
          {grupos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {grupos.map((g) => (
                <span key={g} className="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary/60 border border-border/50 text-muted-foreground font-mono">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Hoy */}
        <MisClasesHoy />

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando tu agenda…</p>
        ) : (
          <>
            <ProximaClaseCard clase={proximaClase} onChanged={reload} />
            <ProximoTurnoCard turno={proximoTurno} />
            <LiquidacionResumenCard resumen={resumen} />
          </>
        )}

        {/* Tareas */}
        <button
          onClick={() => navigate("/coach/tareas")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 transition text-left"
        >
          <ListTodo className="w-4 h-4 text-primary" />
          <span className="text-sm text-foreground flex-1">Mis tareas</span>
          {tareasPendientes > 0 && (
            <Badge className="bg-primary/20 text-primary border-primary/40 hover:bg-primary/30">{tareasPendientes}</Badge>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Accesos — una sola columna */}
        <div>
          <p className="text-[12px] text-muted-foreground mb-2 px-1">Accesos</p>
          <div className="flex flex-col gap-2">
            {accesos.map(({ icon: Icon, label, to }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 hover:border-primary/40 transition text-left"
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground flex-1">{label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
            <button
              onClick={() => setShowAusencias(true)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 transition text-left"
            >
              <Plane className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground flex-1">Mis ausencias / vacaciones</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </main>

      <Dialog open={showAusencias} onOpenChange={setShowAusencias}>
        <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          {coachId && <AusenciasCoachManager coachId={coachId} coachNombre={coachName} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoachDashboard;
