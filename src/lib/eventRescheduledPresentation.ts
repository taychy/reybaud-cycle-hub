import type { ReschedulingContext } from "./rescheduling";

/** Display only; stored dates and operational deadlines remain authoritative. */
const SAN_LUIS = Object.freeze({
  title: "Training Camp San Luis 2026",
  status: "REPROGRAMADO",
  start: "2026-11-05",
  end: "2026-11-09",
  shortDate: "5–9 nov",
  dateLabel: "5 al 9 de noviembre de 2026",
  originalDateLabel: "Fecha original: 22 al 25 de octubre",
  newPlacesApproved: true,
  saleNote: "Precio por persona para 5 al 9 de noviembre (4 noches). Opciones de 3 noches (5–8 o 6–9): solo por consulta, sin precio ni compra online por ahora.",
});
export function eventRescheduledPresentation(id: string | undefined) {
  return id === "67b4e85d-b00b-4b74-9644-99458d948c65" ? SAN_LUIS : null;
}

/** Scoped fallback prevents historical dates flashing while the existing secure context loads. */
export function externalTripRescheduledPresentation(eventId: string, reservationId: string, context?: ReschedulingContext | null) {
  const display = eventRescheduledPresentation(eventId);
  if (!display) return null;
  const campaign = context?.campaign;
  if (campaign?.event_id !== eventId || campaign.proposed_start !== display.start || campaign.proposed_end !== display.end) {
    return { ...display, participantDateLabel: null };
  }
  const request = context?.reservations?.find(row => row.reservation_id === reservationId)?.request;
  const windows: Record<string, { start: string; end: string; label: string }> = {
    attend_5_8: { start: "2026-11-05", end: "2026-11-08", label: "5 al 8 de noviembre de 2026" },
    attend_6_9: { start: "2026-11-06", end: "2026-11-09", label: "6 al 9 de noviembre de 2026" },
    attend_5_9: { start: "2026-11-05", end: "2026-11-09", label: display.dateLabel },
  };
  const window = request?.review_status === "validada" ? windows[request.choice] : undefined;
  const option = campaign.options?.find(row => row.value === request?.choice);
  const participantDateLabel = window && option?.start === window.start && option.end === window.end ? window.label : null;
  return { ...display, participantDateLabel };
}