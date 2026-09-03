import { describe, it, expect } from "vitest";
import { calcularResumenMes, desgloseOrdenado, mesLabel, ultimosMeses, type ResumenMesRaw } from "./finanzasResumen";

const base: ResumenMesRaw = {
  mes: "2026-09",
  moneda: "ARS",
  entro: 5_122_260,
  desglose: { escuela: 1_941_940, viajes: 691_475, personalizadas: 247_500, sin_identificar: 2_241_345 },
  falta_cobrar_mes: 11_298_226.66,
  vencido_de_antes: 19_555_669,
  salio: 831_758.58,
  salio_gastos: 777_610.05,
  salio_mp_sin_gasto: 54_148.53,
  falta_pagar: 10_339_807.87,
  falta_pagar_filas: 49,
  liquidaciones_generadas: false,
  liquidaciones_pendientes: 0,
};

describe("resumen financiero del mes", () => {
  it("(h) Saldo del mes = Entró - Salió", () => {
    const r = calcularResumenMes(base);
    expect(r.saldoDelMes).toBeCloseTo(5_122_260 - 831_758.58, 2);
  });

  it("(f) Entró no suma facturas, ajustes ni imputaciones: es exactamente lo informado por la fuente", () => {
    const r = calcularResumenMes(base);
    expect(r.entro).toBe(5_122_260);
    const sumaDesglose = Object.values(base.desglose).reduce((a, b) => a + b, 0);
    expect(sumaDesglose).toBeCloseTo(r.entro, 2);
  });

  it("(c) Salió no duplica: gastos + egresos MP sin gasto", () => {
    expect(base.salio).toBeCloseTo(base.salio_gastos + base.salio_mp_sin_gasto, 2);
  });

  it("(g) Falta cobrar separa mes vigente de vencido arrastrado", () => {
    const r = calcularResumenMes(base);
    expect(r.falta_cobrar_mes).toBe(11_298_226.66);
    expect(r.vencido_de_antes).toBe(19_555_669);
    expect(r.falta_cobrar_mes).not.toBe(r.falta_cobrar_mes + r.vencido_de_antes);
  });

  it("Cómo puede cerrar el mes usa sólo lo pendiente del mes", () => {
    const r = calcularResumenMes(base);
    expect(r.comoPuedeCerrar).toBeCloseTo(
      5_122_260 + 11_298_226.66 - 831_758.58 - 10_339_807.87,
      2,
    );
  });

  it("(i) marca estimación incompleta si no hay liquidaciones generadas", () => {
    const r = calcularResumenMes(base);
    expect(r.estimacionIncompleta).toBe(true);
    expect(r.motivosIncompleta.join(" ")).toContain("liquidaciones");
  });

  it("(i) marca estimación incompleta si no hay ningún compromiso cargado", () => {
    const r = calcularResumenMes({ ...base, falta_pagar: null, falta_pagar_filas: 0, liquidaciones_generadas: true });
    expect(r.estimacionIncompleta).toBe(true);
    expect(r.motivosIncompleta.join(" ")).toContain("compromisos");
    // falta_pagar null se trata como 0 para el cálculo, pero la UI muestra "Sin datos cargados"
    expect(r.falta_pagar).toBeNull();
  });

  it("no marca incompleta cuando todas las fuentes existen", () => {
    const r = calcularResumenMes({ ...base, liquidaciones_generadas: true });
    expect(r.estimacionIncompleta).toBe(false);
  });

  it("desglose ordenado omite unidades en cero", () => {
    const d = desgloseOrdenado(base);
    expect(d.map((x) => x.unidad)).toEqual(["escuela", "viajes", "personalizadas", "sin_identificar"]);
    expect(d.find((x) => x.unidad === "tienda")).toBeUndefined();
  });

  it("etiquetas de mes sin corrimiento de zona horaria", () => {
    expect(mesLabel("2026-09")).toBe("Septiembre 2026");
    expect(mesLabel("2026-01")).toBe("Enero 2026");
  });

  it("lista de meses recientes empieza por el mes indicado", () => {
    const m = ultimosMeses(new Date(2026, 8, 3), 3);
    expect(m).toEqual(["2026-09", "2026-08", "2026-07"]);
  });
});
