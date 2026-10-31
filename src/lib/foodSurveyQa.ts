import { normalizeFoodSurvey, validateFoodSurvey, type FoodSurveyData } from "./foodSurvey";

/** QA never invents a meal program or produces purchasable services. */
export function normalizeFoodSurveyQa(data: FoodSurveyData, included: boolean) {
  if (Object.keys(validateFoodSurvey(data)).length) throw new Error("Revisá las respuestas marcadas");
  return normalizeFoodSurvey({ ...data, comidas_solicitadas: [] }, included);
}