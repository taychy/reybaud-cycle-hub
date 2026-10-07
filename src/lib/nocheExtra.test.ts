import { describe, it, expect } from "vitest";
import { isNocheCompartida, isNocheExtra, isReservaActivaNoche, unidadesPorTiming } from "./nocheExtra";

describe("noches extra", () => {
  it("detecta modalidad", () => {
    expect(isNocheExtra("Noche extra Hab. Individual")).toBe(true);
    expect(isNocheCompartida("Noche extra Hab. Individual")).toBe(false);
    expect(isNocheCompartida("Noche extra en habitación doble. (Leer descripción)")).toBe(true);
    expect(isNocheCompartida("Habitación doble")).toBe(false);
  });
  it("unidades", () => {
    expect(unidadesPorTiming("ambas")).toBe(2);
    expect(unidadesPorTiming("antes")).toBe(1);
  });
  it("elegibilidad", () => {
    expect(isReservaActivaNoche({ reservation_status: "reserva_confirmada" })).toBe(true);
    expect(isReservaActivaNoche({ reservation_status: "cancelada" })).toBe(false);
    expect(isReservaActivaNoche({ reservation_status: "reserva_confirmada", cancelled_at: "2026-01-01" })).toBe(false);
  });
});
