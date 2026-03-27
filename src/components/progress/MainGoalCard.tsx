import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
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
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
}

interface Props {
  alumnoId: string;
}

export function MainGoalCard({ alumnoId }: Props) {
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaInicioText, setFechaInicioText] = useState("");
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [fechaFinText, setFechaFinText] = useState("");
  const [sameDay, setSameDay] = useState(false);

  const loadGoals = async () => {
    const { data } = await supabase
      .from("objetivos_alumno")
      .select("id, nombre, fecha_inicio, fecha_fin, activo")
      .eq("alumno_id", alumnoId)
      .eq("activo", true)
      .order("created_at", { ascending: false });

    setObjetivos((data as Objetivo[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (alumnoId) loadGoals();
  }, [alumnoId]);

  const resetForm = () => {
    setNombre("");
    setFechaInicio(undefined);
    setFechaInicioText("");
    setFechaFin(undefined);
    setFechaFinText("");
    setSameDay(false);
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresá un nombre para tu objetivo");
      return;
    }
    setSubmitting(true);
    try {
      const inicio = fechaInicio ? format(fechaInicio, "yyyy-MM-dd") : null;
      const fin = sameDay ? inicio : (fechaFin ? format(fechaFin, "yyyy-MM-dd") : null);

      const { error } = await supabase.from("objetivos_alumno").insert({
        alumno_id: alumnoId,
        nombre: nombre.trim(),
        fecha_inicio: inicio,
        fecha_fin: fin,
      });

      if (error) throw error;

      toast.success("Objetivo guardado");
      setDialogOpen(false);
      resetForm();
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
          {objetivos.map((obj) => <GoalItem key={obj.id} obj={obj} onDelete={handleDelete} />)}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogTrigger asChild>
          <Button variant="gold-outline" size="sm" className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Cargar objetivo
          </Button>
        </DialogTrigger>
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

            <DateField
              label="Fecha de inicio (opcional)"
              date={fechaInicio}
              setDate={(d) => {
                setFechaInicio(d);
                if (sameDay) { setFechaFin(d); setFechaFinText(d ? format(d, "dd/MM/yyyy") : ""); }
              }}
              text={fechaInicioText}
              setText={(t) => {
                setFechaInicioText(t);
                const parsed = parse(t, "dd/MM/yyyy", new Date());
                if (isValid(parsed) && parsed.getFullYear() > 2000) {
                  setFechaInicio(parsed);
                  if (sameDay) { setFechaFin(parsed); setFechaFinText(t); }
                }
              }}
            />

            <div className="flex items-center gap-2">
              <Checkbox
                id="same-day"
                checked={sameDay}
                onCheckedChange={(checked) => {
                  const val = !!checked;
                  setSameDay(val);
                  if (val && fechaInicio) {
                    setFechaFin(fechaInicio);
                    setFechaFinText(format(fechaInicio, "dd/MM/yyyy"));
                  }
                }}
              />
              <label htmlFor="same-day" className="text-xs text-muted-foreground cursor-pointer">
                Mismo día de inicio y finalización
              </label>
            </div>

            {!sameDay && (
              <DateField
                label="Fecha de finalización (opcional)"
                date={fechaFin}
                setDate={setFechaFin}
                text={fechaFinText}
                setText={(t) => {
                  setFechaFinText(t);
                  const parsed = parse(t, "dd/MM/yyyy", new Date());
                  if (isValid(parsed) && parsed.getFullYear() > 2000) setFechaFin(parsed);
                }}
                minDate={fechaInicio}
              />
            )}

            <Button variant="gold" className="w-full" disabled={submitting} onClick={handleSave}>
              {submitting ? "Guardando..." : "Guardar objetivo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalItem({ obj, onDelete }: { obj: Objetivo; onDelete: (id: string) => void }) {
  const hasFin = !!obj.fecha_fin;
  const hasInicio = !!obj.fecha_inicio;
  const isSameDay = hasInicio && hasFin && obj.fecha_inicio === obj.fecha_fin;

  const diasRestantes = hasFin
    ? differenceInDays(new Date(obj.fecha_fin! + "T12:00:00"), new Date())
    : null;

  const formatDate = (d: string) =>
    format(new Date(d + "T12:00:00"), "d MMM yyyy", { locale: es });

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-heading font-bold text-foreground">{obj.nombre}</p>
        {isSameDay ? (
          <p className="text-xs text-muted-foreground">{formatDate(obj.fecha_fin!)}</p>
        ) : hasInicio && hasFin ? (
          <p className="text-xs text-muted-foreground">
            {formatDate(obj.fecha_inicio!)} → {formatDate(obj.fecha_fin!)}
          </p>
        ) : hasFin ? (
          <p className="text-xs text-muted-foreground">{formatDate(obj.fecha_fin!)}</p>
        ) : hasInicio ? (
          <p className="text-xs text-muted-foreground">Desde {formatDate(obj.fecha_inicio!)}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Objetivo en curso</p>
        )}
        {diasRestantes !== null && diasRestantes >= 0 && (
          <span className="text-xs font-semibold text-primary">
            Faltan {diasRestantes} día{diasRestantes !== 1 ? "s" : ""}
          </span>
        )}
        {diasRestantes !== null && diasRestantes < 0 && (
          <span className="text-xs font-medium text-muted-foreground">Fecha pasada</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(obj.id)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function DateField({
  label, date, setDate, text, setText, minDate,
}: {
  label: string;
  date: Date | undefined;
  setDate: (d: Date | undefined) => void;
  text: string;
  setText: (v: string) => void;
  minDate?: Date;
}) {
  const handleCalendarSelect = (d: Date | undefined) => {
    setDate(d);
    if (d) setText(format(d, "dd/MM/yyyy"));
    else setText("");
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <Input
          placeholder="dd/mm/aaaa"
          value={text}
          onChange={(e) => setText(e.target.value)}
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
              selected={date}
              onSelect={handleCalendarSelect}
              disabled={minDate ? (d) => d < minDate : undefined}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
