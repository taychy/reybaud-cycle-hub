import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, BedDouble } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface PackageRow {
  id: string;
  event_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  sena: number | null;
  currency: string;
  cupo: number | null;
  sort_order: number;
  activo: boolean;
}

interface Props {
  eventId: string;
  eventCurrency: string;
}

const emptyDraft = (currency: string) => ({
  nombre: "",
  descripcion: "",
  precio: "",
  sena: "",
  currency,
  cupo: "",
});

export const EventPackagesEditor = ({ eventId, eventCurrency }: Props) => {
  const [items, setItems] = useState<PackageRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(eventCurrency));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_packages" as any)
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error("Error al cargar paquetes");
    const rows = (data as unknown as PackageRow[]) || [];
    setItems(rows);

    // Contar reservas activas por paquete
    if (rows.length > 0) {
      const { data: reservas } = await supabase
        .from("event_reservations" as any)
        .select("package_id, reservation_status")
        .eq("event_id", eventId)
        .not("package_id", "is", null);
      const map: Record<string, number> = {};
      ((reservas as any[]) || []).forEach((r) => {
        if (r.reservation_status === "cancelada") return;
        if (!r.package_id) return;
        map[r.package_id] = (map[r.package_id] || 0) + 1;
      });
      setCounts(map);
    } else {
      setCounts({});
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const addPackage = async () => {
    if (!draft.nombre.trim()) {
      toast.error("Nombre obligatorio");
      return;
    }
    const precio = parseFloat(draft.precio || "0");
    if (isNaN(precio) || precio < 0) {
      toast.error("Precio inválido");
      return;
    }
    const sena = draft.sena ? parseFloat(draft.sena) : null;
    if (sena != null && (isNaN(sena) || sena < 0)) {
      toast.error("Seña inválida");
      return;
    }
    const cupo = draft.cupo ? parseInt(draft.cupo) : null;
    if (cupo != null && (isNaN(cupo) || cupo < 0)) {
      toast.error("Cupo inválido");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("event_packages" as any).insert({
      event_id: eventId,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      precio,
      sena,
      currency: draft.currency,
      cupo,
      sort_order: items.length,
      activo: true,
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Paquete agregado");
    setDraft(emptyDraft(eventCurrency));
    load();
  };

  const toggleActive = async (p: PackageRow) => {
    const { error } = await supabase.from("event_packages" as any)
      .update({ activo: !p.activo }).eq("id", p.id);
    if (error) { toast.error("Error: " + error.message); return; }
    load();
  };

  const remove = async (p: PackageRow) => {
    if ((counts[p.id] || 0) > 0) {
      toast.error("No se puede eliminar: ya hay reservas con este paquete. Podés desactivarlo en su lugar.");
      return;
    }
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    const { error } = await supabase.from("event_packages" as any).delete().eq("id", p.id);
    if (error) { toast.error("No se puede eliminar: " + error.message); return; }
    toast.success("Paquete eliminado");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BedDouble className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-heading uppercase tracking-wider">Paquetes / Tipos de habitación</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Definí opciones con distintos precios (ej: habitación doble, single, triple). El alumno elige
        un paquete al reservar y eso determina el precio y la seña. Si no creás ninguno, se usa el
        precio general del evento.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Sin paquetes configurados.</p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const used = counts[p.id] || 0;
            const cupoFull = p.cupo != null && used >= p.cupo;
            return (
              <div key={p.id} className={`flex items-start gap-2 p-2 rounded-lg border border-border/50 ${p.activo ? "" : "opacity-50"}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{formatPrice(p.precio, p.currency as any)}</span>
                    {p.sena != null && (
                      <span className="text-[10px] text-muted-foreground">seña: {formatPrice(p.sena, p.currency as any)}</span>
                    )}
                    {p.cupo != null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cupoFull ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {used}/{p.cupo} reservados
                      </span>
                    )}
                  </div>
                  {p.descripcion && <p className="text-[11px] text-muted-foreground">{p.descripcion}</p>}
                </div>
                <Switch checked={p.activo} onCheckedChange={() => toggleActive(p)} />
                <Button size="icon" variant="ghost" onClick={() => remove(p)} className="h-7 w-7">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/20">
        <p className="text-xs font-medium">Agregar paquete</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nombre *</Label>
            <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} placeholder="Ej: Habitación doble" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Textarea rows={2} value={draft.descripcion} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} placeholder="Qué incluye este paquete" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Precio *</Label>
            <Input type="number" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Seña</Label>
            <Input type="number" value={draft.sena} onChange={(e) => setDraft({ ...draft, sena: e.target.value })} placeholder="Opcional" />
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
            <Label className="text-xs">Cupo (opcional)</Label>
            <Input type="number" value={draft.cupo} onChange={(e) => setDraft({ ...draft, cupo: e.target.value })} placeholder="Sin límite" />
          </div>
        </div>
        <Button size="sm" onClick={addPackage} disabled={saving} className="gap-1 w-full">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Agregar paquete
        </Button>
      </div>
    </div>
  );
};

export default EventPackagesEditor;
