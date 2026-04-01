import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

interface DuplicatesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entrenamientos: Entrenamiento[];
  onDeleted: () => void;
}

type DuplicateGroup = {
  key: string;
  fecha: string;
  grupo: string;
  titulo: string;
  items: Entrenamiento[];
};

const DuplicatesDrawer = ({ open, onOpenChange, entrenamientos, onDeleted }: DuplicatesDrawerProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const map = new Map<string, Entrenamiento[]>();
    for (const e of entrenamientos) {
      const key = `${e.fecha}|${e.grupo}|${e.titulo.trim().toLowerCase()}`;
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({
        key,
        fecha: items[0].fecha,
        grupo: items[0].grupo,
        titulo: items[0].titulo,
        items: items.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [entrenamientos]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const autoSelectDuplicates = () => {
    const ids = new Set<string>();
    for (const group of duplicateGroups) {
      // Keep the first (oldest), select the rest for deletion
      for (let i = 1; i < group.items.length; i++) {
        ids.add(group.items[i].id);
      }
    }
    setSelectedIds(ids);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} entrenamientos duplicados?`)) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from("entrenamientos").delete().in("id", ids.slice(i, i + 50));
    }
    toast.success(`${ids.length} duplicados eliminados`);
    setSelectedIds(new Set());
    setDeleting(false);
    onDeleted();
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  };

  const totalDuplicates = duplicateGroups.reduce((acc, g) => acc + g.items.length - 1, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Duplicados detectados
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No se encontraron entrenamientos duplicados 🎉</p>
              <p className="text-xs text-muted-foreground mt-1">
                Se comparan por fecha + grupo + título
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{duplicateGroups.length}</span> grupos con{" "}
                  <span className="font-semibold text-foreground">{totalDuplicates}</span> duplicados
                </p>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={autoSelectDuplicates}>
                  Seleccionar duplicados automáticamente
                </Button>
              </div>

              {selectedIds.size > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    {deleting ? "Eliminando..." : "Eliminar seleccionados"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                    Cancelar
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                {duplicateGroups.map(group => (
                  <div key={group.key} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{group.grupo}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(group.fecha)}</span>
                      <span className="text-sm font-medium text-foreground truncate flex-1">{group.titulo}</span>
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                        ×{group.items.length}
                      </Badge>
                    </div>
                    <div className="space-y-1 pl-1">
                      {group.items.map((item, idx) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                        >
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleId(item.id)}
                          />
                          <span className={`flex-1 ${idx === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                            {idx === 0 ? "Original" : `Duplicado ${idx}`}
                          </span>
                          <span className="text-muted-foreground">
                            {item.visible ? "Visible" : "Oculto"}
                          </span>
                          <span className="text-muted-foreground capitalize">{item.tipo || "—"}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DuplicatesDrawer;
