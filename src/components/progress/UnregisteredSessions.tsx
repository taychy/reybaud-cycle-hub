import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Clock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingSession {
  entrenamiento_id: string;
  fecha: string;
  titulo: string;
  tipo: string | null;
}

interface Props {
  alumnoId: string;
  grupo: string;
  onUpdate: () => void;
}

export function UnregisteredSessions({ alumnoId, grupo, onUpdate }: Props) {
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadPending = async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toISOString().split("T")[0];
    const fromDate = firstDay.toISOString().split("T")[0];

    // Past visible trainings for this month
    let trainingsQuery = supabase
      .from("entrenamientos")
      .select("id, fecha, titulo, tipo")
      .eq("visible", true)
      .gte("fecha", fromDate)
      .lte("fecha", todayStr)
      .order("fecha", { ascending: false });

    if (grupo === "Personalizado") {
      trainingsQuery = trainingsQuery.eq("alumno_id", alumnoId);
    } else {
      trainingsQuery = trainingsQuery.eq("grupo", grupo as any).is("alumno_id", null);
    }

    const { data: entrenamientos } = await trainingsQuery;

    if (!entrenamientos?.length) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const entIds = entrenamientos.map(e => e.id);

    // Get already registered ones
    const { data: registros } = await supabase
      .from("registro_sesiones")
      .select("entrenamiento_id")
      .eq("alumno_id", alumnoId)
      .in("entrenamiento_id", entIds);

    const { data: asistencias } = await supabase
      .from("asistencias")
      .select("entrenamiento_id, estado")
      .eq("alumno_id", alumnoId)
      .in("entrenamiento_id", entIds);

    const registeredIds = new Set((registros || []).map(r => r.entrenamiento_id));
    const attendedIds = new Set(
      (asistencias || []).filter(a => a.estado === "asistio").map(a => a.entrenamiento_id)
    );

    // Pending = not in registro_sesiones AND not attended
    const pending = entrenamientos.filter(
      e => !registeredIds.has(e.id) && !attendedIds.has(e.id)
    );

    setSessions(pending.map(e => ({
      entrenamiento_id: e.id,
      fecha: e.fecha,
      titulo: e.titulo,
      tipo: e.tipo,
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (alumnoId && grupo) loadPending();
  }, [alumnoId, grupo]);

  const handleRegister = async (entId: string, estado: "realizada" | "no_realizada") => {
    setSubmitting(entId);
    try {
      const { error } = await supabase.from("registro_sesiones").upsert({
        alumno_id: alumnoId,
        entrenamiento_id: entId,
        estado,
      }, { onConflict: "alumno_id,entrenamiento_id" });

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.entrenamiento_id !== entId));
      toast.success(estado === "realizada" ? "Sesión marcada como realizada" : "Sesión marcada como no realizada");
      onUpdate();
    } catch {
      toast.error("Error al registrar la sesión");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return null;

  const visible = showAll ? sessions : sessions.slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" /> Sesiones sin registrar
        </h2>
        {sessions.length > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
            {sessions.length} pendiente{sessions.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No tenés sesiones pendientes de registrar 🎉
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Marcá los entrenamientos que ya hiciste</p>
          <div className="space-y-2">
            {visible.map((s) => (
              <div
                key={s.entrenamiento_id}
                className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{s.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.fecha + "T12:00:00").toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                    })}
                    {s.tipo ? ` · ${s.tipo}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={submitting === s.entrenamiento_id}
                    className="h-8 px-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => handleRegister(s.entrenamiento_id, "realizada")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    <span className="text-xs">Realizada</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={submitting === s.entrenamiento_id}
                    className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRegister(s.entrenamiento_id, "no_realizada")}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    <span className="text-xs">No la hice</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {sessions.length > 5 && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <ChevronDown className="w-4 h-4 mr-1" /> Ver más ({sessions.length - 5} restantes)
            </Button>
          )}
        </>
      )}
    </div>
  );
}
