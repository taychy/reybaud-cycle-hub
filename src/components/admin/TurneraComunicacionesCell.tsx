import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Info, MessageCircle } from "lucide-react";

// Desde esta fecha las reservas registran las marcas de envío de confirmación y
// aviso al coach. Para reservas anteriores no inventamos estado: "Sin registro".
export const TURNERA_COMMS_TRACKING_SINCE = "2026-08-26";

type Estado = "enviado" | "en_cola" | "programado" | "pendiente" | "error" | "sin_registro" | "desactivado" | "no_configurado";

const estadoLabel: Record<Estado, string> = {
  enviado: "Enviado",
  en_cola: "En cola",
  programado: "Programado",
  pendiente: "Pendiente",
  error: "Error",
  sin_registro: "Sin registro",
  desactivado: "Desactivado",
  no_configurado: "No configurado",
};

const estadoClass: Record<Estado, string> = {
  enviado: "bg-green-500/10 text-green-400 border-green-500/30",
  en_cola: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  programado: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  pendiente: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  error: "bg-destructive/10 text-destructive border-destructive/30",
  sin_registro: "bg-muted text-muted-foreground border-border",
  desactivado: "bg-muted text-muted-foreground border-border",
  no_configurado: "bg-muted text-muted-foreground border-border",
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

export type NotifRow = {
  tipo: string;
  canal: "email" | "whatsapp";
  estado: string;
  error_message: string | null;
  error_code: string | null;
  queued_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  scheduled_for: string | null;
};

type Item = { tipo: string; canal: string; estado: Estado; detalle: string };

/** Mapea el estado real de la bitácora a la etiqueta que ve el admin. */
const fromLog = (row: NotifRow, canalLabel: string, tipoLabel: string): Item => {
  const base = { tipo: tipoLabel, canal: canalLabel };
  switch (row.estado) {
    case "sent":
      return { ...base, estado: "enviado", detalle: `Enviado ${fmt(row.sent_at)}` };
    case "queued":
      return { ...base, estado: "en_cola", detalle: `Aceptado por el proveedor ${fmt(row.queued_at)}` };
    case "scheduled":
      return { ...base, estado: "programado", detalle: row.scheduled_for ? `Programado para ${fmt(row.scheduled_for)}` : "Programado" };
    case "error":
      return { ...base, estado: "error", detalle: `${fmt(row.failed_at)} · ${row.error_code || ""} ${row.error_message || ""}`.trim() };
    case "skipped":
      return { ...base, estado: "no_configurado", detalle: row.error_message || "No configurado" };
    default:
      return { ...base, estado: "pendiente", detalle: "Sin registro de envío" };
  }
};

export function buildComunicaciones(reserva: any, servicio: any, logs: NotifRow[] = []): Item[] {
  const cancelada = String(reserva?.estado_operativo || "").startsWith("cancelada");
  const legacy = String(reserva?.created_at || "").slice(0, 10) < TURNERA_COMMS_TRACKING_SINCE;
  const find = (tipo: string, canal: "email" | "whatsapp") => logs.find(l => l.tipo === tipo && l.canal === canal);

  const buildEmail = (
    tipoKey: string,
    tipoLabel: string,
    enviadoAt: string | null | undefined,
    enabled: boolean,
    horasAntes: number | null,
    trackeado: boolean,
  ): Item => {
    if (!enabled) return { tipo: tipoLabel, canal: "Email", estado: "desactivado", detalle: "Desactivado en la configuración del servicio" };
    const log = find(tipoKey, "email");
    if (log) return fromLog(log, "Email", tipoLabel);
    if (enviadoAt) return { tipo: tipoLabel, canal: "Email", estado: "en_cola", detalle: `Encolado ${fmt(enviadoAt)}` };
    if (!trackeado) return { tipo: tipoLabel, canal: "Email", estado: "sin_registro", detalle: "Reserva anterior al registro de envíos" };
    if (cancelada) return { tipo: tipoLabel, canal: "Email", estado: "pendiente", detalle: "Reserva cancelada — no se enviará" };
    if (horasAntes != null) {
      const p = programadoPara(reserva?.fecha, reserva?.hora_inicio, horasAntes);
      if (p && p.getTime() > Date.now()) {
        return { tipo: tipoLabel, canal: "Email", estado: "programado", detalle: `Programado para ${p.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` };
      }
    }
    return { tipo: tipoLabel, canal: "Email", estado: "pendiente", detalle: "Sin registro de envío" };
  };

  const buildWa = (tipoKey: string, tipoLabel: string, enabled: boolean, horasAntes: number): Item => {
    if (!enabled) return { tipo: tipoLabel, canal: "WhatsApp", estado: "desactivado", detalle: "Canal desactivado en la configuración del servicio" };
    const log = find(tipoKey, "whatsapp");
    if (log) return fromLog(log, "WhatsApp", tipoLabel);
    if (cancelada) return { tipo: tipoLabel, canal: "WhatsApp", estado: "pendiente", detalle: "Reserva cancelada — no se enviará" };
    const p = programadoPara(reserva?.fecha, reserva?.hora_inicio, horasAntes);
    if (p && p.getTime() > Date.now()) {
      return { tipo: tipoLabel, canal: "WhatsApp", estado: "programado", detalle: `Programado para ${p.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` };
    }
    return { tipo: tipoLabel, canal: "WhatsApp", estado: "pendiente", detalle: "Sin registro de envío" };
  };

  const horasAlumno = Number(servicio?.recordatorio_horas_antes ?? 24);
  const horasCoach = Number(servicio?.coach_recordatorio_horas_antes ?? 24);

  return [
    buildEmail("confirmacion", "Confirmación al alumno", reserva?.confirmacion_enviado_at, servicio?.email_confirmacion_enabled !== false, null, !legacy),
    buildEmail("recordatorio", "Recordatorio al alumno", reserva?.recordatorio_enviado_at, servicio?.email_recordatorio_enabled !== false, horasAlumno, true),
    buildWa("recordatorio", "Recordatorio al alumno", servicio?.whatsapp_recordatorio_enabled === true, horasAlumno),
    buildEmail("coach_aviso", "Aviso al coach", reserva?.coach_aviso_enviado_at, servicio?.email_coach_enabled !== false, null, !legacy),
    buildEmail("coach_recordatorio", "Recordatorio al coach", reserva?.coach_recordatorio_enviado_at, servicio?.email_coach_recordatorio_enabled !== false, horasCoach, true),
    buildWa("coach_recordatorio", "Recordatorio al coach", servicio?.whatsapp_coach_recordatorio_enabled === true, horasCoach),
  ];
}

export default function TurneraComunicacionesCell({ reserva, servicio }: { reserva: any; servicio: any }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<NotifRow[]>([]);

  useEffect(() => {
    if (!open || !reserva?.id) return;
    supabase
      .from("turnera_notificaciones")
      .select("tipo, canal, estado, error_message, error_code, queued_at, sent_at, failed_at, scheduled_for")
      .eq("reserva_id", reserva.id)
      .then(({ data }) => setLogs((data as any) || []));
  }, [open, reserva?.id]);

  const items = buildComunicaciones(reserva, servicio, logs);
  const campos: Array<{ key: string; label: string }> = Array.isArray(servicio?.form_fields) ? servicio.form_fields : [];
  const respuestas = (reserva?.form_responses || {}) as Record<string, unknown>;
  const respuestasList = campos
    .map(f => ({ label: f.label || f.key, value: String(respuestas?.[f.key] ?? "").trim() }))
    .filter(x => x.value);

  const coachItems = items.filter(i => i.tipo.toLowerCase().includes("coach"));
  const resumen: Estado = coachItems.some(i => i.estado === "error")
    ? "error"
    : coachItems.some(i => i.estado === "enviado")
      ? "enviado"
      : coachItems.some(i => i.estado === "en_cola")
        ? "en_cola"
        : coachItems.some(i => i.estado === "programado")
          ? "programado"
          : (coachItems[0]?.estado as Estado) || "pendiente";

  // Agrupamos por tipo de aviso, mostrando cada canal por separado.
  const grupos = items.reduce<Record<string, Item[]>>((acc, i) => {
    (acc[i.tipo] ||= []).push(i);
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className={`h-5 px-2 text-[10px] font-medium ${estadoClass[resumen]}`}>
          <Mail className="w-3 h-3 mr-1" /> Coach: {estadoLabel[resumen]}
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
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comunicaciones</p>
              {Object.entries(grupos).map(([tipo, canales]) => (
                <div key={tipo} className="rounded-md border border-border p-2 space-y-2">
                  <p className="text-sm text-foreground">{tipo}</p>
                  {canales.map(c => (
                    <div key={c.canal} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-foreground flex items-center gap-1">
                          {c.canal === "WhatsApp" ? <MessageCircle className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {c.canal}
                        </p>
                        <p className="text-[11px] text-muted-foreground break-words">{c.detalle}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 h-5 px-2 text-[10px] ${estadoClass[c.estado]}`}>
                        {estadoLabel[c.estado]}
                      </Badge>
                    </div>
                  ))}
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
