import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, ShoppingBag, BedDouble } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { isNocheExtra, unidadesPorTiming, nocheTimingShortLabel, NOCHE_TIMING_OPTIONS, type NocheTiming } from "@/lib/nocheExtra";
import ExtraNightEditDialog from "@/components/admin/ExtraNightEditDialog";


// Jornada 5-9/11: los tres extras permanecen inactivos para venta pública.
// Administración puede cargarlos manualmente SOLO con la asistencia validada.
const SAN_LUIS_EVENT_ID = "67b4e85d-b00b-4b74-9644-99458d948c65";

interface Addon {
  id: string;
  nombre: string;
  precio: number;
  currency: string;
  tipo: string;
  categoria: string;
  aplica_a_paquetes: string[];
  max_por_participante: number | null;
  activo: boolean;
}

interface ContractedAddon {
  id: string;
  reservation_id: string;
  addon_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  currency: string;
  notas: string | null;
  noche_timing: string | null;
  addon?: Addon;
}


interface Props {
  reservationId: string;
  eventId: string;
  onChanged?: () => void;
}

export const ReservationAddonsPanel = ({ reservationId, eventId, onChanged }: Props) => {
  const [available, setAvailable] = useState<Addon[]>([]);
  const [contracted, setContracted] = useState<ContractedAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedAddonId, setSelectedAddonId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [notas, setNotas] = useState("");
  const [timing, setTiming] = useState<NocheTiming | "">("");
  const [mealDate, setMealDate] = useState("");
  const [stay, setStay] = useState<{ start: string; end: string } | null>(null);
  const [packageHasFullBoard, setPackageHasFullBoard] = useState(false);
  const [nightOpen, setNightOpen] = useState(false);
  const [additionalDayAddonId, setAdditionalDayAddonId] = useState<string | null>(null);
  const [additionalDayEligible, setAdditionalDayEligible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: addons }, { data: contractedRows }, { data: reservation }, { data: dayConfigs }, { data: rescheduling }] = await Promise.all([
      supabase.from("event_addons" as any).select("*").eq("event_id", eventId).order("sort_order"),
      supabase.from("reservation_addons" as any).select("*, addon:event_addons(*)").eq("reservation_id", reservationId).order("created_at"),
      supabase.from("event_reservations").select("package_id, reservation_status").eq("id", reservationId).maybeSingle(),
      supabase.from("trip_additional_day_config" as any).select("package_id,addon_id,required_choice").eq("event_id", eventId),
      supabase.from("reservation_rescheduling_requests" as any).select("choice,review_status,snapshot").eq("reservation_id", reservationId).maybeSingle(),
    ]);
    const packageId = (reservation as any)?.package_id as string | null | undefined;
    const dayConfig = eventId === SAN_LUIS_EVENT_ID
      ? ((dayConfigs as any[]) || []).find((c) => c.package_id === packageId)
      : null;
    const dayAddonId = (dayConfig?.addon_id as string | undefined) ?? null;
    const request = rescheduling as any;
    const dayEligible = !!dayAddonId
      && (reservation as any)?.reservation_status === "reserva_confirmada"
      && request?.choice === dayConfig?.required_choice
      && request?.review_status === "validada"
      && request?.snapshot?.option?.start === "2026-11-05"
      && request?.snapshot?.option?.end === "2026-11-09";
    const start = request?.snapshot?.option?.start;
    const end = request?.snapshot?.option?.end;
    setStay(request?.review_status === "validada" && /^2026-11-\d{2}$/.test(start || "") && /^2026-11-\d{2}$/.test(end || "") ? { start, end } : null);
    const { data: packageRow } = packageId ? await supabase.from("event_packages").select("incluye_gastronomia").eq("id", packageId).maybeSingle() : { data: null };
    setPackageHasFullBoard(Boolean(packageRow?.incluye_gastronomia));
    setAdditionalDayAddonId(dayAddonId);
    setAdditionalDayEligible(dayEligible);
    const filtered = (((addons as unknown as Addon[]) || [])
      // La jornada adicional se ofrece solo en Administración; no se activa el extra públicamente.
      .filter((a) => a.activo || (eventId === SAN_LUIS_EVENT_ID && (a.id === dayAddonId || a.categoria === "comida_regular" && Number(a.precio) === 35000)))
      .map((a) => ({ ...a, aplica_a_paquetes: a.aplica_a_paquetes || [] }))
      .filter((a) => !a.aplica_a_paquetes.length || (!!packageId && a.aplica_a_paquetes.includes(packageId))));
    setAvailable(filtered);
    setContracted((contractedRows as unknown as ContractedAddon[]) || []);
    setLoading(false);
  }, [eventId, reservationId]);

  useEffect(() => { load(); }, [load]);

  const selectedAddon = available.find((a) => a.id === selectedAddonId);
  const selectedEsNoche = isNocheExtra(selectedAddon?.nombre);
  const selectedEsJornada = !!additionalDayAddonId && selectedAddonId === additionalDayAddonId;
  const selectedEsComida = eventId === SAN_LUIS_EVENT_ID && selectedAddon?.categoria === "comida_regular";
  const mealType = selectedAddon?.nombre.toLowerCase().includes("almuerzo") ? "almuerzo" : "cena";
  const jornadaYaContratada = !!additionalDayAddonId && contracted.some((c) => c.addon_id === additionalDayAddonId);

  const addContracted = async () => {
    const addon = selectedAddon;
    if (!addon) { toast.error("Seleccioná un extra"); return; }
    const esNoche = isNocheExtra(addon.nombre);
    const esJornada = addon.id === additionalDayAddonId;
    if (esJornada) {
      if (!additionalDayEligible) {
        toast.error("Primero validá la asistencia del 5 al 9 de noviembre.");
        return;
      }
      if (contracted.some((c) => c.addon_id === addon.id)) {
        toast.error("La jornada adicional ya está registrada en esta reserva.");
        return;
      }
      const { data: current } = await supabase.from("reservation_addons" as any)
        .select("id").eq("reservation_id", reservationId).eq("addon_id", addon.id).limit(1);
      if ((current as any[])?.length) {
        toast.error("La jornada adicional ya está cargada. Actualizá la reserva.");
        return;
      }
      if (!window.confirm(`¿Agregar la jornada adicional de ${formatPrice(addon.precio, addon.currency as any)} a esta reserva? Se sumará al total pendiente; no registra ningún pago.`)) return;
    }
    if (esNoche && !timing) { toast.error("Elegí si la noche es antes, después o ambas"); return; }
    const esComida = eventId === SAN_LUIS_EVENT_ID && addon.categoria === "comida_regular";
    if (esComida) {
      if (!stay || !/^2026-11-(0[4-9]|10)$/.test(mealDate)) {
        toast.error("Primero confirmá las fechas de estadía y elegí la fecha exacta de la comida (4 al 10/11).");
        return;
      }
      const inCamp = mealDate >= stay.start && mealDate < stay.end;
      if (packageHasFullBoard && inCamp) {
        toast.error("Esta comida ya está cubierta por la pensión completa del paquete.");
        return;
      }
      const existingSameKind = contracted.some((c) => {
        const name = c.addon?.nombre?.toLowerCase() || "";
        if (c.addon?.categoria === "comida_regular" && name.includes(mealType) && (c.notas || "").includes(mealDate.split("-").reverse().join("/"))) return true;
        if (mealType === "cena" && inCamp && ((mealDate === stay.start && name.includes("cena de bienvenida")) || (mealDate === new Date(new Date(stay.end + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0,10) && name.includes("cena de cierre")))) return true;
        return false;
      });
      if (existingSameKind) { toast.error("Ya hay una comida de este tipo para esa fecha en la reserva."); return; }
      if (contracted.some(c => c.addon?.categoria === "comida_regular" && (c.addon?.nombre?.toLowerCase() || "").includes(mealType) && !c.notas?.match(/\d{2}\/\d{2}\/\d{4}/))) {
        toast.error("Hay comidas de ese tipo sin fecha precisa: revisá la reserva antes de agregar otra."); return;
      }
      if (!window.confirm(`¿Agregar ${mealType} del ${mealDate.split("-").reverse().join("/")} por $35.000? Se sumará a la reserva sin registrar un pago.`)) return;
    }
    const q = esJornada || esComida ? 1 : esNoche ? unidadesPorTiming(timing || null) : parseInt(qty || "1");
    if (isNaN(q) || q <= 0) { toast.error("Cantidad inválida"); return; }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("reservation_addons" as any).insert({
      reservation_id: reservationId,
      addon_id: addon.id,
      cantidad: q,
      precio_unitario: addon.precio,
      currency: addon.currency,
      notas: esComida ? `Comida adicional administrativa: ${mealDate.split("-").reverse().join("/")} · ${notas.trim()}` : notas.trim() || null,
      added_by: user?.id,
      ...(esNoche ? { noche_timing: timing } : {}),
    });
    setAdding(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Extra agregado");
    setSelectedAddonId("");
    setQty("1");
    setNotas("");
    setTiming("");
    setMealDate("");
    load();
    onChanged?.();
  };

  const updateTiming = async (c: ContractedAddon, value: NocheTiming) => {
    const { error } = await supabase.from("reservation_addons" as any)
      .update({ noche_timing: value, cantidad: unidadesPorTiming(value) })
      .eq("id", c.id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Actualizado");
    load();
    onChanged?.();
  };



  const remove = async (c: ContractedAddon) => {
    if (!confirm(`¿Quitar "${c.addon?.nombre || "extra"}"?`)) return;
    const { error } = await supabase.from("reservation_addons" as any).delete().eq("id", c.id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Extra quitado");
    load();
    onChanged?.();
  };

  if (loading) {
    return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  }

  if (available.length === 0 && contracted.length === 0) {
    return null; // sin extras configurados para este evento
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-violet-400" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">Extras contratados</h4>
        {available.some((a) => isNocheExtra(a.nombre)) && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setNightOpen(true)}>
            <BedDouble className="w-3.5 h-3.5 mr-1" /> Modificar noche extra
          </Button>
        )}
      </div>
      <ExtraNightEditDialog
        open={nightOpen}
        onOpenChange={setNightOpen}
        reservationId={reservationId}
        eventId={eventId}
        onSaved={() => { load(); onChanged?.(); }}
      />

      {contracted.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin extras contratados.</p>
      ) : (
        <div className="space-y-2">
          {contracted.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{c.addon?.nombre || "—"}</span>
                  <span className="text-xs text-muted-foreground">×{c.cantidad}</span>
                  <span className="text-xs font-medium">{formatPrice(c.subtotal, c.currency as any)}</span>
                  {isNocheExtra(c.addon?.nombre) && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300">
                      {nocheTimingShortLabel(c.noche_timing) || "Sin definir"}
                    </span>
                  )}
                </div>
                {isNocheExtra(c.addon?.nombre) && (
                  <Select value={c.noche_timing || ""} onValueChange={(v) => updateTiming(c, v as NocheTiming)}>
                    <SelectTrigger className="h-7 mt-1 text-xs"><SelectValue placeholder="Antes / Después / Ambas" /></SelectTrigger>
                    <SelectContent>
                      {NOCHE_TIMING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {c.notas && <p className="text-[11px] text-muted-foreground">{c.notas}</p>}
              </div>

              <Button size="icon" variant="ghost" onClick={() => remove(c)} className="h-7 w-7">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="rounded-lg border border-border/50 p-2 space-y-2 bg-muted/20">
          <p className="text-xs font-medium">Agregar extra</p>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Select value={selectedAddonId} onValueChange={setSelectedAddonId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Elegí un extra" /></SelectTrigger>
              <SelectContent>
                {available.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === additionalDayAddonId && (!additionalDayEligible || jornadaYaContratada)}>
                    {a.nombre} — {formatPrice(a.precio, a.currency as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8"
              type="number"
              min={1}
              value={selectedEsJornada ? "1" : selectedEsNoche ? String(unidadesPorTiming(timing || null) || 1) : qty}
              disabled={selectedEsNoche || selectedEsJornada || selectedEsComida}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          {selectedEsNoche && (
            <Select value={timing} onValueChange={(v) => setTiming(v as NocheTiming)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="¿Antes, después o ambas?" /></SelectTrigger>
              <SelectContent>
                {NOCHE_TIMING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedEsComida && (
            <div className="space-y-1">
              <Label className="text-xs">Fecha de la comida (obligatoria)</Label>
              <Input className="h-8" type="date" min="2026-11-04" max="2026-11-10" value={mealDate} onChange={(e) => setMealDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Almuerzo o cena individual: $35.000. Carga solo administrativa; no se cobra automáticamente.</p>
            </div>
          )}
          {additionalDayAddonId && !additionalDayEligible && !jornadaYaContratada && (
            <p className="text-xs text-amber-400">La jornada adicional está disponible solo para reservas con asistencia 5–9/11 validada. No es una noche extra independiente.</p>
          )}
          {jornadaYaContratada && (
            <p className="text-xs text-muted-foreground">La jornada adicional ya está incluida en los extras de esta reserva.</p>
          )}
          {selectedEsJornada && (
            <p className="text-xs text-muted-foreground">Carga administrativa de 1 jornada adicional. Se actualizará el total de la reserva; no se cobra ni se confirma un pago automáticamente.</p>
          )}
          <Input className="h-8" placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

          <Button size="sm" onClick={addContracted} disabled={adding || !selectedAddonId || (selectedEsComida && !mealDate)} className="w-full gap-1 h-8">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReservationAddonsPanel;
