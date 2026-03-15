import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, GripVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
}

const StoreCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from("store_categories").select("*").order("sort_order");
    setCategories((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editCat?.name) return;
    setSaving(true);
    const payload = { name: editCat.name, icon: editCat.icon || "🏷️", sort_order: editCat.sort_order ?? categories.length, active: editCat.active ?? true };
    if (editCat.id) {
      await supabase.from("store_categories").update(payload as any).eq("id", editCat.id);
    } else {
      await supabase.from("store_categories").insert(payload as any);
    }
    setSaving(false);
    setDialogOpen(false);
    toast({ title: editCat.id ? "Categoría actualizada" : "Categoría creada" });
    load();
  };

  const toggleActive = async (cat: Category) => {
    await supabase.from("store_categories").update({ active: !cat.active } as any).eq("id", cat.id);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("store_categories").delete().eq("id", id);
    toast({ title: "Categoría eliminada" });
    load();
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const items = [...categories];
    const tmp = items[idx].sort_order;
    await Promise.all([
      supabase.from("store_categories").update({ sort_order: items[idx - 1].sort_order } as any).eq("id", items[idx].id),
      supabase.from("store_categories").update({ sort_order: tmp } as any).eq("id", items[idx - 1].id),
    ]);
    load();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando categorías...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Categorías</h1>
        <Button onClick={() => { setEditCat({ name: "", icon: "🏷️", active: true }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nueva categoría
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
            <button onClick={() => moveUp(idx)} className="text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4" /></button>
            <span className="text-2xl">{cat.icon}</span>
            <div className="flex-1">
              <p className="font-medium text-foreground">{cat.name}</p>
              <p className="text-xs text-muted-foreground">Orden: {cat.sort_order}</p>
            </div>
            <Switch checked={cat.active} onCheckedChange={() => toggleActive(cat)} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditCat(cat); setDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(cat.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        ))}
        {categories.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay categorías</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editCat?.id ? "Editar categoría" : "Nueva categoría"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Nombre</label>
              <Input value={editCat?.name || ""} onChange={(e) => setEditCat((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Icono (emoji)</label>
              <Input value={editCat?.icon || ""} onChange={(e) => setEditCat((p) => ({ ...p, icon: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Orden</label>
              <Input type="number" value={editCat?.sort_order ?? 0} onChange={(e) => setEditCat((p) => ({ ...p, sort_order: Number(e.target.value) }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreCategories;
