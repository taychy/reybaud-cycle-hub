import { describe, it, expect } from "vitest";
import { contractedMealsFromAddons, mealRequestTotal, normalizeFoodSurvey, offerableMeals, parseMealProgram, stayMealCoverage, type MealProgram, type MealSlot } from "./foodSurvey";

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
  { id: "A", event_id: "event", precio: 35000, currency: "ARS", activo: true },
  { id: "C", event_id: "event", precio: 35000, currency: "ARS", activo: true },
];
const program = parseMealProgram(meta);
const scope = { eventId: "event", stay: { start: "2026-11-05", end: "2026-11-09" } };

describe("comidas adicionales", () => {
  it("desayuno cubierto por alojamiento con y sin pensión y aun sin paquete conocido", () => {
    for (const pension of [true, false, null]) {
      expect(stayMealCoverage(pension).breakfastIncluded).toBe(true);
      expect(stayMealCoverage(pension).pensionIncluded).toBe(pension);
    }
  });

  it("nunca ofrece ni cobra desayuno aunque aparezca en un programa mal formado", () => {
    const breakfast = { fecha: "2026-11-06", tipo: "desayuno" };
    const raw = { ...meta.food_survey.meal_program, meals: [breakfast, ...meta.food_survey.meal_program.meals] };
    const parsed = parseMealProgram({ food_survey: { meal_program: raw } });
    expect(parsed?.meals).toHaveLength(3);
    const offer = offerableMeals({ ...scope, program: raw as MealProgram, pensionIncluded: false, packageId: "p", addons, contracted: [] });
    expect(offer).toHaveLength(3);
    expect(mealRequestTotal([breakfast as MealSlot], offer)).toEqual({ cantidad: 0, total: 0 });
    expect(normalizeFoodSurvey({ comidas_solicitadas: [breakfast as MealSlot] }, false).comidas_solicitadas).toEqual([]);
  });

  it("usa solo servicios cargados y aplicables al paquete, sin inferir dos por día", () => {
    const scoped: MealProgram = { almuerzo_addon_id: "A", cena_addon_id: "C", meals: [
      { fecha: "2026-11-05", tipo: "cena", package_ids: ["5-8", "5-9"] },
      { fecha: "2026-11-06", tipo: "almuerzo" },
      { fecha: "2026-11-08", tipo: "cena", package_ids: ["6-9", "5-9"] },
    ] };
    const count = (packageId: string) => offerableMeals({ ...scope, program: scoped, pensionIncluded: false, packageId, addons, contracted: [] });
    expect(count("5-8").map((m) => `${m.fecha}|${m.tipo}`)).toEqual(["2026-11-05|cena", "2026-11-06|almuerzo"]);
    expect(count("6-9").map((m) => `${m.fecha}|${m.tipo}`)).toEqual(["2026-11-06|almuerzo", "2026-11-08|cena"]);
    expect(mealRequestTotal(count("5-9"), count("5-9"))).toEqual({ cantidad: 3, total: 105000 });
  });

  it("programa y oferta duplicados no multiplican un servicio ni su importe", () => {
    const offer = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons, contracted: [] });
    expect(mealRequestTotal(offer, [...offer, ...offer])).toEqual({ cantidad: 3, total: 105000 });
    expect(offerableMeals({ ...scope, program: program ? { ...program, meals: [...program.meals, ...program.meals] } : null, pensionIncluded: false, packageId: "p", addons, contracted: [] })).toHaveLength(3);
  });
  it("sin programa real no ofrece ninguna comida", () => {
    expect(parseMealProgram({ food_survey: { enabled: true } })).toBeNull();
    expect(offerableMeals({ ...scope, program: null, pensionIncluded: false, packageId: "p", addons, contracted: [] })).toEqual([]);
  });

  it("con pensión completa no ofrece comidas", () => {
    expect(offerableMeals({ ...scope, program, pensionIncluded: true, packageId: "p", addons, contracted: [] })).toEqual([]);
  });

  it("almuerzo y cena a ARS 35.000 por comida, total = cantidad x 35.000", () => {
    const offer = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons, contracted: [] });
    expect(offer).toHaveLength(3);
    const t = mealRequestTotal(
      [{ fecha: "2026-11-06", tipo: "almuerzo" }, { fecha: "2026-11-06", tipo: "cena" }, { fecha: "2026-11-06", tipo: "cena" }],
      offer,
    );
    expect(t).toEqual({ cantidad: 2, total: 70000 });
  });

  it("excluye comidas ya contratadas en Extras", () => {
    const done = contractedMealsFromAddons(program, [{ addon_id: "C", notas: "Cenas 2026-11-05" }]);
    const offer = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons, contracted: done });
    expect(offer.map((o) => `${o.fecha}|${o.tipo}`)).toEqual(["2026-11-06|almuerzo", "2026-11-06|cena"]);
  });

  it("no ofrece comidas si el Extra está inactivo", () => {
    const offer = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons: [{ ...addons[0], activo: false }, addons[1]], contracted: [] });
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
    const offer = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons, contracted: done });
    const all = allStayMeals(offer);
    expect(all.map((m) => `${m.fecha}|${m.tipo}`)).toEqual(["2026-11-05|cena", "2026-11-06|cena"]);
    expect(mealRequestTotal(all, offer)).toEqual({ cantidad: 2, total: 70000 });
    expect(mealSelectionMode(all, offer, null)).toBe("todas");
    expect(mealSelectionMode([], offer, null)).toBe("ninguna");
  });

  it("sin programa no selecciona nada", async () => {
    const { allStayMeals } = await import("./foodSurvey");
    expect(allStayMeals(offerableMeals({ ...scope, program: null, pensionIncluded: false, packageId: "p", addons, contracted: [] }))).toEqual([]);
  });
});

describe("estadía individual y evento", () => {
  const dates: MealProgram = { almuerzo_addon_id: "A", cena_addon_id: "C", meals: [
    { fecha: "2026-11-04", tipo: "cena" }, { fecha: "2026-11-05", tipo: "cena" },
    { fecha: "2026-11-06", tipo: "almuerzo" }, { fecha: "2026-11-08", tipo: "cena" },
    { fecha: "2026-11-09", tipo: "almuerzo" }, { fecha: "2026-11-10", tipo: "cena" },
  ] };
  const offer = (start: string, end: string) => offerableMeals({ ...scope, program: dates, stay: { start, end }, pensionIncluded: false, packageId: "p", addons, contracted: [] });
  it("5–9 noviembre excluye 4 y 10, sin inventar servicios intermedios", () => {
    expect(offer("2026-11-05", "2026-11-09").map(m => m.fecha)).toEqual(["2026-11-05", "2026-11-06", "2026-11-08", "2026-11-09"]);
  });
  it("5–8 noviembre excluye el día 9 aunque comparta paquete", () => {
    expect(offer("2026-11-05", "2026-11-08").map(m => m.fecha)).toEqual(["2026-11-05", "2026-11-06", "2026-11-08"]);
  });
  it("6–9 noviembre excluye el día 5 aunque comparta paquete", () => {
    expect(offer("2026-11-06", "2026-11-09").map(m => m.fecha)).toEqual(["2026-11-06", "2026-11-08", "2026-11-09"]);
  });
  it("sin estadía verificable no ofrece comidas", () => {
    expect(offerableMeals({ ...scope, stay: null, program: dates, pensionIncluded: false, packageId: "p", addons, contracted: [] })).toEqual([]);
  });
  it("Extra ajeno al evento jamás se ofrece", () => {
    const result = offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons: addons.map(a => ({ ...a, event_id: "other-event" })), contracted: [] });
    expect(result).toEqual([]);
  });
  it("Extra contratado sin fecha bloquea ese servicio hasta conciliar", () => {
    expect(offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons, contracted: contractedMealsFromAddons(program, [{ addon_id: "C", notas: null }]) }).map(m => m.tipo)).toEqual(["almuerzo"]);
  });
  it("Extra restringido a otro paquete queda excluido", () => {
    expect(offerableMeals({ ...scope, program, pensionIncluded: false, packageId: "p", addons: addons.map(a => ({ ...a, aplica_a_paquetes: ["other-package"] })), contracted: [] })).toEqual([]);
  });
  it("rechaza fechas inválidas o límites invertidos", () => {
    expect(offer("2026-11-09", "2026-11-05")).toEqual([]);
    expect(offer("2026-11-31", "2026-12-01")).toEqual([]);
  });
});
