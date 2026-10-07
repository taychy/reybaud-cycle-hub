import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import {
  extraNightEstadoLabel, isNocheCompartida, isNocheExtra, isReservaActivaNoche, nocheTimingShortLabel,
} from "@/lib/nocheExtra";

const sb: any = supabase;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; eventId: string; eventTitle?: string }

interface Room {
  key: string;
  noche: string;
  modalidad: string;
  compartida: boolean;
  participantes: string[];
  estado: string;
  alertas: string[];
}

/** Rooming exclusivo de noches extra: separado de las noches base del viaje. */
const ExtraNightRoomingDialog = ({ open, onOpenChange, eventId, eventTitle }: Props) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: res }, { data: ra }, { data: pairs }] = await Promise.all([
        sb.from("event_reservations")
          .select("id, reservation_status, cancelled_at, alumnos(nombre, apellido), event_external_participants(nombre, apellido)")
          .eq("event_id", eventId),
        sb.from("reservation_addons").select("reservation_id, addon_id, noche_timing, event_addons!inner(nombre, event_id)").eq("event_addons.event_id", eventId),
        sb.from("extra_night_pairings").select("*").eq("event_id", eventId).in("estado", ["pendiente_companero", "pendiente_aceptacion", "confirmada"]),
      ]);
      const resMap = new Map<string, any>((res || []).map((r: any) => [r.id, r]));
      const name = (id: string) => {
        const r = resMap.get(id); const p = r?.alumnos || r?.event_external_participants || {};
        return `${p.nombre || ""} ${p.apellido || ""}`.trim() || "Participante";
      };
      const nights = (ra || []).filter((x: any) => isNocheExtra(x.event_addons?.nombre));
      const nightByRes = new Map<string, any>(nights.map((n: any) => [n.reservation_id, n]));
      const used = new Set<string>();
      const out: Room[] = [];

      for (const p of pairs || []) {
        if (p.estado !== "confirmada") continue;
        const a = nightByRes.get(p.reservation_id); const b = nightByRes.get(p.partner_reservation_id);
        const alertas: string[] = [];
        [p.reservation_id, p.partner_reservation_id].forEach((id: string) => {
          if (!isReservaActivaNoche(resMap.get(id) || {})) alertas.push(`${name(id)}: reserva cancelada`);
          const n = nightByRes.get(id);
          if (!n || n.addon_id !== p.addon_id || n.noche_timing !== p.noche_timing) alertas.push(`${name(id)}: noche extra no coincide`);
        });
        used.add(p.reservation_id); used.add(p.partner_reservation_id);
        out.push({
          key: p.id, noche: nocheTimingShortLabel(p.noche_timing), modalidad: (a || b)?.event_addons?.nombre || "Doble",
          compartida: true, participantes: [name(p.reservation_id), name(p.partner_reservation_id)], estado: "confirmada", alertas,
        });
      }
      for (const n of nights) {
        if (used.has(n.reservation_id)) continue;
        const r = resMap.get(n.reservation_id);
        const shared = isNocheCompartida(n.event_addons?.nombre);
        const pend = (pairs || []).find((p: any) => p.reservation_id === n.reservation_id && p.estado !== "confirmada");
        const alertas: string[] = [];
        if (!isReservaActivaNoche(r || {})) alertas.push("Reserva cancelada con noche extra cargada");
        if (!n.noche_timing) alertas.push("Falta definir antes/después");
        if (shared && !pend) alertas.push("Doble sin compañero asignado");
        out.push({
          key: n.reservation_id, noche: nocheTimingShortLabel(n.noche_timing) || "Sin definir", modalidad: n.event_addons?.nombre,
          compartida: shared,
          participantes: [name(n.reservation_id), ...(pend?.partner_reservation_id ? [`${name(pend.partner_reservation_id)} (invitado)`] : [])],
          estado: shared ? (pend?.estado || "pendiente_companero") : "confirmada", alertas,
        });
      }
      // Solicitudes pendientes sin noche extra cargada aún
      for (const p of pairs || []) {
        if (p.estado === "confirmada" || nightByRes.has(p.reservation_id)) continue;
        out.push({
          key: p.id, noche: nocheTimingShortLabel(p.noche_timing), modalidad: "Doble (solicitada)", compartida: true,
          participantes: [name(p.reservation_id), ...(p.partner_reservation_id ? [`${name(p.partner_reservation_id)} (invitado)`] : [])],
          estado: p.estado, alertas: [],
        });
      }
      setRooms(out.sort((x, y) => x.noche.localeCompare(y.noche) || x.modalidad.localeCompare(y.modalidad)));
      setLoading(false);
    })();
  }, [open, eventId]);

  const exportCsv = () => {
    const rows = [["Noche", "Modalidad", "Participantes", "Estado", "Alertas"],
      ...rooms.map((r) => [r.noche, r.modalidad, r.participantes.join(" / "), extraNightEstadoLabel(r.estado), r.alertas.join(" | ")])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `noches-extra-${(eventTitle || "evento").replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Noches extra</DialogTitle>
          <DialogDescription>Rooming separado del alojamiento principal. No incluye las noches base del viaje.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay noches extra cargadas.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1" /> Exportar para proveedor</Button>
            </div>
            {rooms.map((r) => (
              <div key={r.key} className="rounded-lg border border-border p-2 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{r.noche}</Badge>
                  <span className="font-medium">{r.modalidad}</span>
                  <Badge variant={r.estado === "confirmada" ? "default" : "secondary"}>{extraNightEstadoLabel(r.estado)}</Badge>
                </div>
                <p className="text-xs">{r.participantes.join(" · ")}</p>
                {r.alertas.map((a) => (
                  <p key={a} className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {a}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExtraNightRoomingDialog;
