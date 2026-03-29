import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const TYPE_LABELS: Record<string, string> = {
  ruta: "Ruta",
  rodillo: "Rodillo",
  gimnasio: "Gimnasio",
  tecnica: "Técnica",
};

interface TrainingCellDrawerProps {
  training: Entrenamiento | null;
  onClose: () => void;
  onEdit: (ent: Entrenamiento) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (ent: Entrenamiento) => void;
}

const TrainingCellDrawer = ({ training, onClose, onEdit, onDelete, onToggleVisibility }: TrainingCellDrawerProps) => {
  if (!training) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <Sheet open={!!training} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading uppercase tracking-wider text-left">
            Detalle del entrenamiento
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Fecha</p>
            <p className="text-foreground capitalize">{formatDate(training.fecha)}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="font-mono">{training.grupo}</Badge>
            {training.tipo && (
              <Badge variant="outline" className="capitalize">{TYPE_LABELS[training.tipo] || training.tipo}</Badge>
            )}
            <Badge variant={training.visible ? "default" : "secondary"}>
              {training.visible ? "Visible" : "Oculto"}
            </Badge>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Título</p>
            <p className="text-foreground font-medium text-lg">{training.titulo}</p>
          </div>

          {training.descripcion && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Descripción</p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{training.descripcion}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground">Resistencia</p>
              <p className="text-lg font-bold text-foreground">{training.resistencia}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground">Técnica</p>
              <p className="text-lg font-bold text-foreground">{training.tecnica}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground">Intensidad</p>
              <p className="text-lg font-bold text-foreground">{training.intensidad}</p>
            </div>
          </div>

          {training.link_archivo && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Archivo</p>
              <a href={training.link_archivo} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all">
                {training.link_archivo}
              </a>
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(training)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onToggleVisibility(training)}>
              {training.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(training.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TrainingCellDrawer;
