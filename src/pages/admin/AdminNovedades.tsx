import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Megaphone, Plus, Pencil, Trash2, Eye, EyeOff, Star, StarOff, Filter } from "lucide-react";

interface EventOpt { id: string; name: string }
interface Announcement {
  id: string;
  event_id: string;
  title: string;
  content: string;
  category: string;
  is_highlighted: boolean;
  visible: boolean;
  sort_order: number;
  published_at: string;
  event_name?: string;
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
  event_id: "",
  title: "",
  content: "",
  category: "general",
  is_highlighted: false,
  visible: true,
  sort_order: 0,
};

const AdminNovedades = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterVisible, setFilterVisible] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: evs }, { data: ann }] = await Promise.all([
      supabase.from("events" as any).select("id, name").order("name"),
      supabase
        .from("event_announcements" as any)
        .select("*, events(name)")
        .order("published_at", { ascending: false }),
    ]);
    setEvents(((evs || []) as unknown) as EventOpt[]);
    setItems(
      ((ann || []) as any[]).map((a) => ({
        ...a,
        event_name: a.events?.name,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, event_id: filterEvent !== "all" ? filterEvent : "" });
    setShowDialog(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      event_id: a.event_id,
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
    if (!form.event_id) {
      toast({ title: "Seleccioná un evento.", variant: "destructive" });
      return;
    }
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
      await supabase.from("event_announcements" as any).insert({ ...form } as any);
    }
    setSaving(false);
    setShowDialog(false);
    toast({ title: editingId ? "Novedad actualizada." : "Novedad creada." });
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("event_announcements" as any).delete().eq("id", id);
    toast({ title: "Novedad eliminada." });
    fetchAll();
  };

  const toggleVisibility = async (a: Announcement) => {
    await supabase
      .from("event_announcements" as any)
      .update({ visible: !a.visible } as any)
      .eq("id", a.id);
    fetchAll();
  };

  const toggleHighlight = async (a: Announcement) => {
    await supabase
      .from("event_announcements" as any)
      .update({ is_highlighted: !a.is_highlighted } as any)
      .eq("id", a.id);
    fetchAll();
  };

  const filtered = items.filter((a) => {
    if (filterEvent !== "all" && a.event_id !== filterEvent) return false;
    if (filterVisible === "visible" && !a.visible) return false;
    if (filterVisible === "ocultas" && a.visible) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Megaphone className="w-7 h-7 text-primary mt-1" />
          <div>
            <h1 className="font-heading text-2xl md:text-3xl">Novedades</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Gestioná los banners que aparecen en el home del alumno. Cada novedad pertenece a un evento.
            </p>
          </div>
        </div>
        <Button variant="gold" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nueva novedad
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filtrar por evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterVisible} onValueChange={setFilterVisible}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="visible">Visibles</SelectItem>
            <SelectItem value="ocultas">Ocultas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} novedad{filtered.length === 1 ? "" : "es"}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay novedades con los filtros actuales.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${!a.visible ? "opacity-50" : ""}`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                  {a.event_name && (
                    <Badge variant="secondary" className="text-[10px]">{a.event_name}</Badge>
                  )}
                  <span className="text-sm font-medium truncate">{a.title}</span>
                  {a.is_highlighted && (
                    <Badge className="bg-primary/20 text-primary text-[10px]">Destacada</Badge>
                  )}
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
                      <AlertDialogAction
                        onClick={() => handleDelete(a.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
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
            <DialogDescription>
              Las novedades visibles aparecen en el banner del home del alumno.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Evento *</Label>
              <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
                <SelectTrigger><SelectValue placeholder="Elegí un evento" /></SelectTrigger>
                <SelectContent>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ej: Punto de encuentro confirmado"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contenido *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
              />
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
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                />
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

export default AdminNovedades;
