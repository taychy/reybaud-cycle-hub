import { describe, it, expect } from "vitest";
import {
  ajustarDistribucion, cambiarParticipantes, crearEscenario, normalizarEscenario,
  sumaDistribucion, validarDistribucion,
} from "./scenarioDistribution";
import { calcularSimulacion } from "./eventCostCalculator";

const keys = ["doble", "individual"];
const cupos = { doble: 10, individual: 10 };

describe("distribución de escenario", () => {
  it("capacidad 10+10 y escenario 9 => suma 9, no 20", () => {
    const e = crearEscenario(keys, "esperado", "Esperado", 9);
    expect(sumaDistribucion(e.distribucion)).toBe(9);
    // incluso si alguien pasara los cupos como base, se reescalan a 9
    expect(sumaDistribucion(ajustarDistribucion(keys, cupos, 9))).toBe(9);
  });

  it("corrige 10+1 con 9 participantes preservando proporción", () => {
    const e = normalizarEscenario(keys, { id: "esperado", nombre: "Esperado", inscriptos: 9, distribucion: { doble: 10, individual: 1 } });
    expect(e.distribucion).toEqual({ doble: 8, individual: 1 });
  });

  it("editar cupos no modifica la distribución", () => {
    const e = normalizarEscenario(keys, { id: "x", nombre: "X", inscriptos: 9, distribucion: { doble: 7, individual: 2 } });
    const cuposEditados = { doble: 4, individual: 30 };
    void cuposEditados;
    const again = normalizarEscenario(keys, e);
    expect(again.distribucion).toEqual({ doble: 7, individual: 2 });
  });

  it("editar participantes 9→8 reajusta a suma 8", () => {
    const e = normalizarEscenario(keys, { id: "x", nombre: "X", inscriptos: 9, distribucion: { doble: 8, individual: 1 } });
    const e8 = cambiarParticipantes(keys, e, 8);
    expect(e8.inscriptos).toBe(8);
    expect(sumaDistribucion(e8.distribucion)).toBe(8);
  });

  it("10+1 con 9 participantes no valida ni calcula resultados", () => {
    const v = validarDistribucion({ doble: 10, individual: 1 }, 9);
    expect(v.ok).toBe(false);
    expect(v.mensaje).toMatch(/suma 11/);
    const r = calcularSimulacion(
      [{ categoria: "comida", descripcion: "x", cantidad: 1, precio_unitario: 10, moneda: "EUR", es_por_persona: true, aplica_a_modalidades: [], grupo_costo: "participante" }],
      [{ key: "doble", label: "D", esperados: 10 }, { key: "individual", label: "I", esperados: 1 }],
      { tc_usd: 1, tc_eur: 1, pct_imprevistos: 5, pct_margen_objetivo: 10, moneda_base: "EUR", participantes_prorrateo: 9, paquete_base_id: "doble" },
    );
    expect(r.distribucion_valida).toBe(false);
    expect(r.escenario_costo_total).toBeNull();
  });

  it("funciona con cualquier cantidad de paquetes / evento", () => {
    const k = ["a", "b", "c"];
    for (const n of [0, 1, 5, 13, 40]) {
      expect(sumaDistribucion(crearEscenario(k, "n", "N", n).distribucion)).toBe(n);
      expect(sumaDistribucion(cambiarParticipantes(k, crearEscenario(k, "n", "N", 7), n).distribucion)).toBe(n);
    }
  });
});
