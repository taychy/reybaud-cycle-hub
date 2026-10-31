import { describe, it, expect } from "vitest";
import { buildMealCalendar, calendarReadiness, activeMealsForStay, offerableMeals } from "./foodSurvey";

const bounds = { start: "2026-11-05", end: "2026-11-09" };

describe("configuración del programa gastronómico", () => {
  it("genera almuerzo y cena del 5 al 9/11, todo pendiente (nada activo de oficio)", () => {
    const cal = buildMealCalendar(bounds, null);
    expect(cal).toHaveLength(10);
    expect(cal.every((c) => c.estado === "pendiente")).toBe(true);
    expect(cal[0]).toEqual({ fecha: "2026-11-05", tipo: "almuerzo", estado: "pendiente" });
    expect(cal.some((c) => (c.tipo as string) === "desayuno")).toBe(false);
  });
  it("no está lista para activar con servicios sin decidir", () => {
    const cal = buildMealCalendar(bounds, [{ fecha: "2026-11-05", tipo: "cena", estado: "activo" }]);
    expect(calendarReadiness(cal, { almuerzo: true, cena: true }).ready).toBe(false);
  });
  it("exige Extra regular para cada tipo activo", () => {
    const cal = buildMealCalendar(bounds, null).map((c) => ({ ...c, estado: c.tipo === "cena" ? "activo" as const : "inactivo" as const }));
    expect(calendarReadiness(cal, { almuerzo: false, cena: false }).faltaExtra).toEqual(["cena"]);
    expect(calendarReadiness(cal, { almuerzo: false, cena: true }).ready).toBe(true);
  });
  it("estadía 6–9 no incluye servicios del 5/11; 5–8 no incluye el 9/11", () => {
    const cal = buildMealCalendar(bounds, null).map((c) => ({ ...c, estado: "activo" as const }));
    expect(activeMealsForStay(cal, { start: "2026-11-06", end: "2026-11-09" }).some((c) => c.fecha === "2026-11-05")).toBe(false);
    expect(activeMealsForStay(cal, { start: "2026-11-05", end: "2026-11-08" }).some((c) => c.fecha === "2026-11-09")).toBe(false);
    expect(activeMealsForStay(cal, { start: "2026-11-05", end: "2026-11-08" })).toHaveLength(8);
  });
  it("sin pensión: 4 servicios a ARS 35.000; con pensión: nada ofertable", () => {
    const program = { almuerzo_addon_id: "a", cena_addon_id: "c", meals: [
      { fecha: "2026-11-06", tipo: "almuerzo" as const }, { fecha: "2026-11-06", tipo: "cena" as const },
      { fecha: "2026-11-07", tipo: "almuerzo" as const }, { fecha: "2026-11-07", tipo: "cena" as const } ] };
    const addons = ["a", "c"].map((id) => ({ id, event_id: "e", precio: 35000, currency: "ARS", activo: true }));
    const base = { program, eventId: "e", stay: { start: "2026-11-06", end: "2026-11-09" }, packageId: "p", addons, contracted: [] };
    const sin = offerableMeals({ ...base, pensionIncluded: false });
    expect(sin.reduce((s, m) => s + m.precio, 0)).toBe(140000);
    expect(offerableMeals({ ...base, pensionIncluded: true })).toEqual([]);
  });
});
