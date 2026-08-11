import { describe, it, expect } from "vitest";
import { deriveMpConciliacionEstado } from "./mpConciliacion";

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
});
