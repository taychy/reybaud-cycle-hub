import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import {
  isNocheCompartida, isNocheExtra, isReservaActivaNoche, NOCHE_TIMING_OPTIONS, nocheTimingShortLabel,
  extraNightEstadoLabel, type NocheTiming,
} from "@/lib/nocheExtra";

const sb: any = supabase;
const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reservationId: string;
  eventId: string;
  onSaved?: () => void;
}

interface PreviewRow {
  reservation_id: string;
  nombre: string;
  antes: { nombre: string | null; timing: string | null; subtotal: number };
  despues: { nombre: string | null; timing: string | null; subtotal: number };
  diferencia: number;
  currency: string;
  total_actual: number;
  total_nuevo: number;
  pagado: number;
  saldo_actual: number;
  saldo_nuevo: number;
  saldo_a_favor: number;
}

const ExtraNightEditDialog = ({ open, onOpenChange, reservationId, eventId, onSaved }: Props) => {
  const [addons, setAddons] = useState<any[]>([]);
  const [participants, setParticipants] = useState<{ id: string; nombre: string; ocupado: boolean }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [addonId, setAddonId] = useState<string>("");
  const [timing, setTiming] = useState<NocheTiming | "">("");
  const [partnerId, setPartnerId] = useState<string>(NONE);
  const [nota, setNota] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: ad }, { data: res }, { data: pairs }, { data: ra }, { data: hist }] = await Promise.all([
        sb.from("event_addons").select("id, nombre, precio, currency").eq("event_id", eventId).eq("activo", true).order("sort_order"),
        sb.from("event_reservations")
          .select("id, reservation_status, cancelled_at, alumnos(nombre, apellido), event_external_participants(nombre, apellido)")
          .eq("event_id", eventId),
        sb.from("extra_night_pairings").select("reservation_id, partner_reservation_id, estado").eq("event_id", eventId).eq("estado", "confirmada"),
        sb.from("reservation_addons").select("addon_id, noche_timing, event_addons(nombre)").eq("reservation_id", reservationId),
        sb.from("extra_night_changes").select("*").eq("reservation_id", reservationId).order("created_at", { ascending: false }).limit(20),
      ]);
      const night = (ad || []).filter((a: any) => isNocheExtra(a.nombre));
      setAddons(night);
      const busy = new Set<string>();
      (pairs || []).forEach((p: any) => {
        if (p.reservation_id !== reservationId && p.partner_reservation_id !== reservationId) {
          busy.add(p.reservation_id); if (p.partner_reservation_id) busy.add(p.partner_reservation_id);
        }
      });
      const mine = (pairs || []).find((p: any) => p.reservation_id === reservationId || p.partner_reservation_id === reservationId);
      setParticipants(
        (res || [])
          .filter((r: any) => r.id !== reservationId && isReservaActivaNoche(r))
          .map((r: any) => {
            const p = r.alumnos || r.event_external_participants || {};
            return { id: r.id, nombre: `${p.nombre || ""} ${p.apellido || ""}`.trim() || "Participante", ocupado: busy.has(r.id) };
          })
          .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)),
      );
      const current = (ra || []).find((x: any) => isNocheExtra(x.event_addons?.nombre));
      setAddonId(current?.addon_id || "");
      setTiming((current?.noche_timing as NocheTiming) || "");
      setPartnerId(mine ? (mine.reservation_id === reservationId ? mine.partner_reservation_id : mine.reservation_id) : NONE);
      setHistory(hist || []);
      setNota("");
      setPreview(null);
      setLoading(false);
    })();
  }, [open, eventId, reservationId]);

  const selected = addons.find((a) => a.id === addonId);
  const shared = isNocheCompartida(selected?.nombre);
  const partner = shared && partnerId !== NONE ? partnerId : null;
  const addonName = useMemo(() => new Map(addons.map((a) => [a.id, a.nombre])), [addons]);
  const partnerName = useMemo(() => new Map(participants.map((p) => [p.id, p.nombre])), [participants]);

  useEffect(() => {
    if (!open || loading) return;
    if (addonId && !timing) { setPreview(null); return; }
    let cancel = false;
    sb.rpc("admin_extra_night_preview", {
      p_reservation_id: reservationId, p_addon_id: addonId || null, p_timing: addonId ? timing : null,
      p_partner_reservation_id: partner,
    }).then(({ data, error }: any) => {
      if (cancel) return;
      if (error) { toast.error(error.message); setPreview(null); return; }
      setPreview(data?.participantes || []);
    });
    return () => { cancel = true; };
  }, [open, loading, addonId, timing, partner, reservationId]);

  const save = async () => {
    if (addonId && !timing) { toast.error("Elegí antes, después o ambas"); return; }
    setSaving(true);
    const { error } = await sb.rpc("admin_set_extra_night", {
      p_reservation_id: reservationId, p_addon_id: addonId || null, p_timing: addonId ? timing : null,
      p_partner_reservation_id: partner, p_nota: nota.trim() || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("participante_ya_asignado") ? "Esa persona ya tiene otra habitación de noche extra confirmada."
        : error.message.includes("no_elegible") ? "Sólo se pueden vincular participantes activos del mismo viaje." : error.message;
      toast.error(msg); return;
    }
    toast.success("Noche extra actualizada");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modificar noche extra</DialogTitle>
          <DialogDescription>
            Sólo cambia la noche extra. El paquete, la habitación principal y los pagos ya registrados no se tocan.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Modalidad</Label>
              <Select value={addonId || NONE} onValueChange={(v) => setAddonId(v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin noche extra</SelectItem>
                  {addons.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre} — {formatPrice(a.precio, a.currency)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addonId && (
              <div>
                <Label>Noche</Label>
                <Select value={timing} onValueChange={(v) => setTiming(v as NocheTiming)}>
                  <SelectTrigger><SelectValue placeholder="Antes / Después / Ambas" /></SelectTrigger>
                  <SelectContent>
                    {NOCHE_TIMING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {shared && (
              <div>
                <Label>Comparte con</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Todavía sin compañero</SelectItem>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.ocupado}>
                        {p.nombre}{p.ocupado ? " (ya tiene habitación)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Si el compañero no tenía noche extra, se le agrega con la misma modalidad y noche.
                </p>
              </div>
            )}

            {preview && preview.length > 0 && (
              <div className="rounded-lg border border-border p-2 space-y-2">
                <p className="text-xs font-semibold">Impacto económico</p>
                {preview.map((p) => (
                  <div key={p.reservation_id} className="text-xs space-y-0.5 border-t border-border/50 pt-1 first:border-0 first:pt-0">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-muted-foreground">
                      Antes: {p.antes.nombre ? `${p.antes.nombre} (${nocheTimingShortLabel(p.antes.timing)})` : "sin noche extra"} · {formatPrice(p.antes.subtotal, p.currency as any)}
                    </p>
                    <p className="text-muted-foreground">
                      Después: {p.despues.nombre ? `${p.despues.nombre} (${nocheTimingShortLabel(p.despues.timing)})` : "sin noche extra"} · {formatPrice(p.despues.subtotal, p.currency as any)}
                    </p>
                    <p>
                      Diferencia: <b>{p.diferencia > 0 ? "+" : ""}{formatPrice(p.diferencia, p.currency as any)}</b> · Total {formatPrice(p.total_actual, p.currency as any)} → {formatPrice(p.total_nuevo, p.currency as any)} · Pagado {formatPrice(p.pagado, p.currency as any)} · Saldo {formatPrice(p.saldo_actual, p.currency as any)} → {formatPrice(p.saldo_nuevo, p.currency as any)}
                    </p>
                    {p.saldo_a_favor > 0 && (
                      <p className="text-primary">Queda saldo a favor de {formatPrice(p.saldo_a_favor, p.currency as any)}: registralo como saldo a favor o devolución desde la cuenta del participante.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Textarea placeholder="Motivo / nota (ej.: acordado por WhatsApp)" value={nota} onChange={(e) => setNota(e.target.value)} />

            {history.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Historial</p>
                {history.map((h) => (
                  <p key={h.id} className="text-[11px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("es-AR")} · {h.actor_email || (h.origen === "participante" ? "Participante" : "Admin")} ·{" "}
                    {h.accion.replace(/_/g, " ")} · {addonName.get(h.addon_anterior_id) || "—"} → {addonName.get(h.addon_nuevo_id) || "—"}
                    {h.partner_reservation_id ? ` · con ${partnerName.get(h.partner_reservation_id) || "otro participante"}` : ""}
                    {h.nota ? ` · ${h.nota}` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { extraNightEstadoLabel };
export default ExtraNightEditDialog;
