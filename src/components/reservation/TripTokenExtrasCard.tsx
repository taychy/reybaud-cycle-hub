import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, ChevronRight, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { isNocheExtra, NOCHE_TIMING_OPTIONS, unidadesPorTiming, type NocheTiming } from "@/lib/nocheExtra";

interface Addon {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  currency: string;
  tipo: string;
  max_por_participante: number | null;
  stock_total: number | null;
}

interface ContractedAddon {
  id: string;
  addon_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  currency: string;
  noche_timing: string | null;
}

interface ExtrasResponse {
  ok?: boolean;
  error?: string;
  event_id?: string;
  reservation_status?: string;
  addons?: Addon[];
  contracted?: ContractedAddon[];
}

interface Props {
  eventId: string;
}

const TripTokenExtrasCard = ({ eventId }: Props) => {
  const isTripTokenPage = typeof window !== "undefined" && window.location.pathname.startsWith("/viaje");
  const token = isTripTokenPage ? new URLSearchParams(window.location.search).get("token") : null;

  const [loading, setLoading] = useState(!!token);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [contracted, setContracted] = useState<ContractedAddon[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [timings, setTimings] = useState<Record<string, NocheTiming | null>>({});
  const [editable, setEditable] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke<ExtrasResponse>("manage-trip-extras-by-token", {
        body: { action: "get", token },
      });
      if (cancelled) return;
      if (error || !data?.ok || data.event_id !== eventId) {
        setAddons([]);
        setLoading(false);
        return;
      }

      const loadedAddons = data.addons ?? [];
      const loadedContracted = data.contracted ?? [];
      const nextQuantities: Record<string, number> = {};
      const nextTimings: Record<string, NocheTiming | null> = {};

      loadedAddons.forEach((addon) => {
        const current = loadedContracted.find((row) => row.addon_id === addon.id);
        nextQuantities[addon.id] = Number(current?.cantidad || 0);
        if (isNocheExtra(addon.nombre)) {
          nextTimings[addon.id] = (current?.noche_timing as NocheTiming | null) || null;
        }
      });

      setAddons(loadedAddons);
      setContracted(loadedContracted);
      setQuantities(nextQuantities);
      setTimings(nextTimings);
      setEditable(!["cancelada", "rechazada"].includes(data.reservation_status || ""));
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [token, eventId]);

  const selectedCount = useMemo(
    () => addons.reduce((sum, addon) => sum + Number(quantities[addon.id] || 0), 0),
    [addons, quantities],
  );

  const selectedTotal = useMemo(
    () => addons.reduce((sum, addon) => sum + Number(quantities[addon.id] || 0) * Number(addon.precio || 0), 0),
    [addons, quantities],
  );

  const displayCurrency = addons[0]?.currency || contracted[0]?.currency || "ARS";

  const setQuantity = (addon: Addon, value: string) => {
    const parsed = Number.parseInt(value || "0", 10);
    const max = addon.max_por_participante && addon.max_por_participante > 0 ? addon.max_por_participante : 99;
    const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), max);
    setQuantities((prev) => ({ ...prev, [addon.id]: safe }));
  };

  const setTiming = (addon: Addon, value: string) => {
    const timing = value === "ninguna" ? null : (value as NocheTiming);
    setTimings((prev) => ({ ...prev, [addon.id]: timing }));
    setQuantities((prev) => ({ ...prev, [addon.id]: unidadesPorTiming(timing) }));
  };

  const save = async () => {
    if (!token) return;

    const undefinedNight = addons.find(
      (addon) => isNocheExtra(addon.nombre) && (quantities[addon.id] || 0) > 0 && !timings[addon.id],
    );
    if (undefinedNight) {
      toast.error(`Elegí si ${undefinedNight.nombre} es antes, después o ambas.`);
      return;
    }

    const selections = addons.map((addon) => ({
      addon_id: addon.id,
      cantidad: Number(quantities[addon.id] || 0),
      noche_timing: isNocheExtra(addon.nombre) ? (timings[addon.id] || null) : null,
    }));

    setSaving(true);
    const { data, error } = await supabase.functions.invoke<ExtrasResponse>("manage-trip-extras-by-token", {
      body: { action: "save", token, selections },
    });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error("No pudimos guardar los extras. Revisá la disponibilidad e intentá nuevamente.");
      return;
    }

    toast.success("Extras actualizados");
    setOpen(false);
    window.setTimeout(() => window.location.reload(), 250);
  };

  if (!token || loading || addons.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Extras de tu reserva</p>
            <p className="text-xs text-muted-foreground">
              {selectedCount > 0
                ? `${selectedCount} adicional${selectedCount > 1 ? "es" : ""} seleccionado${selectedCount > 1 ? "s" : ""}`
                : "Agregá noches extra y otros adicionales disponibles."}
            </p>
          </div>
          {selectedCount > 0 && (
            <span className="text-xs font-semibold text-primary shrink-0">{formatPrice(selectedTotal, displayCurrency as any)}</span>
          )}
        </div>
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => setOpen(true)}
          disabled={!editable}
        >
          <span>{selectedCount > 0 ? "Gestionar extras" : "Elegir extras"}</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DrawerTitle>Extras de tu reserva</DrawerTitle>
                <DrawerDescription>Elegí los adicionales que querés sumar o modificar.</DrawerDescription>
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            {addons.map((addon) => {
              const quantity = Number(quantities[addon.id] || 0);
              const max = addon.max_por_participante && addon.max_por_participante > 0 ? addon.max_por_participante : undefined;
              const night = isNocheExtra(addon.nombre);
              const nightValue = timings[addon.id] || (quantity > 0 ? "sin_definir" : "ninguna");

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
                    <p className="text-sm font-bold text-primary shrink-0">
                      {formatPrice(Number(addon.precio || 0), addon.currency as any)}
                    </p>
                  </div>

                  {night ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">¿Cuándo necesitás la noche extra?</Label>
                      <Select value={nightValue} onValueChange={(value) => setTiming(addon, value)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {quantity > 0 && !timings[addon.id] && (
                            <SelectItem value="sin_definir" disabled>Elegí antes, después o ambas</SelectItem>
                          )}
                          <SelectItem value="ninguna">No la necesito</SelectItem>
                          {NOCHE_TIMING_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {quantity > 0 && timings[addon.id] && (
                        <p className="text-[11px] text-muted-foreground">
                          {quantity} noche{quantity > 1 ? "s" : ""} · {formatPrice(quantity * Number(addon.precio || 0), addon.currency as any)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`token-addon-${addon.id}`} className="text-xs text-muted-foreground">
                        Cantidad{max ? ` · máx. ${max}` : ""}
                      </Label>
                      <Input
                        id={`token-addon-${addon.id}`}
                        type="number"
                        min={0}
                        max={max}
                        inputMode="numeric"
                        value={quantity}
                        onChange={(event) => setQuantity(addon, event.target.value)}
                        className="h-9 w-24 text-center"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="rounded-lg border border-border/50 bg-background/80 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Extras seleccionados</p>
                <p className="text-sm text-foreground">{selectedCount > 0 ? `${selectedCount} adicional${selectedCount > 1 ? "es" : ""}` : "Sin adicionales"}</p>
              </div>
              <p className="text-base font-bold text-primary">{formatPrice(selectedTotal, displayCurrency as any)}</p>
            </div>

            <Button className="w-full h-12" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar extras
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default TripTokenExtrasCard;
