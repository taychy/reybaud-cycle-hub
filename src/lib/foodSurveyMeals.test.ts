import { describe, it, expect } from "vitest";
import { contractedMealsFromAddons, mealRequestTotal, normalizeFoodSurvey, offerableMeals, parseMealProgram } from "./foodSurvey";

const meta = {
  food_survey: {
    enabled: true,
    meal_program: {
      almuerzo_addon_id: "A",
      cena_addon_id: "C",
      meals: [
        { fecha: "2026-11-05", tipo: "cena" },
        { fecha: "2026-11-06", tipo: "almuerzo" },
        { fecha: "2026-11-06", tipo: "cena" },
      ],
    },
  },
};
const addons = [
  { id: "A", precio: 35000, currency: "ARS", activo: true },
  { id: "C", precio: 35000, currency: "ARS", activo: true },
];
const program = parseMealProgram(meta);

describe("comidas adicionales", () => {
  it("sin programa real no ofrece ninguna comida", () => {
    expect(parseMealProgram({ food_survey: { enabled: true } })).toBeNull();
    expect(offerableMeals({ program: null, pensionIncluded: false, packageId: "p", addons, contracted: [] })).toEqual([]);
  });

  it("con pensión completa no ofrece comidas", () => {
    expect(offerableMeals({ program, pensionIncluded: true, packageId: "p", addons, contracted: [] })).toEqual([]);
  });

  it("almuerzo y cena a ARS 35.000 por comida, total = cantidad x 35.000", () => {
    const offer = offerableMeals({ program, pensionIncluded: false, packageId: "p", addons, contracted: [] });
    expect(offer).toHaveLength(3);
    const t = mealRequestTotal(
      [{ fecha: "2026-11-06", tipo: "almuerzo" }, { fecha: "2026-11-06", tipo: "cena" }, { fecha: "2026-11-06", tipo: "cena" }],
      offer,
    );
    expect(t).toEqual({ cantidad: 2, total: 70000 });
  });

  it("excluye comidas ya contratadas en Extras", () => {
    const done = contractedMealsFromAddons(program, [{ addon_id: "C", notas: "Cenas 2026-11-05" }]);
    const offer = offerableMeals({ program, pensionIncluded: false, packageId: "p", addons, contracted: done });
    expect(offer.map((o) => `${o.fecha}|${o.tipo}`)).toEqual(["2026-11-06|almuerzo", "2026-11-06|cena"]);
  });

  it("no ofrece comidas si el Extra está inactivo", () => {
    const offer = offerableMeals({ program, pensionIncluded: false, packageId: "p", addons: [{ ...addons[0], activo: false }, addons[1]], contracted: [] });
    expect(offer.every((o) => o.tipo === "cena")).toBe(true);
  });

  it("al guardar con pensión incluida descarta comidas solicitadas", () => {
    expect(normalizeFoodSurvey({ comidas_solicitadas: [{ fecha: "2026-11-06", tipo: "cena" }] }, true).comidas_solicitadas).toEqual([]);
  });
});

describe("agregar todas las comidas de mi estadía", () => {
  it("selecciona todos los almuerzos y cenas ofertables, sin los ya comprados, a 35.000 c/u", async () => {
    const { allStayMeals, mealSelectionMode } = await import("./foodSurvey");
    const done = contractedMealsFromAddons(program, [{ addon_id: "A", notas: "2026-11-06" }]);
    const offer = offerableMeals({ program, pensionIncluded: false, packageId: "p", addons, contracted: done });
    const all = allStayMeals(offer);
    expect(all.map((m) => `${m.fecha}|${m.tipo}`)).toEqual(["2026-11-05|cena", "2026-11-06|cena"]);
    expect(mealRequestTotal(all, offer)).toEqual({ cantidad: 2, total: 70000 });
    expect(mealSelectionMode(all, offer, null)).toBe("todas");
    expect(mealSelectionMode([], offer, null)).toBe("ninguna");
  });

  it("sin programa no selecciona nada", async () => {
    const { allStayMeals } = await import("./foodSurvey");
    expect(allStayMeals(offerableMeals({ program: null, pensionIncluded: false, packageId: "p", addons, contracted: [] }))).toEqual([]);
  });
});
