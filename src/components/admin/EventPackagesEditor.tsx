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
import { Loader2, Plus, Trash2, BedDouble, Pencil, X, Check } from "lucide-react";
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
  personas_por_habitacion: number;
  cupo_mujeres: number | null;
  cupo_varones: number | null;
  cupo_mixto: number | null;
  permite_mixto: boolean;
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
  personas_por_habitacion: "2",
  cupo_mujeres: "",
  cupo_varones: "",
  cupo_mixto: "",
  permite_mixto: false,
});

type GenderCounts = { mujeres: number; varones: number; mixto: number };

export const EventPackagesEditor = ({ eventId, eventCurrency }: Props) => {
  const [items, setItems] = useState<PackageRow[]>([]);
  const [counts, setCounts] = useState<Record<string, GenderCounts>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(eventCurrency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft(eventCurrency));

  const startEdit = (p: PackageRow) => {
    setEditingId(p.id);
    setEditDraft({
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      precio: String(p.precio ?? ""),
      sena: p.sena != null ? String(p.sena) : "",
      currency: p.currency,
      personas_por_habitacion: String(p.personas_por_habitacion ?? 2),
      cupo_mujeres: p.cupo_mujeres != null ? String(p.cupo_mujeres) : "",
      cupo_varones: p.cupo_varones != null ? String(p.cupo_varones) : "",
      cupo_mixto: p.cupo_mixto != null ? String(p.cupo_mixto) : "",
      permite_mixto: !!p.permite_mixto,
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (p: PackageRow) => {
    if (!editDraft.nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    const precio = parseFloat(editDraft.precio || "0");
    if (isNaN(precio) || precio < 0) { toast.error("Precio inválido"); return; }
    const sena = editDraft.sena ? parseFloat(editDraft.sena) : null;
    if (sena != null && (isNaN(sena) || sena < 0)) { toast.error("Seña inválida"); return; }
    const personas = parseInt(editDraft.personas_por_habitacion || "2", 10);
    if (isNaN(personas) || personas < 1) { toast.error("Personas por habitación inválido"); return; }
    const parseCupo = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
    const cm = parseCupo(editDraft.cupo_mujeres);
    const cv = parseCupo(editDraft.cupo_varones);
    const cx = parseCupo(editDraft.cupo_mixto);
    for (const c of [cm, cv, cx]) {
      if (c != null && (isNaN(c) || c < 0)) { toast.error("Cupo inválido"); return; }
    }
    const cupoTotal =
      cm == null && cv == null && cx == null
        ? null
        : (cm || 0) + (cv || 0) + (cx || 0);

    setSaving(true);
    const { error } = await supabase.from("event_packages" as any).update({
      nombre: editDraft.nombre.trim(),
      descripcion: editDraft.descripcion.trim() || null,
      precio,
      sena,
      currency: editDraft.currency,
      cupo: cupoTotal,
      personas_por_habitacion: personas,
      cupo_mujeres: cm,
      cupo_varones: cv,
      cupo_mixto: editDraft.permite_mixto ? cx : null,
      permite_mixto: editDraft.permite_mixto,
    }).eq("id", p.id);
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Paquete actualizado");
    setEditingId(null);
    load();
  };

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

    if (rows.length > 0) {
      const { data: reservas } = await supabase
        .from("event_reservations" as any)
        .select("package_id, reservation_status, genero_habitacion")
        .eq("event_id", eventId)
        .not("package_id", "is", null);
      const map: Record<string, GenderCounts> = {};
      ((reservas as any[]) || []).forEach((r) => {
        if (r.reservation_status === "cancelada") return;
        if (!r.package_id) return;
        if (!map[r.package_id]) map[r.package_id] = { mujeres: 0, varones: 0, mixto: 0 };
        if (r.genero_habitacion === "femenina") map[r.package_id].mujeres += 1;
        else if (r.genero_habitacion === "masculina") map[r.package_id].varones += 1;
        else if (r.genero_habitacion === "mixta") map[r.package_id].mixto += 1;
      });
      setCounts(map);
    } else {
      setCounts({});
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const addPackage = async () => {
    if (!draft.nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    const precio = parseFloat(draft.precio || "0");
    if (isNaN(precio) || precio < 0) { toast.error("Precio inválido"); return; }
    const sena = draft.sena ? parseFloat(draft.sena) : null;
    if (sena != null && (isNaN(sena) || sena < 0)) { toast.error("Seña inválida"); return; }
    const personas = parseInt(draft.personas_por_habitacion || "2", 10);
    if (isNaN(personas) || personas < 1) { toast.error("Personas por habitación inválido"); return; }
    const parseCupo = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
    const cm = parseCupo(draft.cupo_mujeres);
    const cv = parseCupo(draft.cupo_varones);
    const cx = parseCupo(draft.cupo_mixto);
    for (const c of [cm, cv, cx]) {
      if (c != null && (isNaN(c) || c < 0)) { toast.error("Cupo inválido"); return; }
    }
    const cupoTotal =
      cm == null && cv == null && cx == null
        ? null
        : (cm || 0) + (cv || 0) + (cx || 0);

    setSaving(true);
    const { error } = await supabase.from("event_packages" as any).insert({
      event_id: eventId,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      precio,
      sena,
      currency: draft.currency,
      cupo: cupoTotal,
      sort_order: items.length,
      activo: true,
      personas_por_habitacion: personas,
      cupo_mujeres: cm,
      cupo_varones: cv,
      cupo_mixto: draft.permite_mixto ? cx : null,
      permite_mixto: draft.permite_mixto,
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
    const used = counts[p.id] ? counts[p.id].mujeres + counts[p.id].varones + counts[p.id].mixto : 0;
    if (used > 0) {
      toast.error("No se puede eliminar: ya hay reservas con este paquete. Podés desactivarlo en su lugar.");
      return;
    }
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    const { error } = await supabase.from("event_packages" as any).delete().eq("id", p.id);
    if (error) { toast.error("No se puede eliminar: " + error.message); return; }
    toast.success("Paquete eliminado");
    load();
  };

  const renderCupoLine = (
    label: string,
    used: number,
    cupo: number | null,
    tone: "rose" | "sky" | "violet",
  ) => {
    if (cupo == null) return null;
    const full = used >= cupo;
    const tones = {
      rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${full ? "bg-destructive/15 text-destructive border-destructive/30" : tones[tone]}`}>
        {label}: {used}/{cupo}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BedDouble className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-heading uppercase tracking-wider">Paquetes / Tipos de habitación</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Configurá tipos de habitación con su precio y cupos separados por género
        (femenina, masculina, mixta). Si no creás ninguno, se usa el precio general del evento.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Sin paquetes configurados.</p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const c = counts[p.id] || { mujeres: 0, varones: 0, mixto: 0 };
            return (
              <div key={p.id} className={`flex items-start gap-2 p-2 rounded-lg border border-border/50 ${p.activo ? "" : "opacity-50"}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{formatPrice(p.precio, p.currency as any)}</span>
                    {p.sena != null && (
                      <span className="text-[10px] text-muted-foreground">seña: {formatPrice(p.sena, p.currency as any)}</span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.personas_por_habitacion} {p.personas_por_habitacion === 1 ? "persona" : "personas"}/hab
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {renderCupoLine("Mujeres", c.mujeres, p.cupo_mujeres, "rose")}
                    {renderCupoLine("Varones", c.varones, p.cupo_varones, "sky")}
                    {p.permite_mixto && renderCupoLine("Mixta", c.mixto, p.cupo_mixto, "violet")}
                    {p.cupo_mujeres == null && p.cupo_varones == null && p.cupo_mixto == null && (
                      <span className="text-[10px] text-muted-foreground italic">Sin cupos definidos</span>
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
            <p className="text-[10px] text-muted-foreground/80 italic">
              Si el evento tiene cuotas configuradas, la <strong>1ª cuota actúa como seña</strong> al pagar por Mercado Pago — este campo queda como referencia informativa.
            </p>
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
            <Label className="text-xs">Personas / habitación</Label>
            <Input type="number" min="1" value={draft.personas_por_habitacion} onChange={(e) => setDraft({ ...draft, personas_por_habitacion: e.target.value })} />
          </div>
        </div>

        <div className="pt-2 border-t border-border/40 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cupos por género</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-rose-300">Cupo mujeres</Label>
              <Input type="number" value={draft.cupo_mujeres} onChange={(e) => setDraft({ ...draft, cupo_mujeres: e.target.value })} placeholder="Sin límite" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sky-300">Cupo varones</Label>
              <Input type="number" value={draft.cupo_varones} onChange={(e) => setDraft({ ...draft, cupo_varones: e.target.value })} placeholder="Sin límite" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={draft.permite_mixto} onCheckedChange={(v) => setDraft({ ...draft, permite_mixto: v })} />
              <Label className="text-xs text-violet-300">Permitir habitación mixta</Label>
            </div>
            {draft.permite_mixto && (
              <Input
                type="number"
                value={draft.cupo_mixto}
                onChange={(e) => setDraft({ ...draft, cupo_mixto: e.target.value })}
                placeholder="Cupo mixta"
                className="w-32"
              />
            )}
          </div>
          {draft.permite_mixto && (
            <p className="text-[10px] text-muted-foreground">
              Quien elija mixta deberá declarar el nombre de sus compañeros/as (grupo cerrado).
            </p>
          )}
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
