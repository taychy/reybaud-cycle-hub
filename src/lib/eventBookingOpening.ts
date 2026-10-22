export const MARATONA_EVENT_ID = '78a739f4-9b06-47af-bc6d-d8a1705e2477';
export interface BookingOpening {
  controlled: boolean;
  enabled: boolean;
  ready: boolean;
  available: number;
  capacity: number;
  blockers: string[];
  deposit: number;
  installments: number;
}
export function canOpenNativeBooking(status: BookingOpening | null | undefined): boolean {
  return status?.controlled === true && status.enabled === true && status.ready === true && status.available > 0;
}
export function globalBookingCapacity(hotel: number, race: number): number {
  return Number.isInteger(hotel) && Number.isInteger(race) && hotel > 0 && race > 0 ? Math.min(hotel, race) : 0;
}
export interface CrossSellRow {
  source_reservation_id: string; nombre: string | null; email: string | null; source_status: string;
  already_requested: boolean; already_reserved: boolean; marketing_opt_out: boolean;
  alps_rate_eligible: boolean; roommate: string | null; invite: boolean;
}
export function summarizeCrossSell(rows: CrossSellRow[]) {
  const invited = rows.filter(r => r.invite && !r.already_requested && !r.already_reserved && !r.marketing_opt_out && !!r.email);
  return {
    total: rows.length,
    excludedRequested: rows.filter(r => r.already_requested || r.already_reserved).length,
    excludedOptOut: rows.filter(r => r.marketing_opt_out).length,
    invite: invited.length,
    inviteEligibleNow: invited.filter(r => r.alps_rate_eligible).length,
    inviteEmails: [...new Set(invited.map(r => r.email!.toLowerCase()))],
  };
}
