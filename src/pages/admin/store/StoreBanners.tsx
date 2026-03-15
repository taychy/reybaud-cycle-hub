import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  button_text: string | null;
  link_url: string | null;
  image_url: string | null;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
}

const StoreBanners = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBanner, setEditBanner] = useState<Partial<Banner> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from("store_banners").select("*").order("sort_order");
    setBanners((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editBanner?.title) return;
    setSaving(true);
    const payload = {
      title: editBanner.title,
      subtitle: editBanner.subtitle || null,
      button_text: editBanner.button_text || null,
      link_url: editBanner.link_url || null,
      image_url: editBanner.image_url || null,
      active: editBanner.active ?? true,
      start_date: editBanner.start_date || null,
      end_date: editBanner.end_date || null,
      sort_order: editBanner.sort_order ?? 0,
    };
    if (editBanner.id) {
      await supabase.from("store_banners").update(payload as any).eq("id", editBanner.id);
    } else {
      await supabase.from("store_banners").insert(payload as any);
    }
    setSaving(false);
    setDialogOpen(false);
    toast({ title: editBanner.id ? "Banner actualizado" : "Banner creado" });
    load();
  };

  const toggleActive = async (b: Banner) => {
    await supabase.from("store_banners").update({ active: !b.active } as any).eq("id", b.id);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("store_banners").delete().eq("id", id);
    toast({ title: "Banner eliminado" });
    load();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando banners...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Banners</h1>
        <Button onClick={() => { setEditBanner({ title: "", active: true, sort_order: banners.length }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Crear banner
        </Button>
      </div>

      <div className="grid gap-4">
        {banners.map((b) => (
          <div key={b.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col sm:flex-row">
            <div className="w-full sm:w-48 h-32 bg-secondary flex items-center justify-center overflow-hidden shrink-0">
              {b.image_url ? <img src={b.image_url} className="w-full h-full object-cover" /> : <Image className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-1">
                <h3 className="font-heading font-bold text-foreground">{b.title}</h3>
                {b.subtitle && <p className="text-sm text-muted-foreground">{b.subtitle}</p>}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {b.start_date && <span>Desde: {b.start_date}</span>}
                  {b.end_date && <span>Hasta: {b.end_date}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={b.active} onCheckedChange={() => toggleActive(b)} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditBanner(b); setDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(b.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">No hay banners creados</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editBanner?.id ? "Editar banner" : "Crear banner"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Título *</label><Input value={editBanner?.title || ""} onChange={(e) => setEditBanner((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><label className="text-xs font-heading uppercase text-muted-foreground">Subtítulo</label><Input value={editBanner?.subtitle || ""} onChange={(e) => setEditBanner((p) => ({ ...p, subtitle: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-heading uppercase text-muted-foreground">Texto del botón</label><Input value={editBanner?.button_text || ""} onChange={(e) => setEditBanner((p) => ({ ...p, button_text: e.target.value }))} /></div>
              <div><label className="text-xs font-heading uppercase text-muted-foreground">Link destino</label><Input value={editBanner?.link_url || ""} onChange={(e) => setEditBanner((p) => ({ ...p, link_url: e.target.value }))} /></div>
            </div>
            <div><label className="text-xs font-heading uppercase text-muted-foreground">URL de imagen</label><Input value={editBanner?.image_url || ""} onChange={(e) => setEditBanner((p) => ({ ...p, image_url: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-heading uppercase text-muted-foreground">Fecha inicio</label><Input type="date" value={editBanner?.start_date || ""} onChange={(e) => setEditBanner((p) => ({ ...p, start_date: e.target.value }))} /></div>
              <div><label className="text-xs font-heading uppercase text-muted-foreground">Fecha fin</label><Input type="date" value={editBanner?.end_date || ""} onChange={(e) => setEditBanner((p) => ({ ...p, end_date: e.target.value }))} /></div>
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

export default StoreBanners;
