/**
 * Encuestas operativas de una sola pregunta por viaje (ej. talle de camiseta).
 * Configuración en `events.metadata.choice_surveys[]`; respuesta en
 * `reservation_checklist_data` con step_key `encuesta_<key>` (único por reserva).
 * El trigger SQL `trip_choice_survey_guard` valida opción, reserva activa y timestamps.
 */
export interface ChoiceSurveyOption {
  value: string;
  label: string;
  /** No es una respuesta definitiva (ej. "No estoy seguro/a"): requiere seguimiento. */
  needs_follow_up?: boolean;
}

export interface ChoiceSurveyConfig {
  key: string;
  enabled: boolean;
  title: string;
  subtitle?: string;
  intro?: string;
  question: string;
  report_label?: string;
  options: ChoiceSurveyOption[];
}

export interface ChoiceSurveyAnswer {
  respuesta?: string | null;
  requiere_seguimiento?: boolean;
  respondido_at?: string | null;
  actualizado_at?: string | null;
}

export const choiceSurveyStepKey = (key: string) => `encuesta_${key}`;

export const getChoiceSurveys = (meta: any): ChoiceSurveyConfig[] => {
  const list = meta?.choice_surveys;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (s: any) => s && s.enabled === true && typeof s.key === "string" && /^[a-z0-9_]{1,40}$/.test(s.key)
      && typeof s.question === "string" && Array.isArray(s.options) && s.options.length > 0,
  );
};

export const INACTIVE_RESERVATION_STATUSES = ["cancelada", "rechazada"];
export const isActiveReservation = (status: string | null | undefined) =>
  !!status && !INACTIVE_RESERVATION_STATUSES.includes(status);

export type ChoiceAnswerStatus = "sin_respuesta" | "requiere_confirmar" | "confirmado";

export const choiceAnswerStatus = (survey: ChoiceSurveyConfig, d: ChoiceSurveyAnswer | null | undefined): ChoiceAnswerStatus => {
  const opt = survey.options.find((o) => o.value === d?.respuesta);
  if (!opt) return "sin_respuesta";
  return opt.needs_follow_up ? "requiere_confirmar" : "confirmado";
};

export const CHOICE_STATUS_LABELS: Record<ChoiceAnswerStatus, string> = {
  sin_respuesta: "No respondió",
  requiere_confirmar: "Requiere confirmar",
  confirmado: "Confirmado",
};

export interface ChoiceSummary {
  total: number;
  confirmados: number;
  sinRespuesta: number;
  requiereConfirmar: number;
  /** Solo respuestas definitivas, en el orden de las opciones. */
  porOpcion: { value: string; label: string; count: number }[];
}

export const summarizeChoiceSurvey = (
  survey: ChoiceSurveyConfig,
  answers: (ChoiceSurveyAnswer | null | undefined)[],
): ChoiceSummary => {
  const counts = new Map<string, number>();
  let confirmados = 0, sinRespuesta = 0, requiereConfirmar = 0;
  for (const a of answers) {
    const st = choiceAnswerStatus(survey, a);
    if (st === "sin_respuesta") sinRespuesta++;
    else if (st === "requiere_confirmar") requiereConfirmar++;
    else { confirmados++; counts.set(a!.respuesta!, (counts.get(a!.respuesta!) ?? 0) + 1); }
  }
  return {
    total: answers.length, confirmados, sinRespuesta, requiereConfirmar,
    porOpcion: survey.options.filter((o) => !o.needs_follow_up).map((o) => ({ value: o.value, label: o.label, count: counts.get(o.value) ?? 0 })),
  };
};
