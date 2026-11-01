import { describe, expect, it } from "vitest";
import { isAdditionalDayExtension, needsAdditionalDayReview } from "./tripAdditionalDay";

describe("día adicional", () => {
  it("4 noches frente al paquete original de 3 es ampliación", () => expect(isAdditionalDayExtension({ original_nights: 3, selected_nights: 4 })).toBe(true));
  it("3 noches reprogramadas no son ampliación", () => expect(isAdditionalDayExtension({ original_nights: 3, selected_nights: 3 })).toBe(false));
  it("respuesta No queda en revisión", () => expect(needsAdditionalDayReview({ status: "no", existing_night: false })).toBe(true));
  it("noche previa queda en revisión hasta resolver", () => {
    expect(needsAdditionalDayReview({ status: "interesado", existing_night: true })).toBe(true);
    expect(needsAdditionalDayReview({ status: "resuelto", existing_night: true })).toBe(false);
  });
});