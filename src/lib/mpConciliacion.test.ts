import { describe, it, expect } from "vitest";
import { canOfferGenericImputation, deriveMpConciliacionEstado } from "./mpConciliacion";

describe("deriveMpConciliacionEstado", () => {
  it("sin alumno → SIN IDENTIFICAR", () => {
    expect(deriveMpConciliacionEstado({})).toBe("sin_identificar");
  });

  it("alumno_id sin destino → IDENTIFICADO · FALTA IMPUTAR", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1" })).toBe("identificado_sin_imputar");
  });

  it("alumno_id + suscripcion_id → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", suscripcion_id: "s1" })).toBe("imputado");
  });

  it("alumno_id + reservation_payment_id → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", reservation_payment_id: "r1" })).toBe("imputado");
  });

  it("crédito aplicado a una deuda → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", credito_aplicado: true })).toBe("imputado");
  });
  it("un crédito de 80030 no permite imputar otra vez el mismo cobro", () => {
    expect(canOfferGenericImputation({ alumno_id: "a1", credito_representado: 80030, monto_disponible: 0 })).toBe(false);
  });
  it("un crédito familiar parcial conserva su remanente sin ofrecer asignación del total", () => {
    const movement = { alumno_id: "a1", credito_representado: 600, monto_disponible: 400 };
    expect(canOfferGenericImputation(movement)).toBe(false);
    expect(deriveMpConciliacionEstado(movement)).toBe("identificado_sin_imputar");
  });
  it("un cobro sin representación y con remanente puede imputarse", () => {
    expect(canOfferGenericImputation({ alumno_id: "a1", credito_representado: 0, monto_disponible: 400 })).toBe(true);
  });
});
