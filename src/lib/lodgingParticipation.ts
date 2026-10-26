// Clasificación de reservas para el panel de alojamiento.
// Espejo del criterio SQL de disponibilidad de paquetes (0085): una reserva cuya
// plaza fue liberada por baja aprobada (liberada/ofrecida/ocupada) ya no ocupa
// alojamiento, aunque la reserva conserve su estado, pagos y saldos.
export const WITHDRAWN_SEAT_STATES = ["liberada", "ofrecida", "ocupada"] as const;

export type SeatReleaseLite = { source_reservation_id: string; kind: string; state: string };

export function withdrawnSeatMap(releases: SeatReleaseLite[]): Map<string, SeatReleaseLite> {
  const m = new Map<string, SeatReleaseLite>();
  for (const s of releases) {
    if ((WITHDRAWN_SEAT_STATES as readonly string[]).includes(s.state)) m.set(s.source_reservation_id, s);
  }
  return m;
}

export function isInactiveStatus(status: string | null | undefined): boolean {
  return status === "cancelada" || status === "rechazada";
}

/** Reserva que debe alojarse: no cancelada/rechazada y sin plaza liberada por baja. */
export function needsLodging(
  r: { id: string; reservation_status: string },
  withdrawn: Map<string, unknown>,
): boolean {
  return !isInactiveStatus(r.reservation_status) && !withdrawn.has(r.id);
}

export function withdrawalLabel(kind: string): string {
  return kind === "refund" ? "Devolución" : kind === "credit_withdrawal" ? "Crédito" : kind;
}
