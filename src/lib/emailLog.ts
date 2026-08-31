/**
 * Helpers puros para la bitácora de emails automáticos (`email_send_log`).
 *
 * Reglas clave:
 * - Un mismo email genera varias filas (pending -> sent/dlq) con el mismo
 *   `message_id`. SIEMPRE deduplicamos quedándonos con la fila más reciente.
 * - Sólo hablamos de "Enviado" / "Falló" / "Pendiente". Nunca "Entregado" ni
 *   "Abierto": no guardamos evidencia del proveedor para eso.
 */

export interface EmailLogRow {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type EstadoEnvio = "enviado" | "fallo" | "pendiente" | "suprimido";
export type EstadoAgregado = EstadoEnvio | "parcial";

/** Nombres legibles por `template_name`. Centralizado acá a propósito. */
export const TEMPLATE_LABELS: Record<string, string> = {
  "monthly-plan-changes-reminder": "Recordatorio de cambios de plan",
  "plan_change_notification": "Aviso de cambio de plan",
  "plan_change_request": "Solicitud de cambio de plan",
  "installment_upcoming": "Recordatorio de cuota próxima",
  "installment_today": "Aviso de cuota que vence hoy",
  "installment_overdue": "Aviso de cuota vencida",
  "installment_admin_digest": "Resumen de cuotas (admin)",
  "renewal_reminder": "Recordatorio de renovación",
  "renewal_success": "Renovación confirmada",
  "renewal_failed": "Falló la renovación automática",
  "payment_rejected_student": "Pago rechazado (alumno)",
  "cash_payment_notification": "Aviso de pago en efectivo",
  "event_cash_payment_notification": "Aviso de pago en efectivo (evento)",
  "factura_emitida": "Factura emitida",
  "coach-feedback": "Feedback del coach",
  "admin_registration_notification": "Nueva inscripción (admin)",
  "medical_certificate_upload_notification": "Certificado médico subido",
  "programa_inscripcion": "Inscripción a programa",
  "process_report": "Reporte de proceso",
  "reservation_confirmation": "Confirmación de reserva",
  "reservation_confirmed_with_payment": "Reserva confirmada con pago",
  "reservation_pago_registrado": "Pago de reserva registrado",
  "reservation_cuota_pago_mp": "Pago de cuota de reserva",
  "reservation_novedad": "Novedad de reserva",
  "turnera_confirmacion": "Turno confirmado (alumno)",
  "turnera_confirmacion_admin": "Turno confirmado (admin)",
  "turnera_recordatorio": "Recordatorio de turno (alumno)",
  "turnera_coach_recordatorio": "Recordatorio de turno (coach)",
  "turnera_coach_aviso": "Aviso de turno al coach",
  "turnera_coach_aviso_admin": "Aviso de turno al coach (admin)",
  "turnera_cancelacion": "Turno cancelado",
  "turnera_reprogramacion": "Turno reprogramado",
  "turnera_coach_reprogramacion": "Turno reprogramado (coach)",
  "turnera_coach_reprogramacion_removida": "Turno removido del coach",
  "turnera_transferencia_instrucciones": "Instrucciones de transferencia",
  "turnera_transferencia_recordatorio_15min": "Recordatorio de transferencia",
  "turnera_transferencia_expirada": "Transferencia expirada",
  "auth_emails": "Emails de acceso (login/registro)",
  "transactional_emails": "Email transaccional",
};

export function templateLabel(name: string | null | undefined): string {
  if (!name) return "Email sin identificar";
  return TEMPLATE_LABELS[name] || name.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Normaliza el status crudo del log a los 4 estados que mostramos. */
export function normalizeStatus(status: string | null | undefined): EstadoEnvio {
  switch ((status || "").toLowerCase()) {
    case "sent":
      return "enviado";
    case "failed":
    case "dlq":
    case "bounced":
    case "complained":
      return "fallo";
    case "suppressed":
      return "suprimido";
    default:
      return "pendiente";
  }
}

export const ESTADO_LABEL: Record<EstadoAgregado, string> = {
  enviado: "Enviado",
  fallo: "Falló",
  parcial: "Parcial",
  pendiente: "Pendiente",
  suprimido: "Suprimido",
};

/**
 * Deja una fila por `message_id` (la más reciente). Las filas sin
 * `message_id` se conservan tal cual: no hay forma de correlacionarlas.
 */
export function dedupeByMessageId(rows: EmailLogRow[]): EmailLogRow[] {
  const byId = new Map<string, EmailLogRow>();
  const sueltas: EmailLogRow[] = [];
  for (const row of rows) {
    if (!row.message_id) {
      sueltas.push(row);
      continue;
    }
    const prev = byId.get(row.message_id);
    if (!prev || new Date(row.created_at).getTime() >= new Date(prev.created_at).getTime()) {
      byId.set(row.message_id, row);
    }
  }
  return [...byId.values(), ...sueltas].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Estado agregado de un conjunto de envíos individuales. */
export function aggregateStatus(estados: EstadoEnvio[]): EstadoAgregado {
  if (estados.length === 0) return "pendiente";
  const fallos = estados.filter((e) => e === "fallo").length;
  const enviados = estados.filter((e) => e === "enviado").length;
  if (fallos === estados.length) return "fallo";
  if (fallos > 0) return "parcial";
  if (enviados === estados.length) return "enviado";
  if (enviados > 0) return "parcial";
  if (estados.every((e) => e === "suprimido")) return "suprimido";
  return "pendiente";
}

export interface DestinatarioEnvio {
  id: string;
  email: string;
  estado: EstadoEnvio;
  error: string | null;
  fecha: string;
  messageId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface EventoEmail {
  key: string;
  /** YYYY-MM-DD en hora local */
  dia: string;
  templateName: string;
  label: string;
  estado: EstadoAgregado;
  total: number;
  enviados: number;
  fallidos: number;
  pendientes: number;
  /** ISO del primer envío de la agrupación */
  desde: string;
  /** ISO del último envío de la agrupación */
  hasta: string;
  destinatarios: DestinatarioEnvio[];
}

/** YYYY-MM-DD local (sin drift UTC). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Agrupa las filas (ya deduplicadas o no) por día local + `template_name`,
 * que es la unidad "ejecución" que ve la usuaria en el calendario.
 */
export function groupByDayAndTemplate(rows: EmailLogRow[]): EventoEmail[] {
  const dedup = dedupeByMessageId(rows);
  const map = new Map<string, EventoEmail>();

  for (const row of dedup) {
    const dia = localDayKey(row.created_at);
    const templateName = row.template_name || "desconocido";
    const key = `${dia}|${templateName}`;
    const estado = normalizeStatus(row.status);
    const dest: DestinatarioEnvio = {
      id: row.id,
      email: row.recipient_email || "—",
      estado,
      error: row.error_message,
      fecha: row.created_at,
      messageId: row.message_id,
      metadata: row.metadata,
    };

    const ev = map.get(key);
    if (!ev) {
      map.set(key, {
        key,
        dia,
        templateName,
        label: templateLabel(templateName),
        estado,
        total: 1,
        enviados: estado === "enviado" ? 1 : 0,
        fallidos: estado === "fallo" ? 1 : 0,
        pendientes: estado === "pendiente" ? 1 : 0,
        desde: row.created_at,
        hasta: row.created_at,
        destinatarios: [dest],
      });
      continue;
    }
    ev.total += 1;
    if (estado === "enviado") ev.enviados += 1;
    if (estado === "fallo") ev.fallidos += 1;
    if (estado === "pendiente") ev.pendientes += 1;
    if (row.created_at < ev.desde) ev.desde = row.created_at;
    if (row.created_at > ev.hasta) ev.hasta = row.created_at;
    ev.destinatarios.push(dest);
  }

  const eventos = [...map.values()];
  for (const ev of eventos) {
    ev.estado = aggregateStatus(ev.destinatarios.map((d) => d.estado));
    ev.destinatarios.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }
  return eventos.sort((a, b) => (a.hasta < b.hasta ? 1 : -1));
}

/** Estado agregado del día completo, para pintar la celda del calendario. */
export function estadoDelDia(eventos: EventoEmail[]): EstadoAgregado {
  if (eventos.length === 0) return "pendiente";
  if (eventos.some((e) => e.estado === "fallo" || e.estado === "parcial")) {
    return eventos.every((e) => e.estado === "fallo") ? "fallo" : "parcial";
  }
  return aggregateStatus(eventos.map((e) => (e.estado === "parcial" ? "fallo" : e.estado)) as EstadoEnvio[]);
}

export interface SnapshotEmail {
  subject: string | null;
  html: string | null;
  text: string | null;
}

/**
 * Devuelve el contenido histórico REAL del email si el log lo guardó.
 * Nunca reconstruimos con la plantilla actual: si no hay snapshot, es `null`.
 */
export function extraerSnapshot(metadata: Record<string, unknown> | null | undefined): SnapshotEmail | null {
  if (!metadata || typeof metadata !== "object") return null;
  const snap = (metadata as any).snapshot ?? metadata;
  const subject = typeof snap?.subject === "string" ? snap.subject : null;
  const html = typeof snap?.html === "string" ? snap.html : null;
  const text = typeof snap?.text === "string" ? snap.text : null;
  if (!subject && !html && !text) return null;
  return { subject, html, text };
}

/** Primer snapshot disponible dentro de una agrupación. */
export function snapshotDelEvento(ev: EventoEmail): SnapshotEmail | null {
  for (const d of ev.destinatarios) {
    const s = extraerSnapshot(d.metadata);
    if (s) return s;
  }
  return null;
}
