import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Addon {
  id: string;
  event_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  currency: string;
  tipo: string;
  max_por_participante: number | null;
  stock_total: number | null;
  activo: boolean;
  sort_order: number;
}

interface Props {
  eventId: string;
  eventCurrency: string;
}

const emptyDraft = (currency: string) => ({
  nombre: "",
  descripcion: "",
  precio: "",
  currency,
  tipo: "opcional",
  max_por_participante: "1",
  stock_total: "",
});

export const EventAddonsEditor = ({ eventId, eventCurrency }: Props) => {
  const [items, setItems] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(eventCurrency));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_addons" as any)
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error("Error al cargar extras");
    setItems((data as unknown as Addon[]) || []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const addAddon = async () => {
    if (!draft.nombre.trim()) {
      toast.error("Nombre obligatorio");
      return;
    }
    const precio = parseFloat(draft.precio || "0");
    if (isNaN(precio) || precio < 0) {
      toast.error("Precio inválido");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("event_addons" as any).insert({
      event_id: eventId,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      precio,
      currency: draft.currency,
      tipo: draft.tipo,
      max_por_participante: draft.max_por_participante ? parseInt(draft.max_por_participante) : 1,
      stock_total: draft.stock_total ? parseInt(draft.stock_total) : null,
      sort_order: items.length,
      activo: true,
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Extra agregado");
    setDraft(emptyDraft(eventCurrency));
    load();
  };

  const toggleActive = async (a: Addon) => {
    const { error } = await supabase.from("event_addons" as any)
      .update({ activo: !a.activo }).eq("id", a.id);
    if (error) { toast.error("Error: " + error.message); return; }
    load();
  };

  const remove = async (a: Addon) => {
    if (!confirm(`¿Eliminar "${a.nombre}"? Si ya hay participantes que lo contrataron no podrás eliminarlo.`)) return;
    const { error } = await supabase.from("event_addons" as any).delete().eq("id", a.id);
    if (error) { toast.error("No se puede eliminar: ya hay reservas con este extra."); return; }
    toast.success("Extra eliminado");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-violet-400" />
        <h4 className="text-sm font-heading uppercase tracking-wider">Extras del viaje</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Adicionales contratables por participante (habitación individual, alquiler de bicicleta, etc.).
        El total de la reserva se recalcula automáticamente.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Sin extras configurados.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className={`flex items-center gap-2 p-2 rounded-lg border border-border/50 ${a.activo ? "" : "opacity-50"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.nombre}</span>
                  <Badge variant="outline" className="text-[10px] h-5">{a.tipo}</Badge>
                  <span className="text-xs text-muted-foreground">{formatPrice(a.precio, a.currency as any)}</span>
                  {a.stock_total != null && <span className="text-[10px] text-muted-foreground">stock: {a.stock_total}</span>}
                  {a.max_por_participante && a.max_por_participante > 1 && (
                    <span className="text-[10px] text-muted-foreground">máx/persona: {a.max_por_participante}</span>
                  )}
                </div>
                {a.descripcion && <p className="text-[11px] text-muted-foreground truncate">{a.descripcion}</p>}
              </div>
              <Switch checked={a.activo} onCheckedChange={() => toggleActive(a)} />
              <Button size="icon" variant="ghost" onClick={() => remove(a)} className="h-7 w-7">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/20">
        <p className="text-xs font-medium">Agregar extra</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nombre *</Label>
            <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} placeholder="Ej: Habitación individual" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Textarea rows={2} value={draft.descripcion} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Precio</Label>
            <Input type="number" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Moneda</Label>
            <Select value={draft.currency} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">ARS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={draft.tipo} onValueChange={(v) => setDraft({ ...draft, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opcional">Opcional</SelectItem>
                <SelectItem value="incluido">Incluido</SelectItem>
                <SelectItem value="obligatorio">Obligatorio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máx. por persona</Label>
            <Input type="number" value={draft.max_por_participante} onChange={(e) => setDraft({ ...draft, max_por_participante: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stock total (opcional)</Label>
            <Input type="number" value={draft.stock_total} onChange={(e) => setDraft({ ...draft, stock_total: e.target.value })} placeholder="Sin límite" />
          </div>
        </div>
        <Button size="sm" onClick={addAddon} disabled={saving} className="gap-1 w-full">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Agregar extra
        </Button>
      </div>
    </div>
  );
};

export default EventAddonsEditor;
