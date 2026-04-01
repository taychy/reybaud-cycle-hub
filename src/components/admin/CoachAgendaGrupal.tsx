import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit2, Calendar } from "lucide-react";
import { toast } from "sonner";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface AgendaItem {
  id: string;
  coach_id: string;
  honorario_id: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  grupo: string;
  sede_id: string | null;
  activo: boolean;
  notas: string | null;
}

interface Honorario {
  id: string;
  nombre_concepto: string;
  valor: number;
  coach_id: string | null;
}

interface Sede {
  id: string;
  nombre: string;
}

interface Props {
  coachId: string;
  coachNombre: string;
}

const CoachAgendaGrupal = ({ coachId, coachNombre }: Props) => {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [honorarios, setHonorarios] = useState<Honorario[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<AgendaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<AgendaItem | null>(null);

  const [form, setForm] = useState({
    honorario_id: "",
    dia_semana: 0,
    hora_inicio: "08:00",
    hora_fin: "09:30",
    grupo: "General",
    sede_id: "",
    activo: true,
    notas: "",
  });

  const fetchAll = async () => {
    const [agendaRes, honRes, sedesRes] = await Promise.all([
      supabase.from("agenda_grupal").select("*").eq("coach_id", coachId).order("dia_semana").order("hora_inicio"),
      supabase.from("honorarios").select("id, nombre_concepto, valor, coach_id").eq("activo", true).eq("categoria", "clase"),
      supabase.from("sedes").select("id, nombre").eq("activa", true),
    ]);
    setItems((agendaRes.data as any) || []);
    setHonorarios((honRes.data as any) || []);
    setSedes((sedesRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [coachId]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ honorario_id: "", dia_semana: 0, hora_inicio: "08:00", hora_fin: "09:30", grupo: "General", sede_id: "", activo: true, notas: "" });
    setShowForm(true);
  };

  const openEdit = (item: AgendaItem) => {
    setEditItem(item);
    setForm({
      honorario_id: item.honorario_id || "",
      dia_semana: item.dia_semana,
      hora_inicio: item.hora_inicio.slice(0, 5),
      hora_fin: item.hora_fin.slice(0, 5),
      grupo: item.grupo,
      sede_id: item.sede_id || "",
      activo: item.activo,
      notas: item.notas || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      coach_id: coachId,
      honorario_id: form.honorario_id || null,
      dia_semana: form.dia_semana,
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      grupo: form.grupo,
      sede_id: form.sede_id || null,
      activo: form.activo,
      notas: form.notas || null,
    };

    if (editItem) {
      const { error } = await supabase.from("agenda_grupal").update(payload).eq("id", editItem.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Bloque actualizado");
    } else {
      const { error } = await supabase.from("agenda_grupal").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Bloque agregado");
    }
    setShowForm(false);
    setSaving(false);
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const { error } = await supabase.from("agenda_grupal").delete().eq("id", deleteItem.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Bloque eliminado");
    setDeleteItem(null);
    fetchAll();
  };

  const getHonorarioName = (id: string | null) => {
    if (!id) return "Sin concepto";
    return honorarios.find(h => h.id === id)?.nombre_concepto || "—";
  };

  const getSedeName = (id: string | null) => {
    if (!id) return null;
    return sedes.find(s => s.id === id)?.nombre;
  };

  // Group items by day
  const byDay = DIAS.map((nombre, idx) => ({
    nombre,
    items: items.filter(i => i.dia_semana === idx),
  })).filter(d => d.items.length > 0);

  if (loading) return <p className="text-muted-foreground text-sm py-4">Cargando agenda...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground">
            Agenda Grupal — {coachNombre}
          </h3>
        </div>
        <Button variant="gold" size="sm" onClick={openCreate}>
          <Plus className="w-3 h-3 mr-1" /> Agregar bloque
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">
          No hay bloques de clases grupales asignados.
        </p>
      ) : (
        <div className="space-y-3">
          {byDay.map(day => (
            <div key={day.nombre} className="glass-card rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">{day.nombre}</h4>
              {day.items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium text-foreground whitespace-nowrap">
                      {item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}
                    </span>
                    <Badge variant="secondary" className="text-xs">{getHonorarioName(item.honorario_id)}</Badge>
                    <Badge variant="outline" className="text-xs">{item.grupo}</Badge>
                    {getSedeName(item.sede_id) && (
                      <span className="text-xs text-muted-foreground">{getSedeName(item.sede_id)}</span>
                    )}
                    {!item.activo && <Badge variant="outline" className="text-xs text-destructive border-destructive/50">Inactivo</Badge>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(item)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">
              {editItem ? "Editar bloque" : "Nuevo bloque grupal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Día de la semana</Label>
              <Select value={String(form.dia_semana)} onValueChange={v => setForm({ ...form, dia_semana: Number(v) })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input type="time" value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de clase (concepto honorario)</Label>
              <Select value={form.honorario_id || "none"} onValueChange={v => setForm({ ...form, honorario_id: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {honorarios.map(h => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.nombre_concepto} (${h.valor.toLocaleString("es-AR")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grupo</Label>
              <Input value={form.grupo} onChange={e => setForm({ ...form, grupo: e.target.value })} className="bg-secondary border-border" placeholder="Ej: G1, KDT, Nivel Inicial" />
            </div>
            <div className="space-y-2">
              <Label>Sede</Label>
              <Select value={form.sede_id || "none"} onValueChange={v => setForm({ ...form, sede_id: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sede</SelectItem>
                  {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} className="bg-secondary border-border" placeholder="Observaciones opcionales" rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="gold" disabled={saving} onClick={handleSave}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={open => { if (!open) setDeleteItem(null); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">Eliminar bloque</DialogTitle>
            <DialogDescription>¿Seguro que querés eliminar este bloque de la agenda?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoachAgendaGrupal;
