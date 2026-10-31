import { normalizeFoodSurvey, validateFoodSurvey, type FoodSurveyData, type MealSlot } from "./foodSurvey";

/** QA never invents a meal program or produces purchasable services. */
export function normalizeFoodSurveyQa(data: FoodSurveyData, included: boolean) {
  if (Object.keys(validateFoodSurvey(data)).length) throw new Error("Revisá las respuestas marcadas");
  return normalizeFoodSurvey({ ...data, comidas_solicitadas: [] }, included);
}

export type QaCaseKey = "con_pension" | "sin_pension";
export const QA_CASE_KEYS: QaCaseKey[] = ["con_pension", "sin_pension"];

/** Deep link participant view: only accepts known case keys; anything else falls back to the QA list. */
export function parseQaParticipantView(params: URLSearchParams): QaCaseKey | null {
  if (params.get("vista") !== "participante") return null;
  const c = params.get("caso");
  return c === "con_pension" || c === "sin_pension" ? c : null;
}

/** Simulated package shown to the tester; never a real package. */
export const QA_PACKAGE_LABEL: Record<QaCaseKey, string> = {
  con_pension: "Hab. doble con Pensión Completa",
  sin_pension: "Cabaña Triple",
};

export const QA_DEMO_MEAL_PRICE = 35000;

/**
 * Illustrative meal program, local only: selectable in the UI to try the flow,
 * never persisted (normalizeFoodSurveyQa strips meals and the server rejects them).
 */
export function qaDemoOffer(caseKey: QaCaseKey): Array<MealSlot & { addon_id: string; precio: number; currency: string }> {
  if (caseKey === "con_pension") return [];
  const slots: MealSlot[] = [
    { fecha: "2026-11-05", tipo: "cena" },
    ...["2026-11-06", "2026-11-07", "2026-11-08"].flatMap((f) => [
      { fecha: f, tipo: "almuerzo" as const },
      { fecha: f, tipo: "cena" as const },
    ]),
    { fecha: "2026-11-09", tipo: "almuerzo" },
  ];
  return slots.map((m) => ({ ...m, addon_id: `qa-demo-${m.tipo}`, precio: QA_DEMO_MEAL_PRICE, currency: "ARS" }));
}
