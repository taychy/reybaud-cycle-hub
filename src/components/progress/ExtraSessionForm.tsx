import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  alumnoId: string;
  onCreated: () => void;
}

const TIPOS = [
  { value: "libre", label: "Libre" },
  { value: "ruta", label: "Ruta" },
  { value: "rodillo", label: "Rodillo" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "otra", label: "Otra actividad" },
];

export function ExtraSessionForm({ alumnoId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("libre");
  const [fecha, setFecha] = useState<Date>(new Date());
  const [duracion, setDuracion] = useState("");
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("sesiones_extra").insert({
        alumno_id: alumnoId,
        tipo,
        fecha: format(fecha, "yyyy-MM-dd"),
        duracion_minutos: duracion ? parseInt(duracion) : null,
        comentario: comentario.trim() || null,
      });

      if (error) throw error;

      toast.success("Sesión extra registrada");
      setOpen(false);
      setTipo("libre");
      setFecha(new Date());
      setDuracion("");
      setComentario("");
      onCreated();
    } catch {
      toast.error("Error al registrar la sesión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold-outline" size="sm" className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Cargar sesión extra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Cargar sesión extra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {format(fecha, "d 'de' MMMM yyyy", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fecha}
                  onSelect={(d) => d && setFecha(d)}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Duración */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Duración (minutos, opcional)</label>
            <Input
              type="number"
              placeholder="Ej: 60"
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              min={1}
              max={600}
            />
          </div>

          {/* Comentario */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Comentario (opcional)</label>
            <Textarea
              placeholder="Ej: Salida de 40km por ruta..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            variant="gold"
            className="w-full"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Guardando..." : "Guardar sesión"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
