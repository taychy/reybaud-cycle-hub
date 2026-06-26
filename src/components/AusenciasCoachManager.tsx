import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Plane } from "lucide-react";
import { toast } from "sonner";

interface Ausencia {
  id: string;
  coach_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  todo_el_dia: boolean;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

interface Props {
  coachId: string;
  coachNombre?: string;
}

const formatFecha = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const AusenciasCoachManager = ({ coachId, coachNombre }: Props) => {
  const [items, setItems] = useState<Ausencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Ausencia | null>(null);

  const [form, setForm] = useState({
    fecha_inicio: todayISO(),
    fecha_fin: todayISO(),
    todo_el_dia: true,
    hora_inicio: "08:00",
    hora_fin: "20:00",
    motivo: "",
  });

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ausencias_coaches" as any)
      .select("*")
      .eq("coach_id", coachId)
      .order("fecha_inicio", { ascending: false });
    setItems(((data as any) || []) as Ausencia[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [coachId]);

  const openCreate = () => {
    setForm({
      fecha_inicio: todayISO(),
      fecha_fin: todayISO(),
      todo_el_dia: true,
      hora_inicio: "08:00",
      hora_fin: "20:00",
      motivo: "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (form.fecha_fin < form.fecha_inicio) {
      toast.error("La fecha de fin no puede ser anterior al inicio");
      return;
    }
    if (!form.todo_el_dia && form.hora_fin <= form.hora_inicio) {
      toast.error("La hora de fin debe ser posterior a la hora de inicio");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = {
      coach_id: coachId,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      todo_el_dia: form.todo_el_dia,
      hora_inicio: form.todo_el_dia ? null : form.hora_inicio,
      hora_fin: form.todo_el_dia ? null : form.hora_fin,
      motivo: form.motivo.trim() || null,
      creado_por: user?.id || null,
    };
    const { error } = await supabase.from("ausencias_coaches" as any).insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ausencia registrada");
    setShowForm(false);
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const { error } = await supabase.from("ausencias_coaches" as any).delete().eq("id", deleteItem.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Ausencia eliminada");
    setDeleteItem(null);
    fetchAll();
  };

  const hoy = todayISO();
  const vigentes = items.filter(i => i.fecha_fin >= hoy);
  const pasadas = items.filter(i => i.fecha_fin < hoy);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground">
            Ausencias / Vacaciones{coachNombre ? ` — ${coachNombre}` : ""}
          </h3>
        </div>
        <Button variant="gold" size="sm" onClick={openCreate}>
          <Plus className="w-3 h-3 mr-1" /> Agregar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Cuando agregás un período acá, el coach deja de aparecer en la turnera durante esas fechas.
      </p>

      {loading ? (
        <p className="text-muted-foreground text-sm py-4">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">
          No hay ausencias cargadas.
        </p>
      ) : (
        <div className="space-y-4">
          {vigentes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Vigentes / próximas</h4>
              {vigentes.map(item => (
                <AusenciaRow key={item.id} item={item} onDelete={() => setDeleteItem(item)} />
              ))}
            </div>
          )}
          {pasadas.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pasadas</h4>
              {pasadas.slice(0, 10).map(item => (
                <AusenciaRow key={item.id} item={item} onDelete={() => setDeleteItem(item)} muted />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">Nueva ausencia</DialogTitle>
            <DialogDescription>Indicá las fechas en las que no vas a estar disponible.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input type="date" value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Todo el día</Label>
              <Switch checked={form.todo_el_dia} onCheckedChange={v => setForm({ ...form, todo_el_dia: v })} />
            </div>
            {!form.todo_el_dia && (
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
            )}
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} className="bg-secondary border-border" placeholder="Vacaciones, evento, etc." rows={2} />
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

      {/* Delete */}
      <Dialog open={!!deleteItem} onOpenChange={open => { if (!open) setDeleteItem(null); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">Eliminar ausencia</DialogTitle>
            <DialogDescription>¿Seguro que querés eliminar este período de ausencia?</DialogDescription>
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

const AusenciaRow = ({ item, onDelete, muted }: { item: Ausencia; onDelete: () => void; muted?: boolean }) => {
  const sameDay = item.fecha_inicio === item.fecha_fin;
  return (
    <div className={`glass-card rounded-lg p-3 flex items-start justify-between gap-2 ${muted ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {sameDay ? formatFecha(item.fecha_inicio) : `${formatFecha(item.fecha_inicio)} → ${formatFecha(item.fecha_fin)}`}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.todo_el_dia ? (
            <Badge variant="secondary" className="text-xs">Día completo</Badge>
          ) : (
            <Badge variant="outline" className="text-xs font-mono">
              {item.hora_inicio?.slice(0, 5)} – {item.hora_fin?.slice(0, 5)}
            </Badge>
          )}
          {item.motivo && <span className="text-xs text-muted-foreground truncate">{item.motivo}</span>}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0" onClick={onDelete}>
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
};

export default AusenciasCoachManager;
