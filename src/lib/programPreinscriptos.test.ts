import { describe, it, expect } from "vitest";
import { resolvePreinscriptoStatus, findSedeAnswer } from "./programPreinscriptos";

describe("resolvePreinscriptoStatus", () => {
  it("solo preinscripción → preinscripto", () => {
    expect(resolvePreinscriptoStatus("nuevo", [])).toBe("preinscripto");
  });
  it("suscripción sin pago → pendiente de pago", () => {
    expect(resolvePreinscriptoStatus("nuevo", [{ id: "1", estado: "pendiente_pago" }])).toBe("pendiente_pago");
    expect(resolvePreinscriptoStatus("nuevo", [{ id: "1", estado: "pendiente_verificacion" }])).toBe("pendiente_pago");
  });
  it("suscripción activa → inscripto", () => {
    expect(resolvePreinscriptoStatus("nuevo", [{ id: "1", estado: "activa" }])).toBe("inscripto");
  });
  it("inscripto prevalece sobre No continúa", () => {
    expect(resolvePreinscriptoStatus("descartado", [{ id: "1", estado: "activa" }])).toBe("inscripto");
    expect(resolvePreinscriptoStatus("descartado", [{ id: "1", estado: "pendiente_pago" }])).toBe("pendiente_pago");
  });
  it("No continúa manual sin inscripción", () => {
    expect(resolvePreinscriptoStatus("descartado", [{ id: "1", estado: "cancelada" }])).toBe("no_continua");
  });
  it("bajas no cuentan", () => {
    expect(resolvePreinscriptoStatus("nuevo", [{ id: "1", estado: "cancelada" }])).toBe("preinscripto");
  });
});

describe("findSedeAnswer", () => {
  it("encuentra la sede", () => {
    expect(findSedeAnswer([{ id: "q_sede", label: "¿Qué sede?" }], { q_sede: "KDT" })).toBe("KDT");
    expect(findSedeAnswer([{ id: "q_x", label: "Zona" }], { q_x: "a" })).toBeNull();
  });
});
