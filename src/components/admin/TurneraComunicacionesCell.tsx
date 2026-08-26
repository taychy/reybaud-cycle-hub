import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Info } from "lucide-react";

// Desde esta fecha las reservas registran las marcas de envío de confirmación y
// aviso al coach. Para reservas anteriores no inventamos estado: "Sin registro".
export const TURNERA_COMMS_TRACKING_SINCE = "2026-08-26";

type Estado = "enviado" | "programado" | "pendiente" | "sin_registro" | "desactivado";

const estadoLabel: Record<Estado, string> = {
  enviado: "Enviado",
  programado: "Programado",
  pendiente: "Pendiente",
  sin_registro: "Sin registro",
  desactivado: "Desactivado",
};

const estadoClass: Record<Estado, string> = {
  enviado: "bg-green-500/10 text-green-400 border-green-500/30",
  programado: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  pendiente: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  sin_registro: "bg-muted text-muted-foreground border-border",
  desactivado: "bg-muted text-muted-foreground border-border",
};

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

// Fecha/hora estimada del recordatorio según config del servicio (hora local AR del turno).
const programadoPara = (fecha: string, hora: string, horasAntes: number): Date | null => {
  if (!fecha || !hora) return null;
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = String(hora).split(":").map(Number);
  if (!y || !m || !d) return null;
  const turno = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
  return new Date(turno.getTime() - horasAntes * 3600 * 1000);
};

type Item = { tipo: string; canal: string; estado: Estado; detalle: string };

export function buildComunicaciones(reserva: any, servicio: any): Item[] {
  const cancelada = String(reserva?.estado_operativo || "").startsWith("cancelada");
  const legacy = String(reserva?.created_at || "").slice(0, 10) < TURNERA_COMMS_TRACKING_SINCE;

  const build = (
    tipo: string,
    enviadoAt: string | null | undefined,
    enabled: boolean,
    horasAntes: number | null,
    trackeado: boolean,
  ): Item => {
    if (!enabled) return { tipo, canal: "Email", estado: "desactivado", detalle: "Desactivado en la configuración del servicio" };
    if (enviadoAt) return { tipo, canal: "Email", estado: "enviado", detalle: `Enviado ${fmt(enviadoAt)}` };
    if (!trackeado) return { tipo, canal: "Email", estado: "sin_registro", detalle: "Reserva anterior al registro de envíos" };
    if (cancelada) return { tipo, canal: "Email", estado: "pendiente", detalle: "Reserva cancelada — no se enviará" };
    if (horasAntes != null) {
      const p = programadoPara(reserva?.fecha, reserva?.hora_inicio, horasAntes);
      if (p && p.getTime() > Date.now()) {
        return {
          tipo,
          canal: "Email",
          estado: "programado",
          detalle: `Programado para ${p.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        };
      }
    }
    return { tipo, canal: "Email", estado: "pendiente", detalle: "Sin registro de envío" };
  };

  return [
    build("Confirmación al alumno", reserva?.confirmacion_enviado_at, servicio?.email_confirmacion_enabled !== false, null, !legacy),
    build("Recordatorio al alumno", reserva?.recordatorio_enviado_at, servicio?.email_recordatorio_enabled !== false, Number(servicio?.recordatorio_horas_antes ?? 24), true),
    build("Aviso al coach", reserva?.coach_aviso_enviado_at, servicio?.email_coach_enabled !== false, null, !legacy),
    build("Recordatorio al coach", reserva?.coach_recordatorio_enviado_at, servicio?.email_coach_recordatorio_enabled !== false, Number(servicio?.coach_recordatorio_horas_antes ?? 24), true),
  ];
}

export default function TurneraComunicacionesCell({ reserva, servicio }: { reserva: any; servicio: any }) {
  const [open, setOpen] = useState(false);
  const items = buildComunicaciones(reserva, servicio);
  const campos: Array<{ key: string; label: string }> = Array.isArray(servicio?.form_fields) ? servicio.form_fields : [];
  const respuestas = (reserva?.form_responses || {}) as Record<string, unknown>;
  const respuestasList = campos
    .map(f => ({ label: f.label || f.key, value: String(respuestas?.[f.key] ?? "").trim() }))
    .filter(x => x.value);

  const coachItems = items.filter(i => i.tipo.includes("coach"));
  const resumen = coachItems.every(i => i.estado === "enviado")
    ? "enviado"
    : coachItems.some(i => i.estado === "programado")
      ? "programado"
      : coachItems.some(i => i.estado === "enviado")
        ? "enviado"
        : coachItems[0]?.estado || "pendiente";

  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className={`h-5 px-2 text-[10px] font-medium ${estadoClass[resumen as Estado]}`}>
          <Mail className="w-3 h-3 mr-1" /> Coach: {estadoLabel[resumen as Estado]}
        </Badge>
        {respuestasList.length > 0 && (
          <Badge variant="outline" className="h-5 px-2 text-[10px]">{respuestasList.length} resp.</Badge>
        )}
        <Button size="icon" variant="ghost" className="h-6 w-6" title="Ver detalle" onClick={() => setOpen(true)}>
          <Info className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reserva?.nombre} {reserva?.apellido} · {reserva?.fecha}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comunicaciones</p>
              {items.map(i => (
                <div key={i.tipo} className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
                  <div>
                    <p className="text-sm text-foreground">{i.tipo}</p>
                    <p className="text-xs text-muted-foreground">{i.canal} · {i.detalle}</p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 h-5 px-2 text-[10px] ${estadoClass[i.estado]}`}>
                    {estadoLabel[i.estado]}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Respuestas del formulario</p>
              {respuestasList.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin respuestas registradas.</p>
              ) : (
                respuestasList.map(x => (
                  <div key={x.label} className="rounded-md border border-border p-2">
                    <p className="text-xs font-medium text-foreground">{x.label}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{x.value}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
