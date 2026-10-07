import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import {
  extraNightEstadoLabel, isNocheCompartida, isNocheExtra, NOCHE_TIMING_OPTIONS, nocheTimingShortLabel, type NocheTiming,
} from "@/lib/nocheExtra";

const sb: any = supabase;
const UNKNOWN = "__unknown__";

const ERRORS: Record<string, string> = {
  companero_no_elegible: "Esa persona no está activa en este viaje.",
  ya_tenes_habitacion_confirmada: "Ya tenés una habitación compartida confirmada. Escribinos para cambiarla.",
  reservation_not_editable: "Tu reserva no permite cambios.",
  participante_ya_asignado_noche_extra: "Esa persona ya tiene habitación para la noche extra.",
};

/** "Modificar noche extra" en el link público: individual o compartida, con invitación que el otro acepta. */
const TripTokenExtraNightShare = ({ addons, onChanged }: { addons: { id: string; nombre: string; precio: number; currency: string }[]; onChanged?: () => void }) => {
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
  const night = addons.filter((a) => isNocheExtra(a.nombre));
  const [state, setState] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"individual" | "compartida">("individual");
  const [timing, setTiming] = useState<NocheTiming | "">("");
  const [partner, setPartner] = useState<string>(UNKNOWN);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc("manage_extra_night_by_token", { p_token: token, ...args });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(ERRORS[data?.error] || "No se pudo guardar");
    return data;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try { setState(await call({ p_action: "get" })); } catch { setState(null); }
  }, [token, call]);

  useEffect(() => { load(); }, [load]);

  if (!token || night.length === 0 || !state) return null;

  const individual = night.find((a) => !isNocheCompartida(a.nombre));
  const shared = night.find((a) => isNocheCompartida(a.nombre));
  const actual = state.actual;
  const activa = state.activa;

  const openEdit = () => {
    setMode(isNocheCompartida(actual?.nombre) || activa ? "compartida" : "individual");
    setTiming((actual?.noche_timing || activa?.timing || "") as NocheTiming);
    setPartner(UNKNOWN);
    setEditing(true);
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setEditing(false); await load(); onChanged?.(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const save = () => {
    if (!timing) { toast.error("Elegí antes, después o ambas"); return; }
    if (mode === "individual") {
      if (!individual) return;
      run(() => call({ p_action: "set_individual", p_addon_id: individual.id, p_timing: timing }), "Noche extra actualizada");
    } else {
      if (!shared) return;
      run(() => call({ p_action: "request_shared", p_addon_id: shared.id, p_timing: timing, p_partner_reservation_id: partner === UNKNOWN ? null : partner }),
        partner === UNKNOWN ? "Listo: quedás pendiente de compañero" : "Invitación enviada. Se confirma cuando la otra persona acepte.");
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <BedDouble className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Noche extra</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {actual ? `${actual.nombre} · ${nocheTimingShortLabel(actual.noche_timing) || "sin definir"}` : "Sin noche extra"}
        {activa && ` · ${extraNightEstadoLabel(activa.estado)}${activa.companero ? ` con ${activa.companero}` : ""}`}
      </p>

      {(state.invitaciones || []).map((inv: any) => (
        <div key={inv.id} className="rounded-md bg-muted/30 p-2 space-y-1">
          <p className="text-xs">{inv.de} te invitó a compartir la habitación de noche extra ({nocheTimingShortLabel(inv.timing)}).</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => run(() => call({ p_action: "respond", p_pairing_id: inv.id, p_accept: true }), "Habitación compartida confirmada")}>Aceptar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => call({ p_action: "respond", p_pairing_id: inv.id, p_accept: false }), "Invitación rechazada")}>Rechazar</Button>
          </div>
        </div>
      ))}

      {!editing ? (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={openEdit}>Modificar noche extra</Button>
          {activa && activa.estado !== "confirmada" && activa.soy_solicitante && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => call({ p_action: "cancel_request" }), "Solicitud cancelada")}>Cancelar solicitud</Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {individual && <Button size="sm" variant={mode === "individual" ? "default" : "outline"} onClick={() => setMode("individual")}>Individual · {formatPrice(individual.precio, individual.currency as any)}</Button>}
            {shared && <Button size="sm" variant={mode === "compartida" ? "default" : "outline"} onClick={() => setMode("compartida")}>Compartida · {formatPrice(shared.precio, shared.currency as any)}</Button>}
          </div>
          <Select value={timing} onValueChange={(v) => setTiming(v as NocheTiming)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="¿Antes, después o ambas?" /></SelectTrigger>
            <SelectContent>{NOCHE_TIMING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          {mode === "compartida" && (
            <div>
              <Label className="text-xs">Elegir compañero</Label>
              <Select value={partner} onValueChange={setPartner}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNKNOWN}>Quiero compartir, todavía no sé con quién</SelectItem>
                  {(state.elegibles || []).map((p: any) => <SelectItem key={p.reservation_id} value={p.reservation_id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">La otra persona tiene que aceptar desde su reserva. Hasta entonces tu importe no cambia.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripTokenExtraNightShare;
