import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Users, Calendar, ClipboardList, Trophy, CheckSquare, MessageSquare, Banknote, ListTodo, Plane, ClipboardCheck } from "lucide-react";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";
import MisClasesHoy from "@/components/coach/MisClasesHoy";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import AusenciasCoachManager from "@/components/AusenciasCoachManager";
import SwitchPortalButton from "@/components/SwitchPortalButton";

type Entrenamiento = Tables<"entrenamientos">;

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState("");
  const [coachId, setCoachId] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [proximaClase, setProximaClase] = useState<Entrenamiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAusencias, setShowAusencias] = useState(false);

  useEffect(() => {
    const init = async () => {
      // ProtectedRoute already validates session + role.
      // We only need to fetch coach data here — no redundant auth redirect
      // that could race against token refresh on app reopen.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ProtectedRoute will handle redirect

      const { data: coach } = await supabase
        .from("coaches")
        .select("*")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) return; // ProtectedRoute handles access

      setCoachName((coach as any).nombre);
      setCoachId((coach as any).id);
      const coachGrupos = (coach as any).grupos || [];
      setGrupos(coachGrupos);

      // Mark activation as complete on first login (OTP flow doesn't go through SetPassword)
      if (!(coach as any).password_set) {
        await supabase
          .from("coaches")
          .update({ password_set: true } as any)
          .eq("id", (coach as any).id);
      }

      if (coachGrupos.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const { data: nextClass } = await supabase
          .from("entrenamientos")
          .select("*")
          .in("grupo", coachGrupos as any)
          .gte("fecha", today)
          .order("fecha", { ascending: true })
          .limit(1);
        if (nextClass && nextClass.length > 0) {
          setProximaClase(nextClass[0]);
        }
      }

      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const initial = (coachName || "?").trim().charAt(0).toUpperCase();

  const quickActions = [
    { icon: Users, label: "Ver mis alumnos", onClick: () => navigate("/coach/alumnos") },
    { icon: ClipboardList, label: "Ver plan del grupo", onClick: () => navigate("/coach/entrenamientos") },
    { icon: CheckSquare, label: "Registrar asistencia", onClick: () => navigate("/coach/asistencia") },
    { icon: MessageSquare, label: "Dar feedback", onClick: () => navigate("/coach/feedback") },
    { icon: ClipboardCheck, label: "Chequeo de alumnos", onClick: () => navigate("/coach/chequeo-alumnos") },
    { icon: ListTodo, label: "Mis tareas", onClick: () => navigate("/coach/tareas") },
    { icon: Banknote, label: "Liquidaciones", onClick: () => navigate("/coach/liquidaciones") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
              Panel Coach
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <SwitchPortalButton size="sm" />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Greeting con avatar */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center font-heading font-semibold text-lg flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-heading font-semibold text-foreground truncate">
                Hola, {coachName}
              </p>
              <p className="text-[13px] text-muted-foreground">
                Este es tu panel de trabajo
              </p>
            </div>
          </div>

          {grupos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {grupos.map((g) => (
                <span
                  key={g}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary/60 border border-border/50 text-muted-foreground font-mono"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Clases de hoy con confirmación */}
        <MisClasesHoy />

        {/* Próxima clase — compacta */}
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Próxima clase
            </span>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          {proximaClase ? (
            <div className="space-y-2">
              <p className="text-[15px] font-heading font-semibold text-foreground capitalize">
                {formatDate(proximaClase.fecha)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                  {proximaClase.grupo}
                </span>
                {proximaClase.tipo && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-card border border-border/50 text-muted-foreground capitalize">
                    {proximaClase.tipo}
                  </span>
                )}
              </div>
              {proximaClase.titulo && (
                <p className="text-[12px] text-muted-foreground font-mono uppercase tracking-wide">
                  {proximaClase.titulo}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-1">
              No tenés clases asignadas.
            </p>
          )}
        </div>

        {/* Acciones rápidas — grid 2x2 */}
        <div>
          <p className="text-[12px] text-muted-foreground mb-2 px-1">Acciones rápidas</p>
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 hover:border-primary/40 transition text-left h-auto"
              >
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-[13px] text-foreground leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Más — lista */}
        <div>
          <p className="text-[12px] text-muted-foreground mb-2 px-1">Más</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/coach/asesoria")}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 transition text-left"
            >
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Asesoría personalizada</span>
            </button>
            <button
              onClick={() => setShowAusencias(true)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-secondary/60 transition text-left"
            >
              <Plane className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Mis ausencias / vacaciones</span>
            </button>
          </div>
        </div>

        {/* Récord de la hora — destacado */}
        <Button
          variant="gold"
          className="w-full h-12 justify-center gap-2 text-sm font-medium"
          onClick={() => navigate("/coach/eventos/record-de-la-hora")}
        >
          <Trophy className="w-4 h-4" />
          Récord de la Hora
        </Button>
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
