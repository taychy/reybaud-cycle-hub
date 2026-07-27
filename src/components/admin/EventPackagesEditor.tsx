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
import { Loader2, Plus, Trash2, BedDouble, Pencil, X, Check, ChevronDown, AlertTriangle, Info } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { PackagePaymentPlanEditor } from "./PackagePaymentPlanEditor";
import { PackagePriceStagesEditor } from "./PackagePriceStagesEditor";


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
  sin_alojamiento: boolean;
}

interface RoomRow {
  id: string;
  package_id: string | null;
  capacidad: number;
  genero: "mujeres" | "varones" | "mixto" | null;
}

interface Props {
  eventId: string;
  eventCurrency: string;
  eventTitle?: string;
}

const emptyDraft = (currency: string) => ({
  nombre: "",
  descripcion: "",
  precio: "",
  sena: "",
  currency,
  personas_por_habitacion: "2",
  permite_mixto: false,
  sin_alojamiento: false,
  cupo: "",
});

type GenderCounts = { mujeres: number; varones: number; mixto: number };
type RoomCapacity = { mujeres: number; varones: number; mixto: number; total: number; roomCount: number };

export const EventPackagesEditor = ({ eventId, eventCurrency }: Props) => {
  const [items, setItems] = useState<PackageRow[]>([]);
  const [counts, setCounts] = useState<Record<string, GenderCounts>>({});
  const [roomCapacity, setRoomCapacity] = useState<Record<string, RoomCapacity>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(eventCurrency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft(eventCurrency));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const startEdit = (p: PackageRow) => {
    setEditingId(p.id);
    setEditDraft({
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      precio: String(p.precio ?? ""),
      sena: p.sena != null ? String(p.sena) : "",
      currency: p.currency,
      personas_por_habitacion: String(p.personas_por_habitacion ?? 2),
      permite_mixto: !!p.permite_mixto,
      sin_alojamiento: !!p.sin_alojamiento,
      cupo: p.cupo != null ? String(p.cupo) : "",
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (p: PackageRow) => {
    if (!editDraft.nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    const precio = parseFloat(editDraft.precio || "0");
    if (isNaN(precio) || precio < 0) { toast.error("Precio inválido"); return; }
    const sena = editDraft.sena ? parseFloat(editDraft.sena) : null;
    if (sena != null && (isNaN(sena) || sena < 0)) { toast.error("Seña inválida"); return; }
    const sinAloj = editDraft.sin_alojamiento;
    const personas = sinAloj ? 1 : parseInt(editDraft.personas_por_habitacion || "2", 10);
    if (!sinAloj && (isNaN(personas) || personas < 1)) { toast.error("Personas por habitación inválido"); return; }
    const cupoManual = sinAloj ? parseInt(editDraft.cupo || "0", 10) : null;
    if (sinAloj && (isNaN(cupoManual!) || cupoManual! < 1)) { toast.error("Cupo total obligatorio para paquetes sin alojamiento"); return; }

    setSaving(true);
    const { error } = await supabase.from("event_packages" as any).update({
      nombre: editDraft.nombre.trim(),
      descripcion: editDraft.descripcion.trim() || null,
      precio,
      sena,
      currency: editDraft.currency,
      // cupo manual sólo si es sin alojamiento; sino se calcula desde event_rooms
      cupo: cupoManual,
      cupo_mujeres: null,
      cupo_varones: null,
      cupo_mixto: null,
      personas_por_habitacion: personas,
      permite_mixto: sinAloj ? false : editDraft.permite_mixto,
      sin_alojamiento: sinAloj,
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

    // Habitaciones cargadas en Alojamiento para este evento
    const { data: roomsData } = await supabase
      .from("event_rooms" as any)
      .select("id, package_id, capacidad, genero")
      .eq("event_id", eventId);
    const roomsMap: Record<string, RoomCapacity> = {};
    ((roomsData as unknown as RoomRow[]) || []).forEach((r) => {
      if (!r.package_id) return;
      if (!roomsMap[r.package_id]) roomsMap[r.package_id] = { mujeres: 0, varones: 0, mixto: 0, total: 0, roomCount: 0 };
      const cap = r.capacidad || 0;
      roomsMap[r.package_id].total += cap;
      roomsMap[r.package_id].roomCount += 1;
      if (r.genero === "mujeres") roomsMap[r.package_id].mujeres += cap;
      else if (r.genero === "varones") roomsMap[r.package_id].varones += cap;
      else if (r.genero === "mixto") roomsMap[r.package_id].mixto += cap;
    });
    setRoomCapacity(roomsMap);

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
        else map[r.package_id].mixto += 1; // mixta o sin género (sin alojamiento)
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
    const sinAloj = draft.sin_alojamiento;
    const personas = sinAloj ? 1 : parseInt(draft.personas_por_habitacion || "2", 10);
    if (!sinAloj && (isNaN(personas) || personas < 1)) { toast.error("Personas por habitación inválido"); return; }
    const cupoManual = sinAloj ? parseInt(draft.cupo || "0", 10) : null;
    if (sinAloj && (isNaN(cupoManual!) || cupoManual! < 1)) { toast.error("Cupo total obligatorio para paquetes sin alojamiento"); return; }

    setSaving(true);
    const { error } = await supabase.from("event_packages" as any).insert({
      event_id: eventId,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      precio,
      sena,
      currency: draft.currency,
      cupo: cupoManual,
      cupo_mujeres: null,
      cupo_varones: null,
      cupo_mixto: null,
      sort_order: items.length,
      activo: true,
      personas_por_habitacion: personas,
      permite_mixto: sinAloj ? false : draft.permite_mixto,
      sin_alojamiento: sinAloj,
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(sinAloj
      ? "Paquete agregado. Se vende con el cupo manual definido."
      : "Paquete agregado. Ahora cargá sus habitaciones desde el módulo Alojamiento.");
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

  const renderCapacityLine = (
    label: string,
    used: number,
    cap: number,
    tone: "rose" | "sky" | "violet",
  ) => {
    if (cap <= 0) return null;
    const full = used >= cap;
    const tones = {
      rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${full ? "bg-destructive/15 text-destructive border-destructive/30" : tones[tone]}`}>
        {label}: {used}/{cap}
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
        Configurá tipos de habitación con su precio. El <strong>cupo se calcula automáticamente</strong> a
        partir de las habitaciones cargadas en el módulo <strong>Alojamiento</strong> del panel de reservas.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Sin paquetes configurados.</p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const c = counts[p.id] || { mujeres: 0, varones: 0, mixto: 0 };
            const cap = roomCapacity[p.id];
            const hasRooms = !!cap && cap.total > 0;
            const totalUsed = c.mujeres + c.varones + c.mixto;
            if (editingId === p.id) {
              return (
                <div key={p.id} className="rounded-lg border border-primary/50 p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-primary">Editando paquete</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Nombre *</Label>
                      <Input value={editDraft.nombre} onChange={(e) => setEditDraft({ ...editDraft, nombre: e.target.value })} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Descripción</Label>
                      <Textarea rows={2} value={editDraft.descripcion} onChange={(e) => setEditDraft({ ...editDraft, descripcion: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Precio *</Label>
                      <Input type="number" value={editDraft.precio} onChange={(e) => setEditDraft({ ...editDraft, precio: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Seña</Label>
                      <Input type="number" value={editDraft.sena} onChange={(e) => setEditDraft({ ...editDraft, sena: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Moneda</Label>
                      <Select value={editDraft.currency} onValueChange={(v) => setEditDraft({ ...editDraft, currency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ARS">ARS</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 pt-1 rounded-md border border-primary/30 bg-primary/5 p-2">
                      <Switch checked={editDraft.sin_alojamiento} onCheckedChange={(v) => setEditDraft({ ...editDraft, sin_alojamiento: v })} />
                      <Label className="text-xs">Sin alojamiento (ej. día ciclista) — cupo manual, no requiere habitaciones</Label>
                    </div>
                    {editDraft.sin_alojamiento ? (
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Cupo total *</Label>
                        <Input type="number" min="1" value={editDraft.cupo} onChange={(e) => setEditDraft({ ...editDraft, cupo: e.target.value })} placeholder="Cantidad de lugares disponibles" />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Personas / habitación</Label>
                          <Input type="number" min="1" value={editDraft.personas_por_habitacion} onChange={(e) => setEditDraft({ ...editDraft, personas_por_habitacion: e.target.value })} />
                        </div>
                        <div className="col-span-2 flex items-center gap-2 pt-1">
                          <Switch checked={editDraft.permite_mixto} onCheckedChange={(v) => setEditDraft({ ...editDraft, permite_mixto: v })} />
                          <Label className="text-xs text-violet-300">Permitir habitación mixta</Label>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(p)} disabled={saving} className="gap-1 flex-1">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              );
            }
            const isOpen = !!expanded[p.id];
            const isDayOnly = !!p.sin_alojamiento;
            const dayCap = isDayOnly ? (p.cupo ?? 0) : 0;
            const canSell = isDayOnly ? dayCap > 0 : hasRooms;
            return (
              <div key={p.id} className={`rounded-lg border ${canSell ? "border-border/50" : "border-amber-500/40"} ${p.activo ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex-1 min-w-0 space-y-1 text-left hover:bg-muted/20 -m-1 p-1 rounded transition-colors"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : "-rotate-90"}`} />
                      <span className="text-sm font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground">{formatPrice(p.precio, p.currency as any)}</span>
                      {p.sena != null && (
                        <span className="text-[10px] text-muted-foreground">seña: {formatPrice(p.sena, p.currency as any)}</span>
                      )}
                      {isDayOnly ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Sin alojamiento · día
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {p.personas_por_habitacion} {p.personas_por_habitacion === 1 ? "persona" : "personas"}/hab
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pl-5">
                      {isDayOnly ? (
                        canSell ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30">
                            Cupo: {totalUsed}/{dayCap}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Definí un cupo total para poder vender
                          </span>
                        )
                      ) : hasRooms ? (
                        <>
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30">
                            Cupo total: {totalUsed}/{cap!.total} · {cap!.roomCount} {cap!.roomCount === 1 ? "hab." : "habs."}
                          </span>
                          {renderCapacityLine("Mujeres", c.mujeres, cap!.mujeres, "rose")}
                          {renderCapacityLine("Varones", c.varones, cap!.varones, "sky")}
                          {renderCapacityLine("Mixta", c.mixto, cap!.mixto, "violet")}
                        </>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Sin alojamiento cargado — no se puede vender
                        </span>
                      )}
                    </div>
                  </button>
                  <Switch checked={p.activo} onCheckedChange={() => toggleActive(p)} />
                  <Button size="icon" variant="ghost" onClick={() => startEdit(p)} className="h-7 w-7">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p)} className="h-7 w-7">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                {isOpen && (
                  <div className="px-2 pb-2 pl-7 space-y-2 animate-fade-in">
                    {p.descripcion && <p className="text-[11px] text-muted-foreground">{p.descripcion}</p>}
                    <div className="rounded-md border border-border/40 bg-muted/10 p-2 text-[11px] space-y-1">
                      {isDayOnly ? (
                        <>
                          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                            <Info className="w-3 h-3" /> Paquete sin alojamiento — cupo manual
                          </div>
                          <div>Cupo total: <strong>{dayCap}</strong> · Reservado: <strong>{totalUsed}</strong> · Disponible: <strong>{Math.max(dayCap - totalUsed, 0)}</strong></div>
                          <p className="text-muted-foreground/70 italic">Editá el cupo desde el botón de edición del paquete.</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                            <Info className="w-3 h-3" /> Cupo según habitaciones cargadas en Alojamiento
                          </div>
                          {hasRooms ? (
                            <>
                              <div>Capacidad total: <strong>{cap!.total}</strong> plazas en {cap!.roomCount} {cap!.roomCount === 1 ? "habitación" : "habitaciones"}.</div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                                {cap!.mujeres > 0 && <span>Mujeres: <strong className="text-rose-300">{cap!.mujeres}</strong></span>}
                                {cap!.varones > 0 && <span>Varones: <strong className="text-sky-300">{cap!.varones}</strong></span>}
                                {cap!.mixto > 0 && <span>Mixta: <strong className="text-violet-300">{cap!.mixto}</strong></span>}
                              </div>
                            </>
                          ) : (
                            <div className="text-amber-300">
                              Este paquete no tiene alojamiento cargado. No se podrá vender hasta cargar habitaciones vinculadas a este paquete.
                            </div>
                          )}
                          <p className="text-muted-foreground/70 italic">
                            Cargá o editá habitaciones desde el módulo <strong>Alojamiento</strong> del panel de reservas del evento.
                          </p>
                        </>
                      )}
                    </div>
                    <PackagePriceStagesEditor
                      packageId={p.id}
                      packageBasePrice={p.precio}
                      baseCurrency={p.currency}
                    />
                    <PackagePaymentPlanEditor
                      packageId={p.id}
                      packagePrice={p.precio}
                      currency={p.currency}
                    />
                  </div>
                )}
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
          <div className="col-span-2 flex items-center gap-2 pt-1 rounded-md border border-primary/30 bg-primary/5 p-2">
            <Switch checked={draft.sin_alojamiento} onCheckedChange={(v) => setDraft({ ...draft, sin_alojamiento: v })} />
            <Label className="text-xs">Sin alojamiento (ej. día ciclista) — cupo manual, no requiere habitaciones</Label>
          </div>
          {draft.sin_alojamiento ? (
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Cupo total *</Label>
              <Input type="number" min="1" value={draft.cupo} onChange={(e) => setDraft({ ...draft, cupo: e.target.value })} placeholder="Cantidad de lugares disponibles" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Personas / habitación</Label>
                <Input type="number" min="1" value={draft.personas_por_habitacion} onChange={(e) => setDraft({ ...draft, personas_por_habitacion: e.target.value })} />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <Switch checked={draft.permite_mixto} onCheckedChange={(v) => setDraft({ ...draft, permite_mixto: v })} />
                <Label className="text-xs text-violet-300">Permitir habitación mixta</Label>
              </div>
              {draft.permite_mixto && (
                <p className="col-span-2 text-[10px] text-muted-foreground">
                  Quien elija mixta deberá declarar el nombre de sus compañeros/as (grupo cerrado).
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-muted-foreground flex gap-1.5">
          <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            {draft.sin_alojamiento
              ? <>El paquete se venderá con el <strong>cupo total</strong> que definiste. No requiere cargar habitaciones.</>
              : <>El cupo de cada paquete se define cargando habitaciones desde el módulo <strong>Alojamiento</strong> del panel de reservas del evento y vinculándolas a este paquete.</>}
          </span>
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
