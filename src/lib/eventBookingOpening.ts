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