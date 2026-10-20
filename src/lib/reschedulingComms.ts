export type CommState = 'pendiente' | 'preparado' | 'enviando' | 'enviado' | 'fallido' | 'completada';
export const COMM_LABELS: Record<CommState, string> = { pendiente: 'Pendiente', preparado: 'Preparado', enviando: 'Enviando', enviado: 'Enviado', fallido: 'Fallido', completada: 'Encuesta completada' };
export interface CommRow {
  reservation_id: string; participant: string; first_name: string; package: string | null; email: string; phone: string; token: string;
  email_valid: boolean; phone_valid: boolean; email_duplicate: boolean; phone_duplicate: boolean; suppressed: boolean; completed: boolean;
  email_status: { status: 'preparado' | 'enviando' | 'enviado' | 'fallido'; version: number } | null;
  whatsapp_status: { status: 'preparado' | 'enviado' | 'fallido'; version: number } | null;
}
export function commStatus(r: Pick<CommRow, 'completed' | 'email_status' | 'whatsapp_status'>, channel: 'email' | 'whatsapp'): CommState {
  if (r.completed) return 'completada';
  return (channel === 'email' ? r.email_status : r.whatsapp_status)?.status ?? 'pendiente';
}
/** Who may receive the email: valid, not suppressed, and not a repeated address (repeats need manual review). */
export const emailSendable = (r: Pick<CommRow, 'email_valid' | 'suppressed' | 'email_duplicate' | 'completed' | 'email_status'>) =>
  r.email_valid && !r.suppressed && !r.email_duplicate && !r.completed && r.email_status?.status !== 'enviado';

export const EMAIL_AUTH_CHECKS = [
  { key: 'app_publicada', label: 'La versión segura de la app está publicada' },
  { key: 'ruta_produccion_probada', label: 'La encuesta abre bien en el dominio de producción' },
  { key: 'enlaces_probados', label: 'Probé un enlace personal (sesión y DNI + nombre + apellido)' },
  { key: 'plantilla_revisada', label: 'Revisé asunto, texto y botón del correo' },
  { key: 'audiencia_confirmada', label: 'Confirmo la audiencia y el envío a estos titulares' },
] as const;
export type EmailAuthKey = typeof EMAIL_AUTH_CHECKS[number]['key'];
export interface EmailGateStatus {
  public_enabled: boolean; eligible: number; tests: number;
  authorization: { id: string; audience_count: number; template_version: string; created_at: string } | null;
}
/** Every reason the real send is still blocked (empty = allowed). Server re-checks all of them. */
export function emailSendBlockers(g: EmailGateStatus | null | undefined): string[] {
  if (!g) return ['No se pudo leer el estado de envío'];
  const out: string[] = [];
  if (!g.public_enabled) out.push('La encuesta pública está desactivada');
  if (g.tests < 1) out.push('Falta un correo de prueba aceptado');
  if (!g.authorization) out.push('Falta la autorización expresa de la audiencia');
  if (g.eligible < 1) out.push('No quedan destinatarios pendientes');
  return out;
}
/** Next batch: sendable rows only (never sent, sending or completed), max 10. */
export function nextEmailBatch(rows: CommRow[], size = 10) {
  return rows.filter(r => emailSendable(r) && r.email_status?.status !== 'enviando').slice(0, Math.min(size, 10)).map(r => r.reservation_id);
}
