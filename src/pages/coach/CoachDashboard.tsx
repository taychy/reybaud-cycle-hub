import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Users, Calendar, ClipboardList, Trophy, CheckSquare, MessageSquare, Banknote, Plane } from "lucide-react";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";
import MisClasesHoy from "@/components/coach/MisClasesHoy";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import AusenciasCoachManager from "@/components/AusenciasCoachManager";

type Entrenamiento = Tables<"entrenamientos">;

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [proximaClase, setProximaClase] = useState<Entrenamiento | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <div>
              <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
                Panel Coach
              </h1>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">
            Hola, {coachName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Este es tu panel de trabajo
          </p>
          {grupos.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {grupos.map((g) => (
                <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Clases de hoy con confirmación */}
        <MisClasesHoy />

        {/* Next class card */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
              Próxima clase
            </p>
            {proximaClase ? (
              <div className="space-y-2">
                <p className="text-foreground font-heading font-semibold text-lg capitalize">
                  {formatDate(proximaClase.fecha)}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {proximaClase.grupo}
                  </Badge>
                  {proximaClase.tipo && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {proximaClase.tipo}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {proximaClase.titulo}
                </p>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-muted-foreground text-sm">
                  No tenés clases asignadas.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/alumnos")}
          >
            <Users className="w-5 h-5 text-primary" />
            Ver mis alumnos
          </Button>

          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/entrenamientos")}
          >
            <ClipboardList className="w-5 h-5 text-primary" />
            Ver plan del grupo
          </Button>

          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/asistencia")}
          >
            <CheckSquare className="w-5 h-5 text-primary" />
            Registrar asistencia
          </Button>

          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/feedback")}
          >
            <MessageSquare className="w-5 h-5 text-primary" />
            Dar feedback a alumno
          </Button>

          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/liquidaciones")}
          >
            <Banknote className="w-5 h-5 text-primary" />
            Liquidaciones
          </Button>

          <Button
            variant="outline"
            className="w-full h-14 justify-start gap-3 text-base border-border hover:bg-secondary"
            onClick={() => navigate("/coach/asesoria")}
          >
            <ClipboardList className="w-5 h-5 text-primary" />
            Asesoría Personalizada
          </Button>

          <Button
            variant="gold"
            className="w-full h-14 justify-start gap-3 text-base"
            onClick={() => navigate("/coach/eventos/record-de-la-hora")}
          >
            <Trophy className="w-5 h-5" />
            Record de la Hora
          </Button>
        </div>
      </main>
    </div>
  );
};

export default CoachDashboard;
