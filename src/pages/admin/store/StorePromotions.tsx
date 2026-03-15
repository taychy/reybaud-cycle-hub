import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface QuickAccess {
  id: string;
  name: string;
  icon: string;
  filter_tag: string | null;
  sort_order: number;
  active: boolean;
}

const StorePromotions = () => {
  const [items, setItems] = useState<QuickAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<QuickAccess> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Also show featured products
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);

  const load = async () => {
    const [qaRes, fpRes] = await Promise.all([
      supabase.from("store_quick_access").select("*").order("sort_order"),
      supabase.from("store_products").select("id, name, image_url, featured, featured_order").eq("featured", true).order("featured_order"),
    ]);
    setItems((qaRes.data as any[]) || []);
    setFeaturedProducts(fpRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editItem?.name) return;
    setSaving(true);
    const payload = { name: editItem.name, icon: editItem.icon || "Tag", filter_tag: editItem.filter_tag || null, sort_order: editItem.sort_order ?? items.length, active: editItem.active ?? true };
    if (editItem.id) {
      await supabase.from("store_quick_access").update(payload as any).eq("id", editItem.id);
    } else {
      await supabase.from("store_quick_access").insert(payload as any);
    }
    setSaving(false);
    setDialogOpen(false);
    toast({ title: "Guardado" });
    load();
  };

  const toggleActive = async (item: QuickAccess) => {
    await supabase.from("store_quick_access").update({ active: !item.active } as any).eq("id", item.id);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("store_quick_access").delete().eq("id", id);
    toast({ title: "Eliminado" });
    load();
  };

  const removeFeatured = async (productId: string) => {
    await supabase.from("store_products").update({ featured: false, featured_order: null } as any).eq("id", productId);
    toast({ title: "Producto removido de destacados" });
    load();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* Quick access */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Accesos Rápidos</h1>
          <Button onClick={() => { setEditItem({ name: "", icon: "Tag", active: true }); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground w-8">{item.sort_order}</span>
              <div className="flex-1">
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">Icono: {item.icon} · Filtro: {item.filter_tag || "—"}</p>
              </div>
              <Switch checked={item.active} onCheckedChange={() => toggleActive(item)} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditItem(item); setDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
          {items.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay accesos rápidos</div>}
        </div>
      </div>

      {/* Featured products */}
      <div className="space-y-4">
        <h2 className="text-xl font-heading font-bold">Productos Destacados</h2>
        <p className="text-sm text-muted-foreground">Los productos marcados como destacados aparecen en la sección principal de la tienda. Podés gestionarlos desde la sección Productos.</p>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {featuredProducts.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3">
              <div className="w-10 h-10 rounded bg-secondary overflow-hidden shrink-0">
                {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <p className="flex-1 font-medium text-foreground">{p.name}</p>
              <span className="text-xs text-muted-foreground">Orden: {p.featured_order ?? "—"}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFeatured(p.id)} className="text-destructive text-xs">Quitar</Button>
            </div>
          ))}
          {featuredProducts.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay productos destacados. Marcalos desde la sección Productos.</div>}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editItem?.id ? "Editar acceso" : "Nuevo acceso"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Nombre</label><Input value={editItem?.name || ""} onChange={(e) => setEditItem((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Icono (lucide)</label><Input value={editItem?.icon || ""} onChange={(e) => setEditItem((p) => ({ ...p, icon: e.target.value }))} placeholder="Tag, Percent, Star..." /></div>
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Filtro (tag de producto)</label><Input value={editItem?.filter_tag || ""} onChange={(e) => setEditItem((p) => ({ ...p, filter_tag: e.target.value }))} placeholder="OFERTA, NUEVO..." /></div>
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Orden</label><Input type="number" value={editItem?.sort_order ?? 0} onChange={(e) => setEditItem((p) => ({ ...p, sort_order: Number(e.target.value) }))} /></div>
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

export default StorePromotions;
