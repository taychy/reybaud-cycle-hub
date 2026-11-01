import { describe, expect, it } from "vitest";
import { additionalDayReference, additionalDaySelectedStay, isAdditionalDayExtension, needsAdditionalDayReview, showProgramExtensionReview } from "./tripAdditionalDay";

describe("día adicional", () => {
  it.each([280000, 315000, 220000])("preserva referencia provisional ARS %s sin aprobación comercial", (amount) => {
    expect(additionalDayReference(amount, "ARS")).toEqual({ amount, currency: "ARS" });
  });
  it("sin referencia válida no inventa valor", () => {
    expect(additionalDayReference(null, "ARS")).toBeNull();
    expect(additionalDayReference(0, "ARS")).toBeNull();
  });
  it("5–9 conserva las fechas elegidas y cuatro noches, sin ofrecer 5–10 o 4–9", () => {
    expect(additionalDaySelectedStay({ start: "2026-11-05", end: "2026-11-09", original_nights: 3, selected_nights: 4 })).toEqual({ start: "2026-11-05", end: "2026-11-09", selectedNights: 4, originalNights: 3 });
  });
  it("5–8 son tres noches, no corresponde pregunta de jornada adicional", () => {
    expect(additionalDaySelectedStay({ start: "2026-11-05", end: "2026-11-08", original_nights: 3, selected_nights: 3 })).toBeNull();
  });
  it("6–9 son tres noches, no corresponde pregunta de jornada adicional", () => {
    expect(additionalDaySelectedStay({ start: "2026-11-06", end: "2026-11-09", original_nights: 3, selected_nights: 3 })).toBeNull();
  });
  it("rechaza duración incoherente con las fechas sin corregirlas", () => {
    expect(additionalDaySelectedStay({ start: "2026-11-05", end: "2026-11-08", original_nights: 3, selected_nights: 4 })).toBeNull();
  });
  it("4 noches frente al paquete original de 3 es ampliación", () => expect(isAdditionalDayExtension({ original_nights: 3, selected_nights: 4 })).toBe(true));
  it("3 noches reprogramadas no son ampliación", () => expect(isAdditionalDayExtension({ original_nights: 3, selected_nights: 3 })).toBe(false));
  it("respuesta No queda en revisión", () => expect(needsAdditionalDayReview({ status: "no", existing_night: false })).toBe(true));
  it("noche previa queda en revisión hasta resolver", () => {
    expect(needsAdditionalDayReview({ status: "interesado", existing_night: true })).toBe(true);
    expect(needsAdditionalDayReview({ status: "resuelto", existing_night: true })).toBe(false);
  });
  it("interfaz no pide revisar una extensión sin respuesta por tener alojamiento extra", () => {
    const context = { answer: null, status: "sin_respuesta" as const, existing_night: true };
    expect(showProgramExtensionReview(context)).toBe(false);
  });
  it("interfaz permite revisar Sí No y Consultar independientemente del alojamiento", () => {
    for (const answer of ["interesado", "no", "consulta"] as const) {
      expect(showProgramExtensionReview({ answer, status: answer })).toBe(true);
      expect(showProgramExtensionReview({ answer, status: "resuelto" })).toBe(false);
    }
  });
});