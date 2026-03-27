import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Target, CalendarIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parse, isValid } from "date-fns";
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
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState<Date | undefined>();
  const [fechaText, setFechaText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadGoals = async () => {
    const { data } = await supabase
      .from("objetivos_alumno")
      .select("id, nombre, fecha_objetivo, activo")
      .eq("alumno_id", alumnoId)
      .eq("activo", true)
      .order("created_at", { ascending: false });

    setObjetivos(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (alumnoId) loadGoals();
  }, [alumnoId]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresá un nombre para tu objetivo");
      return;
    }
    setSubmitting(true);
    try {
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
      setFechaText("");
      await loadGoals();
    } catch {
      toast.error("Error al guardar el objetivo");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("objetivos_alumno").update({ activo: false }).eq("id", id);
    toast.success("Objetivo eliminado");
    await loadGoals();
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-3 shadow-lg shadow-black/20">
      <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Target className="w-4 h-4" /> Mis objetivos
      </h2>

      {objetivos.length > 0 && (
        <div className="space-y-3">
          {objetivos.map((obj) => {
            const dias = obj.fecha_objetivo
              ? differenceInDays(new Date(obj.fecha_objetivo + "T12:00:00"), new Date())
              : null;

            return (
              <div key={obj.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-heading font-bold text-foreground">{obj.nombre}</p>
                  {obj.fecha_objetivo ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(obj.fecha_objetivo + "T12:00:00"), "d 'de' MMMM yyyy", { locale: es })}
                      </p>
                      {dias !== null && dias >= 0 && (
                        <span className="text-xs font-semibold text-primary">
                          Faltan {dias} día{dias !== 1 ? "s" : ""}
                        </span>
                      )}
                      {dias !== null && dias < 0 && (
                        <span className="text-xs font-medium text-muted-foreground">Fecha pasada</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Objetivo en curso</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(obj.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setNombre(""); setFecha(undefined); setFechaText(""); }
      }}>
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
          fechaText={fechaText}
          setFechaText={setFechaText}
          submitting={submitting}
          onSave={handleSave}
        />
      </Dialog>
    </div>
  );
}

function GoalDialogContent({
  nombre, setNombre, fecha, setFecha, fechaText, setFechaText, submitting, onSave,
}: {
  nombre: string;
  setNombre: (v: string) => void;
  fecha: Date | undefined;
  setFecha: (v: Date | undefined) => void;
  fechaText: string;
  setFechaText: (v: string) => void;
  submitting: boolean;
  onSave: () => void;
}) {
  const handleTextChange = (val: string) => {
    setFechaText(val);
    // Try parsing dd/mm/yyyy
    const parsed = parse(val, "dd/MM/yyyy", new Date());
    if (isValid(parsed) && parsed.getFullYear() > 2000) {
      setFecha(parsed);
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    setFecha(d);
    if (d) setFechaText(format(d, "dd/MM/yyyy"));
    else setFechaText("");
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-heading">Nuevo objetivo</DialogTitle>
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
          <div className="flex gap-2">
            <Input
              placeholder="dd/mm/aaaa"
              value={fechaText}
              onChange={(e) => handleTextChange(e.target.value)}
              className="flex-1"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                  <CalendarIcon className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={fecha}
                  onSelect={handleCalendarSelect}
                  disabled={(d) => d < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Button variant="gold" className="w-full" disabled={submitting} onClick={onSave}>
          {submitting ? "Guardando..." : "Guardar objetivo"}
        </Button>
      </div>
    </DialogContent>
  );
}
