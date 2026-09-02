import { describe, it, expect } from "vitest";
import { formatDuracion, formatDuracionCorta, toMinutos, sumarMinutos, duracionEfectiva } from "./duration";

describe("duration helpers", () => {
  it("formatea minutos en formato humano", () => {
    expect(formatDuracion(45)).toBe("45 min");
    expect(formatDuracion(60)).toBe("1 h");
    expect(formatDuracion(90)).toBe("1 h 30 min");
    expect(formatDuracion(210)).toBe("3 h 30 min");
  });

  it("no muestra 0 h, NaN ni negativos", () => {
    expect(formatDuracion(0)).toBe("—");
    expect(formatDuracion(null)).toBe("—");
    expect(formatDuracion(undefined)).toBe("—");
    expect(formatDuracion(-30)).toBe("—");
    expect(formatDuracion(NaN)).toBe("—");
    expect(formatDuracion("abc")).toBe("—");
  });

  it("no interpreta >24h como hora del día", () => {
    expect(formatDuracion(1500)).toBe("1 día 1 h");
    expect(formatDuracion(2880)).toBe("2 días");
  });

  it("formato corto para badges", () => {
    expect(formatDuracionCorta(45)).toBe("45 min");
    expect(formatDuracionCorta(120)).toBe("2 h");
    expect(formatDuracionCorta(90)).toBe("1 h 30");
  });

  it("normaliza strings numéricos", () => {
    expect(toMinutos("90")).toBe(90);
    expect(toMinutos(90.4)).toBe(90);
    expect(toMinutos("")).toBe(null);
  });

  it("suma en minutos ignorando nulos", () => {
    expect(sumarMinutos([60, null, "30", 0, -5])).toBe(90);
    expect(formatDuracion(sumarMinutos([90, 120, 90]))).toBe("5 h");
  });

  it("prioriza duración real en sesiones realizadas", () => {
    expect(duracionEfectiva({ realizada: true, duracionRealMin: 75, duracionPlanificadaMin: 90 })).toBe(75);
    expect(duracionEfectiva({ realizada: true, duracionRealMin: null, duracionPlanificadaMin: 90 })).toBe(90);
    expect(duracionEfectiva({ realizada: false, duracionRealMin: 75, duracionPlanificadaMin: 90 })).toBe(90);
    expect(duracionEfectiva({ realizada: false })).toBe(null);
  });
});
