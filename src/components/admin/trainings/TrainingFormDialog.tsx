import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante"] as const;
const TIPOS = ["ruta", "rodillo", "gimnasio", "tecnica"] as const;

interface TrainingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training: Entrenamiento | null;
  defaultMonth: string;
  onSaved: () => void;
}

const TrainingFormDialog = ({ open, onOpenChange, training, defaultMonth, onSaved }: TrainingFormDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    fecha: `${defaultMonth}-01`,
    grupos: ["G1"] as string[],
    tipo: "ruta",
    link_archivo: "",
    visible: true,
    resistencia: 0,
    tecnica: 0,
    intensidad: 0,
  });
  const [repeatDays, setRepeatDays] = useState(false);
  const [repeatCount, setRepeatCount] = useState(7);

  useEffect(() => {
    if (training) {
      setForm({
        titulo: training.titulo,
        descripcion: training.descripcion || "",
        fecha: training.fecha,
        grupos: [training.grupo],
        tipo: training.tipo || "ruta",
        link_archivo: training.link_archivo || "",
        visible: training.visible,
        resistencia: training.resistencia,
        tecnica: training.tecnica,
        intensidad: training.intensidad,
      });
      setRepeatDays(false);
    } else {
      setForm({
        titulo: "",
        descripcion: "",
        fecha: `${defaultMonth}-01`,
        grupos: ["G1"],
        tipo: "ruta",
        link_archivo: "",
        visible: true,
        resistencia: 0,
        tecnica: 0,
        intensidad: 0,
      });
    }
  }, [training, defaultMonth, open]);

  const toggleGrupo = (g: string) => {
    setForm(prev => ({
      ...prev,
      grupos: prev.grupos.includes(g) ? prev.grupos.filter(x => x !== g) : [...prev.grupos, g],
    }));
  };

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.fecha || form.grupos.length === 0) {
      toast.error("Completá título, fecha y al menos un grupo");
      return;
    }
    setSaving(true);
    try {
      if (training) {
        const { error } = await supabase.from("entrenamientos").update({
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim() || null,
          fecha: form.fecha,
          grupo: form.grupos[0] as any,
          tipo: form.tipo as any,
          link_archivo: form.link_archivo.trim() || null,
          visible: form.visible,
          resistencia: form.resistencia,
          tecnica: form.tecnica,
          intensidad: form.intensidad,
        }).eq("id", training.id);
        if (error) throw error;
        toast.success("Entrenamiento actualizado");
      } else {
        const dates: string[] = [form.fecha];
        if (repeatDays && repeatCount > 0) {
          for (let i = 1; i <= repeatCount; i++) {
            const d = new Date(form.fecha + "T12:00:00");
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().split("T")[0]);
          }
        }
        const entries = [];
        for (const date of dates) {
          for (const grupo of form.grupos) {
            entries.push({
              titulo: form.titulo.trim(),
              descripcion: form.descripcion.trim() || null,
              fecha: date,
              grupo: grupo as any,
              tipo: form.tipo as any,
              link_archivo: form.link_archivo.trim() || null,
              visible: form.visible,
              resistencia: form.resistencia,
              tecnica: form.tecnica,
              intensidad: form.intensidad,
            });
          }
        }
        for (let i = 0; i < entries.length; i += 50) {
          const { error } = await supabase.from("entrenamientos").insert(entries.slice(i, i + 50));
          if (error) throw error;
        }
        toast.success(`${entries.length} entrenamiento${entries.length > 1 ? "s" : ""} creado${entries.length > 1 ? "s" : ""}`);
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider">
            {training ? "Editar entrenamiento" : "Nuevo entrenamiento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
              <Input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Grupos</label>
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGrupo(g)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    form.grupos.includes(g)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Título</label>
            <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: RE + FZA RE" className="bg-secondary border-border" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
            <Textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={4} className="bg-secondary border-border" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Resistencia</label>
              <Input type="number" min={0} max={5} value={form.resistencia} onChange={e => setForm({ ...form, resistencia: parseInt(e.target.value) || 0 })} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Técnica</label>
              <Input type="number" min={0} max={5} value={form.tecnica} onChange={e => setForm({ ...form, tecnica: parseInt(e.target.value) || 0 })} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Intensidad</label>
              <Input type="number" min={0} max={5} value={form.intensidad} onChange={e => setForm({ ...form, intensidad: parseInt(e.target.value) || 0 })} className="bg-secondary border-border" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Link archivo (opcional)</label>
            <Input value={form.link_archivo} onChange={e => setForm({ ...form, link_archivo: e.target.value })} className="bg-secondary border-border" />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={form.visible} onCheckedChange={c => setForm({ ...form, visible: !!c })} id="form-visible" />
            <Label htmlFor="form-visible" className="text-sm">Visible para alumnos</Label>
          </div>

          {!training && (
            <div className="space-y-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox checked={repeatDays} onCheckedChange={c => setRepeatDays(!!c)} id="repeat-days" />
                <Label htmlFor="repeat-days" className="text-sm">Repetir en días siguientes</Label>
                {repeatDays && (
                  <Input type="number" min={1} max={30} value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value) || 1)} className="w-20 h-8 bg-secondary border-border text-xs" />
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : training ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TrainingFormDialog;
