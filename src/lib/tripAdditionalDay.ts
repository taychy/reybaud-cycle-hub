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
export const needsAdditionalDayReview = (c: Pick<AdditionalDayContext, "status" | "existing_night">) =>
  c.status === "no" || (c.existing_night && c.status !== "resuelto");