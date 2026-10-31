/**
 * Encuesta gastronómica de viajes (paso `gastronomia` en reservation_checklist_data).
 * Se habilita por viaje con `events.metadata.food_survey.enabled`.
 * Desayuno siempre incluido por alojamiento, nunca Extra. Pensión completa =
 * almuerzos/cenas reales incluidos según `event_packages.incluye_gastronomia`;
 * el trigger `trip_food_survey_guard` replica estas reglas en servidor.
 */
export type FoodType = "normal" | "vegetariana" | "vegana" | "otra";

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  normal: "Normal",
  vegetariana: "Vegetariana",
  vegana: "Vegana",
  otra: "Otra",
};

/** Cobertura derivada del paquete; no inferir pensión por ausencia de Extras. */
export const stayMealCoverage = (pensionIncluded: boolean | null) => ({
  breakfastIncluded: true as const,
  pensionIncluded,
  breakfast: "Tu estadía incluye desayuno.",
  meals: pensionIncluded === true
    ? "Tu paquete incluye pensión completa: almuerzos y cenas disponibles durante tu estadía."
    : pensionIncluded === false
      ? "Tu paquete no incluye almuerzos y cenas"
      : "Inclusión de almuerzos y cenas: pendiente de verificar el paquete.",
});

export interface FoodSurveyData {
  tipo_alimentacion?: FoodType | null;
  tipo_otra_detalle?: string | null;
  tiene_alergias?: boolean | null;
  alergias_detalle?: string | null;
  contaminacion_cruzada?: boolean | null;
  contaminacion_detalle?: string | null;
  observaciones?: string | null;
  /** DEPRECATED: la encuesta ya no pregunta por pensión completa (se deriva del paquete). */
  pension_interes?: boolean | null;
  /** Solicitud (no compra) de comidas adicionales del programa real. */
  comidas_solicitadas?: MealSlot[] | null;
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
  if (!d || !isFoodSurveyAnswered(d)) return "sin_respuesta";
  const restricted =
    d.tipo_alimentacion !== "normal" || d.tiene_alergias === true || d.contaminacion_cruzada === true;
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
    pension_interes: false,
    comidas_solicitadas: pensionIncluded ? [] : dedupeMeals(d.comidas_solicitadas ?? []),
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
  if (!d || !isFoodSurveyAnswered(d) || !d.tipo_alimentacion) return "Sin respuesta";
  const parts = [
    d.tipo_alimentacion === "otra" ? `Otra: ${d.tipo_otra_detalle ?? ""}` : FOOD_TYPE_LABELS[d.tipo_alimentacion],
  ];
  parts.push(d.tiene_alergias ? `Alergias/intolerancias: ${d.alergias_detalle ?? ""}` : "Sin alergias");
  if (d.contaminacion_cruzada) parts.push(`Contaminación cruzada${d.contaminacion_detalle ? `: ${d.contaminacion_detalle}` : ""}`);
  return parts.join(" · ");
};

// ── Comidas adicionales (Extras) ─────────────────────────────────────────────
// Programa real configurado por viaje en `events.metadata.food_survey.meal_program`:
// { almuerzo_addon_id, cena_addon_id, meals: [{ fecha: "YYYY-MM-DD", tipo, package_ids? }] }.
// El precio sale del Extra (event_addons) de cada tipo: nunca se inventa.
// Sin programa no se ofrece ninguna comida.
export type MealType = "almuerzo" | "cena";
export interface MealSlot { fecha: string; tipo: MealType }
export interface MealProgramEntry extends MealSlot { package_ids?: string[] | null }
export interface MealProgram {
  almuerzo_addon_id?: string | null;
  cena_addon_id?: string | null;
  meals: MealProgramEntry[];
}
export interface MealAddon { id: string; event_id: string; precio: number; currency: string; activo: boolean; aplica_a_paquetes?: string[] | null }
export interface MealStay { start: string; end: string }

/** Literal dates only; missing/ambiguous stays offer no meals. Arrival/departure
 * days are bounds, not invented services: availability still comes from program. */
export const isMealInStay = (fecha: string, stay: MealStay | null): boolean => {
  const valid = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  };
  return !!stay && valid(fecha) && valid(stay.start) && valid(stay.end)
    && stay.start <= stay.end && fecha >= stay.start && fecha <= stay.end;
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = { almuerzo: "Almuerzo", cena: "Cena" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const mealKey = (m: MealSlot) => `${m.fecha}|${m.tipo}`;

export const dedupeMeals = (list: MealSlot[]): MealSlot[] => {
  const seen = new Set<string>();
  const out: MealSlot[] = [];
  for (const m of list || []) {
    if (!m || !ISO.test(m.fecha) || (m.tipo !== "almuerzo" && m.tipo !== "cena")) continue;
    const k = mealKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ fecha: m.fecha, tipo: m.tipo });
  }
  return out.sort((a, b) => mealKey(a).localeCompare(mealKey(b)));
};

export const parseMealProgram = (meta: any): MealProgram | null => {
  const p = meta?.food_survey?.meal_program;
  if (!p || !Array.isArray(p.meals) || p.meals.length === 0) return null;
  const meals = (p.meals as any[])
    .filter((m) => m && ISO.test(m.fecha) && (m.tipo === "almuerzo" || m.tipo === "cena"))
    .map((m) => ({ fecha: m.fecha, tipo: m.tipo as MealType, package_ids: Array.isArray(m.package_ids) ? m.package_ids : null }));
  if (!meals.length) return null;
  return { almuerzo_addon_id: p.almuerzo_addon_id ?? null, cena_addon_id: p.cena_addon_id ?? null, meals };
};

/** Fechas "D/M" de una ISO sin crear Date (evita corrimiento horario). */
export const formatMealDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

/**
 * Comidas que se pueden ofrecer a una reserva: solo si el paquete NO incluye pensión,
 * del programa real, del paquete de la reserva, con Extra activo y con precio,
 * excluyendo las ya contratadas/abonadas.
 */
export const offerableMeals = (args: {
  program: MealProgram | null;
  eventId: string;
  stay: MealStay | null;
  pensionIncluded: boolean;
  packageId: string | null;
  addons: MealAddon[];
  contracted: MealSlot[];
}): Array<MealSlot & { addon_id: string; precio: number; currency: string }> => {
  const { program, eventId, stay, pensionIncluded, packageId, addons, contracted } = args;
  if (!program || pensionIncluded || !stay || !eventId) return [];
  const taken = new Set(contracted.map(mealKey));
  const out: Array<MealSlot & { addon_id: string; precio: number; currency: string }> = [];
  for (const m of program.meals) {
    // También proteger entradas directas/no tipadas: desayuno jamás ofertable.
    if (!m || !ISO.test(m.fecha) || (m.tipo !== "almuerzo" && m.tipo !== "cena")) continue;
    if (!isMealInStay(m.fecha, stay)) continue;
    if (m.package_ids?.length && (!packageId || !m.package_ids.includes(packageId))) continue;
    const addonId = m.tipo === "almuerzo" ? program.almuerzo_addon_id : program.cena_addon_id;
    const addon = addons.find((a) => a.id === addonId);
    if (!addon || addon.event_id !== eventId || !addon.activo || !(addon.precio > 0)) continue;
    if (addon.aplica_a_paquetes?.length && (!packageId || !addon.aplica_a_paquetes.includes(packageId))) continue;
    if (taken.has(mealKey(m))) continue;
    out.push({ fecha: m.fecha, tipo: m.tipo, addon_id: addon.id, precio: addon.precio, currency: addon.currency });
  }
  const unique = new Map(out.map((m) => [mealKey(m), m]));
  return [...unique.values()].sort((a, b) => mealKey(a).localeCompare(mealKey(b)));
};

/** Comidas ya contratadas: fechas ISO anotadas en las notas del Extra de esa comida. */
export const contractedMealsFromAddons = (
  program: MealProgram | null,
  rows: Array<{ addon_id: string; notas?: string | null }>,
): MealSlot[] => {
  if (!program) return [];
  const out: MealSlot[] = [];
  for (const r of rows) {
    const tipo: MealType | null =
      r.addon_id === program.almuerzo_addon_id ? "almuerzo" : r.addon_id === program.cena_addon_id ? "cena" : null;
    if (!tipo) continue;
    const dates = (r.notas || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
    // An existing meal Extra without dated notes is ambiguous, not available again.
    for (const f of dates.length ? dates : program.meals.filter(m => m.tipo === tipo).map(m => m.fecha)) out.push({ fecha: f, tipo });
  }
  return dedupeMeals(out);
};

export const mealRequestTotal = (
  selected: MealSlot[],
  offer: Array<MealSlot & { precio: number }>,
): { cantidad: number; total: number } => {
  const keys = new Set(dedupeMeals(selected).map(mealKey));
  const unique = new Map(offer.map((o) => [mealKey(o), o]));
  const chosen = [...unique.values()].filter((o) => keys.has(mealKey(o)));
  return { cantidad: chosen.length, total: chosen.reduce((s, o) => s + o.precio, 0) };
};

export type MealMode = "todas" | "individual" | "ninguna";

/** "Todas las comidas de mi estadía": todo lo ofertable (ya excluye desayuno, incluidas y compradas). */
export const allStayMeals = (offer: MealSlot[]): MealSlot[] => dedupeMeals(offer);

/** Modo visible: elegido explícitamente, o derivado de lo guardado. */
export const mealSelectionMode = (selected: MealSlot[], offer: MealSlot[], chosen: MealMode | null): MealMode => {
  if (chosen) return chosen;
  const keys = new Set(dedupeMeals(selected).map(mealKey));
  if (keys.size === 0) return "ninguna";
  return offer.length > 0 && offer.every((o) => keys.has(mealKey(o))) ? "todas" : "individual";
};
