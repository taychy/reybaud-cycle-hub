/** Display only; stored dates and operational deadlines remain authoritative. */
const SAN_LUIS = Object.freeze({
  title: "Training Camp San Luis 2026",
  status: "REPROGRAMADO",
  start: "2026-11-05",
  end: "2026-11-09",
  shortDate: "5–9 nov",
  dateLabel: "5 al 9 de noviembre de 2026",
  originalDateLabel: "Fecha original: 22 al 25 de octubre",
  newPlacesApproved: false,
});
export function eventRescheduledPresentation(id: string | undefined) {
  return id === "67b4e85d-b00b-4b74-9644-99458d948c65" ? SAN_LUIS : null;
}