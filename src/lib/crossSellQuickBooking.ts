/** Reserva rápida para titulares activos del viaje vinculado (p. ej. Alpes → Maratona). La elegibilidad la decide el servidor. */
export interface CrossSellPackage { id: string; nombre: string; precio: number; currency: string; bike?: string | null; combined_total: number }
export interface CrossSellContext {
  eligible: boolean; via?: 'sesion' | 'enlace'; first_name?: string | null; last_name?: string | null; email_masked?: string | null;
  source?: { status: string; package: string | null; price: number; currency: string; room: 'doble' | 'individual' };
  roommate_first_name?: string | null; roommate_known?: boolean; roommate_has_booking?: boolean;
  existing?: CrossSellExisting | null;
  deposit?: { url: string | null; amount: number; currency: string } | null;
  packages?: CrossSellPackage[]; terms_version?: string | null; booking_enabled?: boolean; available?: number;
}
export interface CrossSellExisting { status: string; payment_status?: string | null; package: string | null; price?: number | null; paid?: number | null; currency?: string | null; reference?: string | null }
export type RoomChoice = 'mismo_companero' | 'companero' | 'asignacion';

export const CROSSSELL_TOKEN_PARAM = 'acceso';

/** Doble con compañero conocido: no se pide nada. Individual o doble sin compañero: hay que elegir. */
export function roomChoiceRequired(ctx: CrossSellContext): boolean {
  return !(ctx.source?.room === 'doble' && ctx.roommate_known);
}

export function canSubmitQuickBooking(ctx: CrossSellContext, pkgId: string | null, termsAccepted: boolean, choice: RoomChoice | null, companion: string): boolean {
  if (!ctx.eligible || ctx.existing || !ctx.booking_enabled || !pkgId || !termsAccepted) return false;
  if (!ctx.packages?.some(p => p.id === pkgId)) return false;
  if (!roomChoiceRequired(ctx)) return true;
  if (choice === 'asignacion') return true;
  return choice === 'companero' && companion.trim().length >= 3;
}

/** Subtotal real: precio de la reserva de origen + tarifa Maratona. No incluye noches/traslados de conexión. */
export function combinedSubtotal(ctx: CrossSellContext, pkg: CrossSellPackage): number {
  return Number(ctx.source?.price ?? 0) + Number(pkg.precio);
}

export function readCrossSellToken(search: string): string | null {
  const t = new URLSearchParams(search).get(CROSSSELL_TOKEN_PARAM);
  return t && /^[a-f0-9]{64}$/.test(t) ? t : null;
}

/** Solo enlaces https de ClicPay (el servidor también lo valida). */
export function isClicPayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'link.clicpay.it'; } catch { return false; }
}

export const DEFAULT_DEPOSIT_AMOUNT = 500;

/** Saldo pendiente de la seña (nunca negativo). */
export function depositPending(e: CrossSellExisting, depositAmount = DEFAULT_DEPOSIT_AMOUNT): number {
  return Math.max(0, Math.round((depositAmount - Number(e.paid ?? 0)) * 100) / 100);
}

/**
 * Qué mostrar tras reservar. 'paid' solo si lo acreditado cubre la seña completa;
 * 'partial' si hay pago acreditado menor a la seña (no se ofrece el link de importe fijo).
 * Nunca inventa acreditación.
 */
export function depositAction(e: CrossSellExisting, depositAmount = DEFAULT_DEPOSIT_AMOUNT): 'pay' | 'informed' | 'partial' | 'paid' {
  const paid = Number(e.paid ?? 0);
  if (paid >= depositAmount) return 'paid';
  if (e.payment_status === 'pago_informado' || e.payment_status === 'pendiente_verificacion') return 'informed';
  if (paid > 0) return 'partial';
  return 'pay';
}

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  solicitud_enviada: 'Pendiente de seña', reserva_confirmada: 'Confirmada', terminos_pendientes: 'Condiciones pendientes',
};
