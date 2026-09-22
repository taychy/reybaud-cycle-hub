import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { isNocheExtra, unidadesPorTiming, NOCHE_TIMING_OPTIONS, type NocheTiming } from "@/lib/nocheExtra";


interface Addon {
  id: string;
  event_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  currency: string;
  tipo: string;
  categoria: string;
  aplica_a_paquetes: string[];
  max_por_participante: number | null;
  stock_total: number | null;
  activo: boolean;
  sort_order: number;
}

interface ContractedAddon {
  id: string;
  reservation_id: string;
  addon_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  currency: string;
  noche_timing: string | null;
}


interface TripExtrasDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string;
  eventId: string;
  eventCurrency: string;
  onSaved: () => void;
}

const TripExtrasDrawer = ({
  open,
  onOpenChange,
  reservationId,
  alumnoId,
  eventId,
  eventCurrency,
  onSaved,
}: TripExtrasDrawerProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [contracted, setContracted] = useState<ContractedAddon[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [timings, setTimings] = useState<Record<string, NocheTiming | null>>({});
  const [checklistRowId, setChecklistRowId] = useState<string | null>(null);


  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [{ data: addonRows, error: addonError }, { data: contractedRows, error: contractedError }, { data: checklistRow }, { data: reservationRow }] = await Promise.all([
        supabase
          .from("event_addons" as any)
          .select("*")
          .eq("event_id", eventId)
          .eq("activo", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("reservation_addons" as any)
          .select("*")
          .eq("reservation_id", reservationId)
          .order("created_at", { ascending: true }),
        supabase
          .from("reservation_checklist_data")
          .select("id")
          .eq("reservation_id", reservationId)
          .eq("step_key", "extras")
          .maybeSingle(),
        supabase
          .from("event_reservations")
          .select("package_id")
          .eq("id", reservationId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (addonError || contractedError) {
        toast.error("No pudimos cargar los extras");
      }

      const packageId = (reservationRow as any)?.package_id as string | null | undefined;
      const loadedAddons = (((addonRows as unknown as Addon[]) || [])
        .map((a) => ({ ...a, aplica_a_paquetes: a.aplica_a_paquetes || [] }))
        .filter((a) => !a.aplica_a_paquetes.length || (!!packageId && a.aplica_a_paquetes.includes(packageId))));
      const loadedContracted = (contractedRows as unknown as ContractedAddon[]) || [];
      const nextQuantities: Record<string, number> = {};
      const nextTimings: Record<string, NocheTiming | null> = {};
      loadedAddons.forEach((addon) => {
        const current = loadedContracted.find((row) => row.addon_id === addon.id);
        nextQuantities[addon.id] = current?.cantidad || 0;
        if (isNocheExtra(addon.nombre)) {
          nextTimings[addon.id] = (current?.noche_timing as NocheTiming | null) || null;
        }
      });

      setAddons(loadedAddons);
      setContracted(loadedContracted);
      setQuantities(nextQuantities);
      setTimings(nextTimings);
      setChecklistRowId((checklistRow as any)?.id || null);
      setLoading(false);

    };

    load();
    return () => { cancelled = true; };
  }, [open, eventId, reservationId]);

  const selectedTotal = useMemo(() => {
    return addons.reduce((sum, addon) => sum + (quantities[addon.id] || 0) * Number(addon.precio || 0), 0);
  }, [addons, quantities]);

  const selectedCount = useMemo(() => {
    return addons.reduce((sum, addon) => sum + (quantities[addon.id] || 0), 0);
  }, [addons, quantities]);

  const setAddonQuantity = (addon: Addon, value: string) => {
    const parsed = Number.parseInt(value || "0", 10);
    const max = addon.max_por_participante && addon.max_por_participante > 0 ? addon.max_por_participante : 99;
    const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), max);
    setQuantities((prev) => ({ ...prev, [addon.id]: safe }));
  };

  const setAddonTiming = (addon: Addon, value: string) => {
    const timing = value === "ninguna" ? null : (value as NocheTiming);
    setTimings((prev) => ({ ...prev, [addon.id]: timing }));
    setQuantities((prev) => ({ ...prev, [addon.id]: unidadesPorTiming(timing) }));
  };


  const markChecklistComplete = async () => {
    const selected = addons
      .filter((addon) => (quantities[addon.id] || 0) > 0)
      .map((addon) => ({
        addon_id: addon.id,
        nombre: addon.nombre,
        cantidad: quantities[addon.id],
        precio_unitario: addon.precio,
        currency: addon.currency,
      }));
    const payload = {
      reservation_id: reservationId,
      alumno_id: alumnoId,
      step_key: "extras",
      completed: true,
      needs_advice: false,
      data: {
        selected,
        declined: selected.length === 0,
        updated_at: new Date().toISOString(),
      },
      file_url: null,
    };

    if (checklistRowId) {
      const { error } = await supabase.from("reservation_checklist_data").update(payload).eq("id", checklistRowId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from("reservation_checklist_data").insert(payload);
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const addon of addons) {
        const esNoche = isNocheExtra(addon.nombre);
        const timing = esNoche ? (timings[addon.id] || null) : null;
        const quantity = esNoche ? unidadesPorTiming(timing) : (quantities[addon.id] || 0);
        const existing = contracted.find((row) => row.addon_id === addon.id);

        if (existing && quantity <= 0) {
          const { error } = await supabase.from("reservation_addons" as any).delete().eq("id", existing.id);
          if (error) throw error;
        } else if (existing && quantity > 0) {
          const { error } = await supabase.from("reservation_addons" as any).update({
            cantidad: quantity,
            precio_unitario: addon.precio,
            currency: addon.currency,
            ...(esNoche ? { noche_timing: timing } : {}),
          }).eq("id", existing.id);
          if (error) throw error;
        } else if (!existing && quantity > 0) {
          const { error } = await supabase.from("reservation_addons" as any).insert({
            reservation_id: reservationId,
            addon_id: addon.id,
            cantidad: quantity,
            precio_unitario: addon.precio,
            currency: addon.currency,
            added_by: user?.id,
            ...(esNoche ? { noche_timing: timing } : {}),
          });
          if (error) throw error;
        }
      }


      await markChecklistComplete();
      toast.success("Configuración guardada");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "No pudimos guardar los extras");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>Configurar mi viaje</DrawerTitle>
              <DrawerDescription>Elegí los adicionales que querés sumar a tu reserva</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-5 overflow-y-auto">
            {addons.length === 0 ? (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
                No hay extras disponibles para este viaje por ahora.
              </div>
            ) : (
              <div className="space-y-3">
                {addons.map((addon) => {
                  const quantity = quantities[addon.id] || 0;
                  const max = addon.max_por_participante && addon.max_por_participante > 0 ? addon.max_por_participante : undefined;
                  return (
                    <div key={addon.id} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{addon.nombre}</p>
                            {addon.tipo !== "opcional" && <Badge variant="outline" className="text-[10px] h-5">{addon.tipo}</Badge>}
                          </div>
                          {addon.descripcion && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{addon.descripcion}</p>}
                          {addon.stock_total != null && <p className="text-[11px] text-muted-foreground mt-1">Cupos limitados</p>}
                        </div>
                        <p className="text-sm font-heading font-bold text-primary shrink-0">
                          {formatPrice(Number(addon.precio || 0), addon.currency as any)}
                        </p>
                      </div>

                      {isNocheExtra(addon.nombre) ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">¿Cuándo necesitás la noche extra?</Label>
                          <Select
                            value={timings[addon.id] || "ninguna"}
                            onValueChange={(value) => setAddonTiming(addon, value)}
                          >
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ninguna">No la necesito</SelectItem>
                              {NOCHE_TIMING_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {quantity > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {quantity} noche{quantity > 1 ? "s" : ""} · {formatPrice(quantity * Number(addon.precio || 0), addon.currency as any)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor={`addon-${addon.id}`} className="text-xs text-muted-foreground">
                            Cantidad{max ? ` · máx. ${max}` : ""}
                          </Label>
                          <Input
                            id={`addon-${addon.id}`}
                            type="number"
                            min={0}
                            max={max}
                            inputMode="numeric"
                            value={quantity}
                            onChange={(event) => setAddonQuantity(addon, event.target.value)}
                            className="h-9 w-24 text-center"
                          />
                        </div>
                      )}
                    </div>

                  );
                })}
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-background/80 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-heading">Extras seleccionados</p>
                <p className="text-sm text-foreground">{selectedCount > 0 ? `${selectedCount} adicional${selectedCount > 1 ? "es" : ""}` : "Sin adicionales"}</p>
              </div>
              <p className="text-base font-heading font-bold text-primary">{formatPrice(selectedTotal, eventCurrency as any)}</p>
            </div>

            <Button className="w-full h-12" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar configuración
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default TripExtrasDrawer;