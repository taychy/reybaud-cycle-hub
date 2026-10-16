/**
 * Encuesta gastronómica de viajes (paso `gastronomia` en reservation_checklist_data).
 * Se habilita por viaje con `events.metadata.food_survey.enabled`.
 * La pensión completa incluida sale de `event_packages.incluye_gastronomia`;
 * el trigger `trip_food_survey_guard` replica estas reglas en servidor.
 */
export type FoodType = "normal" | "vegetariana" | "vegana" | "otra";

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  normal: "Normal",
  vegetariana: "Vegetariana",
  vegana: "Vegana",
  otra: "Otra",
};

export interface FoodSurveyData {
  tipo_alimentacion?: FoodType | null;
  tipo_otra_detalle?: string | null;
  tiene_alergias?: boolean | null;
  alergias_detalle?: string | null;
  contaminacion_cruzada?: boolean | null;
  contaminacion_detalle?: string | null;
  observaciones?: string | null;
  pension_interes?: boolean | null;
  pension_incluida?: boolean | null;
  pension_solicitada_at?: string | null;
  pension_gestion?: PensionGestion | null;
  respondido_at?: string | null;
  actualizado_at?: string | null;
  historico_confirmado?: boolean | null;
}

export type PensionGestion = "pendiente" | "contactado" | "contratada" | "descartada";
export const PENSION_GESTION_LABELS: Record<PensionGestion, string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  contratada: "Contratada",
  descartada: "Descartada",
};

export const isFoodSurveyEnabled = (meta: any): boolean => meta?.food_survey?.enabled === true;

export type FoodSurveyStatus = "sin_respuesta" | "sin_restricciones" | "con_restricciones";

export const FOOD_STATUS_LABELS: Record<FoodSurveyStatus, string> = {
  sin_respuesta: "Sin respuesta",
  sin_restricciones: "Sin restricciones",
  con_restricciones: "Con restricciones",
};

/** Respondida = eligió tipo y contestó si tiene alergias. */
export const isFoodSurveyAnswered = (d: FoodSurveyData | null | undefined): boolean =>
  !!d && !!d.tipo_alimentacion && typeof d.tiene_alergias === "boolean";

export const foodSurveyStatus = (d: FoodSurveyData | null | undefined): FoodSurveyStatus => {
  if (!isFoodSurveyAnswered(d)) return "sin_respuesta";
  const restricted =
    d!.tipo_alimentacion !== "normal" || d!.tiene_alergias === true || d!.contaminacion_cruzada === true;
  return restricted ? "con_restricciones" : "sin_restricciones";
};

export interface FoodSurveyErrors {
  [k: string]: string;
}

export const validateFoodSurvey = (d: FoodSurveyData): FoodSurveyErrors => {
  const e: FoodSurveyErrors = {};
  if (!d.tipo_alimentacion) e.tipo_alimentacion = "Elegí un tipo de alimentación.";
  if (d.tipo_alimentacion === "otra" && !d.tipo_otra_detalle?.trim()) e.tipo_otra_detalle = "Contanos cuál.";
  if (typeof d.tiene_alergias !== "boolean") e.tiene_alergias = "Indicá si tenés alergias o intolerancias.";
  if (d.tiene_alergias && !d.alergias_detalle?.trim()) e.alergias_detalle = "Detallá la alergia o intolerancia.";
  if (d.tiene_alergias && typeof d.contaminacion_cruzada !== "boolean")
    e.contaminacion_cruzada = "Indicá si necesitás evitar contaminación cruzada.";
  return e;
};

/** Limpia campos que no aplican antes de guardar. */
export const normalizeFoodSurvey = (d: FoodSurveyData, pensionIncluded: boolean): FoodSurveyData => {
  const out: FoodSurveyData = {
    tipo_alimentacion: d.tipo_alimentacion ?? null,
    tipo_otra_detalle: d.tipo_alimentacion === "otra" ? d.tipo_otra_detalle?.trim() || null : null,
    tiene_alergias: typeof d.tiene_alergias === "boolean" ? d.tiene_alergias : null,
    alergias_detalle: d.tiene_alergias ? d.alergias_detalle?.trim() || null : null,
    contaminacion_cruzada: d.tiene_alergias ? d.contaminacion_cruzada ?? null : null,
    contaminacion_detalle: d.tiene_alergias && d.contaminacion_cruzada ? d.contaminacion_detalle?.trim() || null : null,
    observaciones: d.observaciones?.trim() || null,
    pension_interes: pensionIncluded ? false : !!d.pension_interes,
    historico_confirmado: d.historico_confirmado ?? null,
  };
  return out;
};

/** Convierte la ficha histórica `alimentacion` (dieta/alergias/restricciones) en sugerencia. */
export const suggestionFromHistory = (stepKey: string, data: any): FoodSurveyData | null => {
  if (!data || typeof data !== "object") return null;
  if (stepKey === "gastronomia") {
    return isFoodSurveyAnswered(data) ? { ...data, pension_interes: false } : null;
  }
  const dieta: string | undefined = data.dieta;
  const alergias: string = (data.alergias || "").trim();
  const restric: string = (data.restricciones || "").trim();
  if (!dieta && !alergias && !restric) return null;
  const map: Record<string, FoodType> = { omnivoro: "normal", vegetariano: "vegetariana", vegano: "vegana" };
  let tipo: FoodType | null = dieta ? map[dieta] ?? "otra" : null;
  let otra: string | null = null;
  if (tipo === "otra") otra = dieta === "sin_gluten" ? "Sin gluten (celíaco)" : dieta === "sin_lactosa" ? "Sin lactosa" : restric || null;
  const extraAlergia = dieta === "sin_gluten" || dieta === "sin_lactosa";
  return {
    tipo_alimentacion: tipo,
    tipo_otra_detalle: otra,
    tiene_alergias: alergias || extraAlergia ? true : null,
    alergias_detalle: alergias || (extraAlergia ? otra : null),
    observaciones: restric || null,
  };
};

export const describeFoodSurvey = (d: FoodSurveyData | null | undefined): string => {
  if (!isFoodSurveyAnswered(d)) return "Sin respuesta";
  const parts = [
    d!.tipo_alimentacion === "otra" ? `Otra: ${d!.tipo_otra_detalle ?? ""}` : FOOD_TYPE_LABELS[d!.tipo_alimentacion!],
  ];
  parts.push(d!.tiene_alergias ? `Alergias/intolerancias: ${d!.alergias_detalle ?? ""}` : "Sin alergias");
  if (d!.contaminacion_cruzada) parts.push(`Contaminación cruzada${d!.contaminacion_detalle ? `: ${d!.contaminacion_detalle}` : ""}`);
  return parts.join(" · ");
};
