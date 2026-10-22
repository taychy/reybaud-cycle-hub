/** Reserva rápida para titulares activos del viaje vinculado (p. ej. Alpes → Maratona). La elegibilidad la decide el servidor. */
export interface CrossSellPackage { id: string; nombre: string; precio: number; currency: string; bike?: string | null; combined_total: number }
export interface CrossSellContext {
  eligible: boolean; via?: 'sesion' | 'enlace'; first_name?: string | null; last_name?: string | null; email_masked?: string | null;
  source?: { status: string; package: string | null; price: number; currency: string; room: 'doble' | 'individual' };
  roommate_first_name?: string | null; roommate_known?: boolean; roommate_has_booking?: boolean;
  existing?: { status: string; package: string | null } | null;
  packages?: CrossSellPackage[]; terms_version?: string | null; booking_enabled?: boolean; available?: number;
}
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
