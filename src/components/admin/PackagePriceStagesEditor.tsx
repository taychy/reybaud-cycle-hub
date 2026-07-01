import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, TrendingUp, ChevronDown, Copy } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import type { PriceStage } from "@/lib/priceStages";


interface Props {
  packageId: string;
  packageBasePrice: number;
  baseCurrency: string;
}

interface Draft {
  nombre: string;
  precio: string;
  currency: string;
  vigente_desde: string; // datetime-local
  vigente_hasta: string; // datetime-local (optional)
  incremento_pct: string; // referencia visual
}

const emptyDraft = (currency: string): Draft => ({
  nombre: "",
  precio: "",
  currency,
  vigente_desde: "",
  vigente_hasta: "",
  incremento_pct: "",
});

// datetime-local string ("YYYY-MM-DDTHH:MM") to ISO assuming local TZ
const localToISO = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
};
const isoToLocal = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const PackagePriceStagesEditor = ({ packageId, packageBasePrice, baseCurrency }: Props) => {
  const [items, setItems] = useState<PriceStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(baseCurrency));
  const [open, setOpen] = useState(false);

  // Propagación a otros paquetes del mismo evento
  interface SiblingPkg { id: string; nombre: string; precio: number; currency: string; lastStagePrice: number; computedPrice: number; selected: boolean; }
  const [propagateOpen, setPropagateOpen] = useState(false);
  const [siblings, setSiblings] = useState<SiblingPkg[]>([]);
  const [lastAdded, setLastAdded] = useState<{ nombre: string; desde: string; hasta: string | null; pct: number | null; precio: number; currency: string } | null>(null);
  const [propagating, setPropagating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase

      .from("event_package_price_stages" as any)
      .select("*")
      .eq("package_id", packageId)
      .order("vigente_desde", { ascending: true });
    if (error) toast.error("Error al cargar etapas: " + error.message);
    setItems(((data as any[]) || []).map((r) => ({
      ...r,
      precio: Number(r.precio),
      incremento_pct: r.incremento_pct != null ? Number(r.incremento_pct) : null,
    })) as PriceStage[]);
    setLoading(false);
  }, [packageId]);

  useEffect(() => { load(); }, [load]);

  const previousStagePrice = (): number => {
    if (items.length > 0) return items[items.length - 1].precio;
    return packageBasePrice;
  };

  const applyPctToPrice = (pctStr: string) => {
    const pct = parseFloat(pctStr);
    if (isNaN(pct)) return;
    const base = previousStagePrice();
    const nuevo = Math.round(base * (1 + pct / 100));
    setDraft((d) => ({ ...d, precio: String(nuevo), incremento_pct: pctStr }));
  };

  const addStage = async () => {
    if (!draft.nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    const precio = parseFloat(draft.precio);
    if (isNaN(precio) || precio < 0) { toast.error("Precio inválido"); return; }
    const desde = localToISO(draft.vigente_desde);
    if (!desde) { toast.error("Fecha de inicio inválida"); return; }
    const hasta = draft.vigente_hasta ? localToISO(draft.vigente_hasta) : null;
    if (draft.vigente_hasta && !hasta) { toast.error("Fecha de fin inválida"); return; }
    if (hasta && new Date(hasta).getTime() <= new Date(desde).getTime()) {
      toast.error("La fecha de fin debe ser posterior al inicio");
      return;
    }
    const pct = draft.incremento_pct ? parseFloat(draft.incremento_pct) : null;

    setSaving(true);
    const { error } = await supabase.from("event_package_price_stages" as any).insert({
      package_id: packageId,
      nombre: draft.nombre.trim(),
      precio,
      currency: draft.currency,
      vigente_desde: desde,
      vigente_hasta: hasta,
      incremento_pct: pct != null && !isNaN(pct) ? pct : null,
      sort_order: items.length,
      activo: true,
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Etapa agregada");
    const addedInfo = {
      nombre: draft.nombre.trim(),
      desde, hasta,
      pct: pct != null && !isNaN(pct) ? pct : null,
      precio, currency: draft.currency,
    };
    setDraft(emptyDraft(baseCurrency));
    load();
    // Ofrecer propagar a otros paquetes del mismo evento
    await offerPropagate(addedInfo);
  };

  const offerPropagate = async (added: NonNullable<typeof lastAdded>) => {
    // 1) Buscar event_id del paquete actual
    const { data: pkg } = await supabase
      .from("event_packages")
      .select("event_id")
      .eq("id", packageId)
      .maybeSingle();
    const eventId = (pkg as any)?.event_id;
    if (!eventId) return;

    // 2) Buscar hermanos activos
    const { data: sibs } = await supabase
      .from("event_packages")
      .select("id, nombre, precio, currency, activo")
      .eq("event_id", eventId)
      .neq("id", packageId)
      .eq("activo", true)
      .order("sort_order", { ascending: true });
    const list = (sibs || []) as any[];
    if (list.length === 0) return;

    // 3) Para cada hermano: última etapa (o precio base) → aplicar % (o precio absoluto)
    const sibIds = list.map((s) => s.id);
    const { data: sibStages } = await supabase
      .from("event_package_price_stages" as any)
      .select("package_id, precio, vigente_desde")
      .in("package_id", sibIds)
      .order("vigente_desde", { ascending: false });
    const lastByPkg = new Map<string, number>();
    for (const st of (sibStages as any[]) || []) {
      if (!lastByPkg.has(st.package_id)) lastByPkg.set(st.package_id, Number(st.precio));
    }

    const built: SiblingPkg[] = list.map((s) => {
      const basePrice = lastByPkg.get(s.id) ?? Number(s.precio);
      const computed = added.pct != null
        ? Math.round(basePrice * (1 + added.pct / 100))
        : added.precio;
      return {
        id: s.id,
        nombre: s.nombre,
        precio: Number(s.precio),
        currency: s.currency,
        lastStagePrice: basePrice,
        computedPrice: computed,
        selected: true,
      };
    });

    setSiblings(built);
    setLastAdded(added);
    setPropagateOpen(true);
  };

  const propagateNow = async () => {
    if (!lastAdded) return;
    const selected = siblings.filter((s) => s.selected);
    if (selected.length === 0) { setPropagateOpen(false); return; }
    setPropagating(true);
    const rows = selected.map((s) => ({
      package_id: s.id,
      nombre: lastAdded.nombre,
      precio: s.computedPrice,
      currency: s.currency, // respeta la moneda propia del paquete
      vigente_desde: lastAdded.desde,
      vigente_hasta: lastAdded.hasta,
      incremento_pct: lastAdded.pct,
      sort_order: 999,
      activo: true,
    }));
    const { error } = await supabase.from("event_package_price_stages" as any).insert(rows);
    setPropagating(false);
    if (error) { toast.error("Error propagando: " + error.message); return; }
    toast.success(`Etapa copiada a ${selected.length} paquete${selected.length === 1 ? "" : "s"}`);
    setPropagateOpen(false);
    setLastAdded(null);
    setSiblings([]);
  };


  const toggleActive = async (s: PriceStage) => {
    const { error } = await supabase.from("event_package_price_stages" as any)
      .update({ activo: !s.activo }).eq("id", s.id);
    if (error) { toast.error("Error: " + error.message); return; }
    load();
  };

  const remove = async (s: PriceStage) => {
    if (!confirm(`¿Eliminar etapa "${s.nombre}"?`)) return;
    const { error } = await supabase.from("event_package_price_stages" as any).delete().eq("id", s.id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Etapa eliminada");
    load();
  };

  const updateField = async (s: PriceStage, patch: Partial<PriceStage>) => {
    const { error } = await supabase.from("event_package_price_stages" as any).update(patch).eq("id", s.id);
    if (error) { toast.error("Error: " + error.message); return; }
    load();
  };

  const now = Date.now();
  const isActiveNow = (s: PriceStage) => {
    if (!s.activo) return false;
    const d = new Date(s.vigente_desde).getTime();
    const h = s.vigente_hasta ? new Date(s.vigente_hasta).getTime() : null;
    return d <= now && (h == null || h > now);
  };

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-border/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left hover:opacity-80 transition"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <div>
            <p className="text-xs font-medium">Etapas de precio</p>
            <p className="text-[10px] text-muted-foreground">
              {items.length === 0
                ? "Sin etapas. Se usa el precio base del paquete."
                : `${items.length} etapa${items.length === 1 ? "" : "s"} configurada${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="space-y-2 animate-fade-in">
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Sin etapas configuradas.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((s) => {
                const active = isActiveNow(s);
                return (
                  <div key={s.id} className={`rounded-md border p-2 ${active ? "border-primary/60 bg-primary/5" : "border-border/40 bg-card/40"} ${!s.activo ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{s.nombre}</span>
                      {active && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">VIGENTE</span>}
                      {s.incremento_pct != null && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">+{s.incremento_pct}%</span>
                      )}
                      <span className="text-xs text-primary font-semibold ml-auto">{formatPrice(s.precio, s.currency as any)}</span>
                      <Switch checked={s.activo} onCheckedChange={() => toggleActive(s)} />
                      <Button size="icon" variant="ghost" onClick={() => remove(s)} className="h-6 w-6">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-muted-foreground">Desde</Label>
                        <Input
                          type="datetime-local"
                          defaultValue={isoToLocal(s.vigente_desde)}
                          onBlur={(e) => {
                            const iso = localToISO(e.target.value);
                            if (iso && iso !== s.vigente_desde) updateField(s, { vigente_desde: iso });
                          }}
                          className="h-7 text-[11px]"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-muted-foreground">Hasta (opcional)</Label>
                        <Input
                          type="datetime-local"
                          defaultValue={isoToLocal(s.vigente_hasta)}
                          onBlur={(e) => {
                            const iso = e.target.value ? localToISO(e.target.value) : null;
                            if (iso !== s.vigente_hasta) updateField(s, { vigente_hasta: iso });
                          }}
                          className="h-7 text-[11px]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-md border border-dashed border-border/40 p-2 space-y-2 bg-muted/10">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Agregar etapa</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5 col-span-2">
                <Label className="text-[10px]">Nombre *</Label>
                <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} placeholder="Ej: Etapa 2 - Julio" className="h-7 text-[11px]" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Vigente desde *</Label>
                <Input type="datetime-local" value={draft.vigente_desde} onChange={(e) => setDraft({ ...draft, vigente_desde: e.target.value })} className="h-7 text-[11px]" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Vigente hasta</Label>
                <Input type="datetime-local" value={draft.vigente_hasta} onChange={(e) => setDraft({ ...draft, vigente_hasta: e.target.value })} className="h-7 text-[11px]" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">% sobre etapa anterior</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={draft.incremento_pct}
                  onChange={(e) => applyPctToPrice(e.target.value)}
                  placeholder="Ej: 10"
                  className="h-7 text-[11px]"
                />
                <p className="text-[9px] text-muted-foreground/80">Base: {formatPrice(previousStagePrice(), baseCurrency as any)}</p>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Precio final *</Label>
                <Input type="number" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value, incremento_pct: "" })} className="h-7 text-[11px]" />
              </div>
              <div className="space-y-0.5 col-span-2">
                <Label className="text-[10px]">Moneda</Label>
                <Select value={draft.currency} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
                  <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" onClick={addStage} disabled={saving} className="w-full gap-1 h-7 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Agregar etapa
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            La etapa <strong>vigente</strong> reemplaza el precio del paquete en la app del alumno y en el flujo de reserva.
            Si no hay etapa vigente, se usa el precio base del paquete.
          </p>
        </div>
      )}

      <Dialog open={propagateOpen} onOpenChange={(v) => !propagating && setPropagateOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-4 h-4" /> ¿Copiar esta etapa a otros paquetes?
            </DialogTitle>
          </DialogHeader>
          {lastAdded && (
            <div className="text-xs text-muted-foreground mb-2">
              Etapa <b>"{lastAdded.nombre}"</b> desde {new Date(lastAdded.desde).toLocaleString("es-AR")}
              {lastAdded.pct != null
                ? <> · <span className="text-amber-600">+{lastAdded.pct}%</span> sobre la última etapa de cada paquete</>
                : <> · precio fijo {formatPrice(lastAdded.precio, lastAdded.currency as any)}</>}
            </div>
          )}
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {siblings.map((s, i) => (
              <label key={s.id} className="flex items-center gap-2 p-2 rounded border border-border/40 hover:bg-muted/30 cursor-pointer">
                <Checkbox
                  checked={s.selected}
                  onCheckedChange={(v) => setSiblings((arr) => arr.map((x, j) => j === i ? { ...x, selected: !!v } : x))}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Base actual: {formatPrice(s.lastStagePrice, s.currency as any)} →{" "}
                    <span className="text-primary font-semibold">{formatPrice(s.computedPrice, s.currency as any)}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                const allSel = siblings.every((s) => s.selected);
                setSiblings((arr) => arr.map((s) => ({ ...s, selected: !allSel })));
              }}
            >
              {siblings.every((s) => s.selected) ? "Desmarcar todos" : "Marcar todos"}
            </button>
            <span className="text-muted-foreground">{siblings.filter(s => s.selected).length} / {siblings.length} seleccionados</span>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPropagateOpen(false)} disabled={propagating}>No, gracias</Button>
            <Button onClick={propagateNow} disabled={propagating || siblings.filter(s => s.selected).length === 0}>
              {propagating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              Copiar etapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default PackagePriceStagesEditor;
