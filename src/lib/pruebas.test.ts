import { describe, it, expect } from "vitest";
import {
  tipoRegistro,
  esPrueba,
  esPruebaActiva,
  esPruebaCerrada,
  resultadoLabel,
  diasAfuera,
  alertaAntiguedad,
  separarPorTipo,
} from "./pruebas";

describe("pruebas · clasificación", () => {
  it("los registros históricos sin tipo siguen siendo cambios", () => {
    expect(tipoRegistro({})).toBe("cambio");
    expect(tipoRegistro({ tipo: null })).toBe("cambio");
    expect(esPrueba({})).toBe(false);
  });

  it("reconoce prueba y devolución", () => {
    expect(tipoRegistro({ tipo: "prueba" })).toBe("prueba");
    expect(tipoRegistro({ tipo: "devolucion" })).toBe("devolucion");
  });

  it("una prueba pendiente está activa y no cerrada", () => {
    const p = { tipo: "prueba", prueba_resultado: "pendiente" };
    expect(esPruebaActiva(p)).toBe(true);
    expect(esPruebaCerrada(p)).toBe(false);
  });

  it("una prueba devuelta o vendida queda cerrada", () => {
    expect(esPruebaCerrada({ tipo: "prueba", prueba_resultado: "devuelta" })).toBe(true);
    expect(esPruebaCerrada({ tipo: "prueba", prueba_resultado: "convertida_en_venta" })).toBe(true);
    expect(esPruebaActiva({ tipo: "prueba", prueba_resultado: "convertida_en_venta" })).toBe(false);
  });

  it("un cambio real nunca cuenta como prueba activa", () => {
    expect(esPruebaActiva({ tipo: "cambio", prueba_resultado: null })).toBe(false);
  });
});

describe("pruebas · etiquetas y antigüedad", () => {
  it("etiqueta legible por resultado", () => {
    expect(resultadoLabel({ tipo: "prueba", prueba_resultado: "pendiente" })).toBe("En prueba");
    expect(resultadoLabel({ tipo: "prueba", prueba_resultado: "devuelta" })).toBe("Devuelta");
    expect(resultadoLabel({ tipo: "prueba", prueba_resultado: "convertida_en_venta" })).toBe("Se la quedó (vendida)");
  });

  it("cuenta días desde la salida y cae en created_at si falta", () => {
    const now = new Date("2026-08-31T12:00:00Z");
    expect(diasAfuera({ prueba_salida_at: "2026-08-21T12:00:00Z" }, now)).toBe(10);
    expect(diasAfuera({ created_at: "2026-08-29T12:00:00Z" }, now)).toBe(2);
    expect(diasAfuera({}, now)).toBe(0);
  });

  it("semáforo de antigüedad", () => {
    expect(alertaAntiguedad(3)).toBe("ok");
    expect(alertaAntiguedad(9)).toBe("atencion");
    expect(alertaAntiguedad(20)).toBe("critico");
  });
});

describe("pruebas · separación de universos", () => {
  it("no mezcla cambios con pruebas", () => {
    const rows = [
      { tipo: "cambio" },
      { tipo: null },
      { tipo: "prueba", prueba_resultado: "pendiente" },
      { tipo: "prueba", prueba_resultado: "devuelta" },
      { tipo: "devolucion" },
    ];
    const r = separarPorTipo(rows);
    expect(r.cambios).toHaveLength(2);
    expect(r.devoluciones).toHaveLength(1);
    expect(r.pruebas).toHaveLength(2);
    expect(r.pruebasActivas).toHaveLength(1);
  });
});
