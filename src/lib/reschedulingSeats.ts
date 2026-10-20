// Closed inventory for rescheduling: mirror of SQL admin_rescheduling_seat_action rules (server is the authority).
export type SeatState = 'renuncia_confirmada' | 'liberada' | 'ofrecida' | 'ocupada' | 'anulada';
export type SeatAction = 'confirm_renunciation' | 'approve_release' | 'offer' | 'occupy' | 'revoke';
export const SEAT_LABELS: Record<SeatState, string> = {
  renuncia_confirmada: 'Renuncia confirmada · plaza NO liberada',
  liberada: 'Liberada por administración · no ofrecida',
  ofrecida: 'Ofrecida para reventa',
  ocupada: 'Ocupada por reemplazo',
  anulada: 'Anulada',
};
export const SEAT_ACTION_LABELS: Record<SeatAction, string> = {
  confirm_renunciation: 'Confirmar renuncia', approve_release: 'Aprobar liberación de plaza', offer: 'Ofrecer para reventa', occupy: 'Vincular reemplazo', revoke: 'Anular',
};
export interface SeatRequestInfo { choice: string; review_status: string }
export function seatActions(state: SeatState | null, request: SeatRequestInfo | null, resaleEnabled: boolean): SeatAction[] {
  const eligible = !!request && request.review_status === 'validada' && ['refund', 'credit'].includes(request.choice);
  if (!state || state === 'anulada') return eligible ? ['confirm_renunciation'] : [];
  if (state === 'renuncia_confirmada') return ['approve_release', 'revoke'];
  if (state === 'liberada') return resaleEnabled ? ['offer', 'revoke'] : ['revoke'];
  if (state === 'ofrecida') return resaleEnabled ? ['occupy', 'revoke'] : ['revoke'];
  return [];
}
/** Half-open night ranges [start, end): 5–8 and 6–9 share the nights of 6 and 7. */
export function nightsOverlap(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start < b.end && b.start < a.end;
}
export function nightsOf(w: { start: string; end: string }) {
  const out: string[] = []; const [y, m, d] = w.start.split('-').map(Number);
  for (let i = 0; ; i++) { const dt = new Date(Date.UTC(y, m - 1, d + i)); const s = dt.toISOString().slice(0, 10); if (s >= w.end) break; out.push(s); }
  return out;
}
export interface InventoryPackage { package_id: string; name: string; active: number; confirmed: number; released: number; offered: number; occupied: number; sellable: number }
export interface SeatRelease { reservation_id: string; package_id: string | null; kind: string; state: SeatState; version: number; stale: boolean; occupancy: { window: string; replacement_reservation_id: string } | null }
export interface SeatInventory { available: boolean; resale_enabled: boolean; public_enabled: boolean; active_reservations: number; unreviewed: number; by_choice: Record<string, number>; refund_validated: number; releases: SeatRelease[]; packages: InventoryPackage[]; windows: { value: string; label: string; start: string; end: string; nights: number }[] }
export const sellableTotal = (inv: Pick<SeatInventory, 'resale_enabled' | 'packages'>) => inv.resale_enabled ? inv.packages.reduce((n, p) => n + p.offered, 0) : 0;
