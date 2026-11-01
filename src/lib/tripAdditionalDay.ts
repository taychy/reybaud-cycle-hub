export type AdditionalDayAnswer = "interesado" | "no" | "consulta";
export type AdditionalDayStatus = "sin_respuesta" | AdditionalDayAnswer | "resuelto";
export interface AdditionalDayContext {
  reservation_id: string; event_id: string; start: string; end: string;
  original_nights: number; original_days: number; selected_nights: number;
  answer: AdditionalDayAnswer | null; status: AdditionalDayStatus; stale: boolean;
  existing_night: boolean; updated_at: string | null;
}
export const ADDITIONAL_DAY_OPTIONS: { value: AdditionalDayAnswer; label: string }[] = [
  { value: "interesado", label: "Sí, me interesa sumarlo" },
  { value: "no", label: "No, prefiero mantener los servicios de mi paquete original" },
  { value: "consulta", label: "Quiero consultar antes de decidir" },
];
export const ADDITIONAL_DAY_STATUS_LABELS: Record<AdditionalDayStatus, string> = {
  sin_respuesta: "Sin respuesta", interesado: "Interesado", no: "No · revisar", consulta: "Consulta", resuelto: "Resuelto",
};
/** The extension is exactly one additional night compared with the original package. */
export const isAdditionalDayExtension = (c: Pick<AdditionalDayContext, "original_nights" | "selected_nights">) =>
  c.selected_nights === c.original_nights + 1;
/** Presentation stays inside the validated chosen stay; it never proposes new dates. */
export const additionalDaySelectedStay = (c: Pick<AdditionalDayContext, "start" | "end" | "original_nights" | "selected_nights">) => {
  const parse = (value: string) => {
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return NaN;
    const [year, month, day] = parts;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    return date.getTime();
  };
  const nights = (parse(c.end) - parse(c.start)) / 86400000;
  if (!isAdditionalDayExtension(c) || nights !== c.selected_nights) return null;
  return { start: c.start, end: c.end, selectedNights: nights, originalNights: c.original_nights };
};
export const needsAdditionalDayReview = (c: Pick<AdditionalDayContext, "status" | "existing_night">) =>
  c.status === "no" || (c.existing_night && c.status !== "resuelto");

/** Presentation-only: independent lodging never implies a program-extension conflict. */
export const showProgramExtensionReview = (c: Pick<AdditionalDayContext, "answer" | "status">) =>
  c.answer !== null && c.status !== "resuelto";