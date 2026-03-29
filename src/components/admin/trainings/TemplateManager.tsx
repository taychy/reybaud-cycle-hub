import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Play, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

interface TemplateEntry {
  day_index: number;
  grupo: string;
  titulo: string;
  tipo: string;
  descripcion: string | null;
  resistencia: number;
  tecnica: number;
  intensidad: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  entries: TemplateEntry[];
  created_at: string;
}

interface TemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  entrenamientos: Entrenamiento[];
  onApplied: () => void;
}

const TemplateManager = ({ open, onOpenChange, month, entrenamientos, onApplied }: TemplateManagerProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [saveWeekNum, setSaveWeekNum] = useState(1);
  const [showSave, setShowSave] = useState(false);
  const [applyDialog, setApplyDialog] = useState<Template | null>(null);
  const [applyStartDate, setApplyStartDate] = useState(`${month}-01`);

  const fetchTemplates = async () => {
    const { data } = await (supabase.from as any)("training_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) fetchTemplates(); }, [open]);

  const getWeekEntrenamientos = (weekNum: number) => {
    return entrenamientos.filter(e => {
      const day = parseInt(e.fecha.split("-")[2]);
      return Math.ceil(day / 7) === weekNum;
    });
  };

  const handleSaveTemplate = async () => {
    if (!saveName.trim()) { toast.error("Ingresá un nombre"); return; }
    const weekEnts = getWeekEntrenamientos(saveWeekNum);
    if (weekEnts.length === 0) { toast.error("No hay entrenamientos en esa semana"); return; }

    const entries: TemplateEntry[] = weekEnts.map(e => {
      const dateObj = new Date(e.fecha + "T12:00:00");
      const dayIndex = (dateObj.getDay() + 6) % 7;
      return {
        day_index: dayIndex,
        grupo: e.grupo,
        titulo: e.titulo,
        tipo: e.tipo || "ruta",
        descripcion: e.descripcion,
        resistencia: e.resistencia,
        tecnica: e.tecnica,
        intensidad: e.intensidad,
      };
    });

    const { error } = await (supabase.from as any)("training_templates").insert({
      name: saveName.trim(),
      template_type: "week",
      entries,
    });

    if (error) toast.error("Error al guardar plantilla");
    else {
      toast.success("Plantilla guardada");
      setSaveName("");
      setShowSave(false);
      fetchTemplates();
    }
  };

  const handleApplyTemplate = async () => {
    if (!applyDialog || !applyStartDate) return;
    const startDate = new Date(applyStartDate + "T12:00:00");
    const startDayOfWeek = (startDate.getDay() + 6) % 7;

    const newEntries = applyDialog.entries.map(entry => {
      const dayDiff = entry.day_index - startDayOfWeek;
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + dayDiff);
      return {
        titulo: entry.titulo,
        descripcion: entry.descripcion,
        fecha: targetDate.toISOString().split("T")[0],
        grupo: entry.grupo as any,
        tipo: entry.tipo as any,
        visible: false,
        resistencia: entry.resistencia,
        tecnica: entry.tecnica,
        intensidad: entry.intensidad,
      };
    });

    const { error } = await supabase.from("entrenamientos").insert(newEntries);
    if (error) toast.error("Error al aplicar plantilla");
    else {
      toast.success(`${newEntries.length} entrenamientos creados desde plantilla`);
      setApplyDialog(null);
      onApplied();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await (supabase.from as any)("training_templates").delete().eq("id", id);
    toast.success("Plantilla eliminada");
    fetchTemplates();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Plantillas</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {!showSave ? (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowSave(true)}>
                <Save className="w-4 h-4 mr-1.5" /> Guardar semana como plantilla
              </Button>
            ) : (
              <div className="space-y-3 p-3 rounded-lg bg-secondary">
                <Input placeholder="Nombre de la plantilla" value={saveName} onChange={e => setSaveName(e.target.value)} className="bg-background border-border" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Semana:</label>
                  <Input type="number" min={1} max={5} value={saveWeekNum} onChange={e => setSaveWeekNum(parseInt(e.target.value) || 1)} className="w-16 bg-background border-border h-8" />
                  <span className="text-xs text-muted-foreground">({getWeekEntrenamientos(saveWeekNum).length} entrenam.)</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowSave(false)}>Cancelar</Button>
                  <Button size="sm" variant="gold" onClick={handleSaveTemplate}>Guardar</Button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay plantillas guardadas</p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.entries.length} entrenam. · {new Set(t.entries.map(e => e.grupo)).size} grupos</p>
                    </div>
                    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setApplyDialog(t); setApplyStartDate(`${month}-01`); }}>
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleDeleteTemplate(t.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!applyDialog} onOpenChange={() => setApplyDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Aplicar plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Aplicar <strong className="text-foreground">{applyDialog?.name}</strong> desde:
            </p>
            <Input type="date" value={applyStartDate} onChange={e => setApplyStartDate(e.target.value)} className="bg-secondary border-border" />
            <p className="text-xs text-muted-foreground">
              Se crearán {applyDialog?.entries.length} entrenamientos (ocultos por defecto)
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setApplyDialog(null)}>Cancelar</Button>
              <Button variant="gold" onClick={handleApplyTemplate}>Aplicar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateManager;
