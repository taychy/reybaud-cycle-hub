import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, Plus, Pencil, Trash2, Eye, EyeOff, Star, StarOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_highlighted: boolean;
  visible: boolean;
  sort_order: number;
  published_at: string;
}

interface Props {
  eventId: string;
}

const categories = [
  { value: "general", label: "General" },
  { value: "importante", label: "Importante" },
  { value: "pago", label: "Pago" },
  { value: "logistica", label: "Logística" },
  { value: "documentacion", label: "Documentación" },
  { value: "recorrido", label: "Recorrido" },
];

const emptyForm = {
  title: "",
  content: "",
  category: "general",
  is_highlighted: false,
  visible: true,
  sort_order: 0,
};

const EventAnnouncementsManager = ({ eventId }: Props) => {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    const { data } = await supabase
      .from("event_announcements" as any)
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("published_at", { ascending: false });
    if (data) setAnnouncements(data as any[]);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [eventId]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      content: a.content,
      category: a.category,
      is_highlighted: a.is_highlighted,
      visible: a.visible,
      sort_order: a.sort_order,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Título y contenido son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);

    if (editingId) {
      await supabase
        .from("event_announcements" as any)
        .update({ ...form, updated_at: new Date().toISOString() } as any)
        .eq("id", editingId);
    } else {
      await supabase
        .from("event_announcements" as any)
        .insert({ ...form, event_id: eventId } as any);
    }

    setSaving(false);
    setShowDialog(false);
    toast({ title: editingId ? "Novedad actualizada." : "Novedad creada." });
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("event_announcements" as any).delete().eq("id", id);
    toast({ title: "Novedad eliminada." });
    fetch();
  };

  const toggleVisibility = async (a: Announcement) => {
    await supabase
      .from("event_announcements" as any)
      .update({ visible: !a.visible } as any)
      .eq("id", a.id);
    fetch();
  };

  const toggleHighlight = async (a: Announcement) => {
    await supabase
      .from("event_announcements" as any)
      .update({ is_highlighted: !a.is_highlighted } as any)
      .eq("id", a.id);
    fetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide">Novedades del evento</h3>
        </div>
        <Button variant="gold" size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nueva novedad
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay novedades cargadas.</p>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${!a.visible ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                  <span className="text-sm font-medium truncate">{a.title}</span>
                  {a.is_highlighted && <Badge className="bg-primary/20 text-primary text-[10px]">Destacada</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.content}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(a.published_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleHighlight(a)}>
                  {a.is_highlighted ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleVisibility(a)}>
                  {a.visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(a)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar novedad?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground">
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar novedad" : "Nueva novedad"}</DialogTitle>
            <DialogDescription>Las novedades visibles aparecen en la pantalla del participante.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Punto de encuentro confirmado" />
            </div>
            <div className="space-y-1.5">
              <Label>Contenido *</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Orden</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.visible} onCheckedChange={(v) => setForm({ ...form, visible: v })} />
                <Label className="text-sm">Visible</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_highlighted} onCheckedChange={(v) => setForm({ ...form, is_highlighted: v })} />
                <Label className="text-sm">Destacada</Label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button variant="gold" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear novedad"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventAnnouncementsManager;
