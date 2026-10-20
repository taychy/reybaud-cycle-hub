export type CommState = 'pendiente' | 'preparado' | 'enviado' | 'fallido' | 'completada';
export const COMM_LABELS: Record<CommState, string> = { pendiente: 'Pendiente', preparado: 'Preparado', enviado: 'Enviado', fallido: 'Fallido', completada: 'Encuesta completada' };
export interface CommRow {
  reservation_id: string; participant: string; first_name: string; package: string | null; email: string; phone: string; token: string;
  email_valid: boolean; phone_valid: boolean; email_duplicate: boolean; phone_duplicate: boolean; suppressed: boolean; completed: boolean;
  email_status: { status: 'preparado' | 'enviado' | 'fallido'; version: number } | null;
  whatsapp_status: { status: 'preparado' | 'enviado' | 'fallido'; version: number } | null;
}
export function commStatus(r: Pick<CommRow, 'completed' | 'email_status' | 'whatsapp_status'>, channel: 'email' | 'whatsapp'): CommState {
  if (r.completed) return 'completada';
  return (channel === 'email' ? r.email_status : r.whatsapp_status)?.status ?? 'pendiente';
}
/** Who may receive the email: valid, not suppressed, and not a repeated address (repeats need manual review). */
export const emailSendable = (r: Pick<CommRow, 'email_valid' | 'suppressed' | 'email_duplicate' | 'completed' | 'email_status'>) =>
  r.email_valid && !r.suppressed && !r.email_duplicate && !r.completed && r.email_status?.status !== 'enviado';
