import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";
import TrainingDetailView from "@/components/TrainingDetailView";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];


const CoachEntrenamientos = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState<string[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>("");
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ProtectedRoute handles redirect

      const { data: coach } = await supabase
        .from("coaches")
        .select("*")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) { navigate("/coach"); return; }

      const coachGrupos = (coach as any).grupos || [];
      setGrupos(coachGrupos);
      if (coachGrupos.length > 0) setSelectedGrupo(coachGrupos[0]);
      setLoading(false);
    };
    init();
  }, [navigate]);

  // Build current week dates
  const weekDates = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  }, []);

  // Set initial selected date to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (weekDates.includes(today)) {
      setSelectedDate(today);
    } else {
      setSelectedDate(weekDates[0]);
    }
  }, [weekDates]);

  // Fetch trainings for the selected group and week
  useEffect(() => {
    if (!selectedGrupo || weekDates.length === 0) return;
    const fetchTrainings = async () => {
      const { data } = await supabase
        .from("entrenamientos")
        .select("*")
        .eq("grupo", selectedGrupo as any)
        .gte("fecha", weekDates[0])
        .lte("fecha", weekDates[6])
        .order("fecha", { ascending: true });
      setEntrenamientos(data || []);
    };
    fetchTrainings();
  }, [selectedGrupo, weekDates]);

  const todayTraining = entrenamientos.find((e) => e.fecha === selectedDate);

  const formatDayNum = (dateStr: string) => {
    return new Date(dateStr + "T12:00:00").getDate();
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
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
            Plan del grupo
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Group selector */}
        {grupos.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {grupos.map((g) => (
              <Button
                key={g}
                variant={selectedGrupo === g ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedGrupo(g)}
              >
                {g}
              </Button>
            ))}
          </div>
        )}

        {/* Day selector */}
        <div className="flex gap-1 justify-between">
          {weekDates.map((date, i) => {
            const isSelected = date === selectedDate;
            const isToday = date === new Date().toISOString().split("T")[0];
            const hasTraining = entrenamientos.some((e) => e.fecha === date);
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center py-2 px-2.5 rounded-lg transition-all min-w-[44px] ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                <span className="text-[11px] font-medium">{DAYS[i]}</span>
                <span className="text-sm font-bold mt-0.5">{formatDayNum(date)}</span>
                {hasTraining && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    isSelected ? "bg-primary-foreground" : "bg-primary"
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Training content */}
        {todayTraining ? (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-heading font-bold text-foreground">
                  {todayTraining.titulo}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {todayTraining.grupo}
                  </Badge>
                  {todayTraining.tipo && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {todayTraining.tipo}
                    </Badge>
                  )}
                </div>
              </div>
              {todayTraining.visible ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                  Visible
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Oculto
                </Badge>
              )}
            </div>



            {/* Description with student-style rendering and font toggle */}
            {todayTraining.descripcion && (
              <TrainingDetailView
                entrenamiento={todayTraining}
                alumnoName=""
                selectedDayIndex={weekDates.indexOf(selectedDate)}
                onDayChange={(i) => setSelectedDate(weekDates[i])}
              />
            )}

            {/* Attachment */}
            {todayTraining.link_archivo && (
              <a
                href={todayTraining.link_archivo}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                Ver archivo adjunto
              </a>
            )}
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                No hay entrenamiento cargado para este día.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default CoachEntrenamientos;

