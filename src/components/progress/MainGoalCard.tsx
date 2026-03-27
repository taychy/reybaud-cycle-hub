import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Target, CalendarIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Objetivo {
  id: string;
  nombre: string;
  fecha_objetivo: string | null;
  activo: boolean;
}

interface Props {
  alumnoId: string;
}

export function MainGoalCard({ alumnoId }: Props) {
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const loadGoal = async () => {
    const { data } = await supabase
      .from("objetivos_alumno")
      .select("id, nombre, fecha_objetivo, activo")
      .eq("alumno_id", alumnoId)
      .eq("activo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setObjetivo(data);
    setLoading(false);
  };

  useEffect(() => {
    if (alumnoId) loadGoal();
  }, [alumnoId]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresá un nombre para tu objetivo");
      return;
    }
    setSubmitting(true);
    try {
      // Deactivate previous
      if (objetivo) {
        await supabase
          .from("objetivos_alumno")
          .update({ activo: false })
          .eq("id", objetivo.id);
      }

      const { error } = await supabase.from("objetivos_alumno").insert({
        alumno_id: alumnoId,
        nombre: nombre.trim(),
        fecha_objetivo: fecha ? format(fecha, "yyyy-MM-dd") : null,
      });

      if (error) throw error;

      toast.success("Objetivo guardado");
      setDialogOpen(false);
      setNombre("");
      setFecha(undefined);
      await loadGoal();
    } catch {
      toast.error("Error al guardar el objetivo");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const diasRestantes = objetivo?.fecha_objetivo
    ? differenceInDays(new Date(objetivo.fecha_objetivo + "T12:00:00"), new Date())
    : null;

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-3 shadow-lg shadow-black/20">
      <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Target className="w-4 h-4" /> Objetivo principal
      </h2>

      {objetivo ? (
        <div className="space-y-2">
          <p className="text-lg font-heading font-bold text-foreground">{objetivo.nombre}</p>
          {objetivo.fecha_objetivo ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {format(new Date(objetivo.fecha_objetivo + "T12:00:00"), "d 'de' MMMM yyyy", { locale: es })}
              </p>
              {diasRestantes !== null && diasRestantes >= 0 && (
                <span className="text-sm font-semibold text-primary">
                  Faltan {diasRestantes} día{diasRestantes !== 1 ? "s" : ""}
                </span>
              )}
              {diasRestantes !== null && diasRestantes < 0 && (
                <span className="text-xs font-medium text-muted-foreground">Fecha pasada</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Objetivo en curso</p>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground mt-1">
                Cambiar objetivo
              </Button>
            </DialogTrigger>
            <GoalDialogContent
              nombre={nombre}
              setNombre={setNombre}
              fecha={fecha}
              setFecha={setFecha}
              submitting={submitting}
              onSave={handleSave}
            />
          </Dialog>
        </div>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="gold-outline" size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-1" /> Cargar objetivo
            </Button>
          </DialogTrigger>
          <GoalDialogContent
            nombre={nombre}
            setNombre={setNombre}
            fecha={fecha}
            setFecha={setFecha}
            submitting={submitting}
            onSave={handleSave}
          />
        </Dialog>
      )}
    </div>
  );
}

function GoalDialogContent({
  nombre, setNombre, fecha, setFecha, submitting, onSave,
}: {
  nombre: string;
  setNombre: (v: string) => void;
  fecha: Date | undefined;
  setFecha: (v: Date | undefined) => void;
  submitting: boolean;
  onSave: () => void;
}) {
  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-heading">Mi objetivo</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nombre del objetivo</label>
          <Input
            placeholder="Ej: Gran Fondo 7 Lagos"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Fecha objetivo (opcional)</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fecha && "text-muted-foreground")}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {fecha ? format(fecha, "d 'de' MMMM yyyy", { locale: es }) : "Sin fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={setFecha}
                disabled={(d) => d < new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button variant="gold" className="w-full" disabled={submitting} onClick={onSave}>
          {submitting ? "Guardando..." : "Guardar objetivo"}
        </Button>
      </div>
    </DialogContent>
  );
}
