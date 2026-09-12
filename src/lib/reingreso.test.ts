import { describe, it, expect } from "vitest";
import {
  parseReingresoContext,
  needsPeriodChoice,
  effectivePurchasePeriod,
  existingSubForPeriod,
  optionLabel,
} from "@/lib/reingreso";
import { resolvePurchasePeriod } from "@/lib/subscriptionPeriod";

const ago = { fecha_inicio: "2026-08-01", fecha_fin: "2026-08-31" };
const sep = { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30" };

const rawActivo = {
  found: true,
  es_reingreso: false,
  motivo: null,
  estado_alumno: "activo",
  continuidad_mes_anterior: true,
  ultima_cobertura: "2026-08-31",
  opciones: [ago, sep],
};

const rawInactivo = {
  found: true,
  es_reingreso: true,
  motivo: "alumno_no_activo",
  estado_alumno: "inactivo",
  continuidad_mes_anterior: false,
  ultima_cobertura: "2026-05-31",
  opciones: [ago, sep],
};

describe("reingreso", () => {
  it("alumno activo con agosto pago: el pago del 31/08 va a septiembre sin preguntar", () => {
    const ctx = parseReingresoContext(rawActivo)!;
    expect(needsPeriodChoice({ context: ctx })).toBe(false);
    const period = resolvePurchasePeriod({ today: "2026-08-31", coveredUntil: "2026-08-31" });
    expect(period.fechaInicio).toBe("2026-09-01");
    expect(period.fechaFin).toBe("2026-09-30");
    expect(effectivePurchasePeriod(period, null)).toMatchObject({
      fechaInicio: "2026-09-01",
      explicit: false,
    });
  });

  it("alumno inactivo desde mayo: el checkout del 31/08 obliga a elegir agosto o septiembre", () => {
    const ctx = parseReingresoContext(rawInactivo)!;
    expect(needsPeriodChoice({ context: ctx })).toBe(true);
    expect(ctx.opciones.map((o) => o.fechaInicio)).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("alumno inactivo que elige septiembre: no se crea agosto", () => {
    const ctx = parseReingresoContext(rawInactivo)!;
    const chosen = { fechaInicio: "2026-09-01", fechaFin: "2026-09-30" };
    expect(needsPeriodChoice({ context: ctx, chosen })).toBe(false);
    const inferred = resolvePurchasePeriod({ today: "2026-08-31" });
    const eff = effectivePurchasePeriod(inferred, chosen);
    expect(eff).toEqual({ fechaInicio: "2026-09-01", fechaFin: "2026-09-30", explicit: true });
    expect(eff.fechaInicio).not.toBe("2026-08-01");
  });

  it("alumno inactivo que elige agosto: la obligación es agosto (septiembre queda para la renovación normal)", () => {
    const ctx = parseReingresoContext(rawInactivo)!;
    const chosen = { fechaInicio: "2026-08-01", fechaFin: "2026-08-31" };
    // Sin elección, la inferencia de fin de mes habría saltado a septiembre.
    const inferred = resolvePurchasePeriod({ today: "2026-08-31" });
    expect(inferred.fechaInicio).toBe("2026-09-01");
    const eff = effectivePurchasePeriod(inferred, chosen);
    expect(eff).toEqual({ fechaInicio: "2026-08-01", fechaFin: "2026-08-31", explicit: true });
  });

  it("deuda real del mes actual: aparece como opción abonable", () => {
    const ctx = parseReingresoContext({
      ...rawInactivo,
      opciones: [
        { ...ago, suscripcion_id: "sub-ago", suscripcion_estado: "vencida", monto: 83500, es_deuda_existente: true },
        sep,
      ],
    })!;
    const deuda = ctx.opciones[0];
    expect(deuda.esDeudaExistente).toBe(true);
    expect(deuda.monto).toBe(83500);
    expect(deuda.suscripcionId).toBe("sub-ago");
  });

  it("período ya existente: se reutiliza la obligación en vez de duplicar", () => {
    const ctx = parseReingresoContext({
      ...rawInactivo,
      opciones: [ago, { ...sep, suscripcion_id: "sub-sep", suscripcion_estado: "pendiente" }],
    })!;
    const reuse = existingSubForPeriod(ctx, { fechaInicio: "2026-09-01" });
    expect(reuse?.suscripcionId).toBe("sub-sep");
    expect(existingSubForPeriod(ctx, { fechaInicio: "2026-08-01" })).toBeNull();
  });

  it("no pregunta en upgrade, pausa ni renovación anticipada", () => {
    const ctx = parseReingresoContext(rawInactivo)!;
    expect(needsPeriodChoice({ context: ctx, isUpgrade: true })).toBe(false);
    expect(needsPeriodChoice({ context: ctx, isPausa: true })).toBe(false);
    expect(needsPeriodChoice({ context: ctx, isEarlyRenewal: true })).toBe(false);
    expect(needsPeriodChoice({ context: ctx, scheduleAfterPausa: true })).toBe(false);
  });

  it("la aprobación del pago conserva el período elegido (no depende del día)", () => {
    const chosen = { fechaInicio: "2026-09-01", fechaFin: "2026-09-30" };
    for (const today of ["2026-08-31", "2026-09-01", "2026-09-15"]) {
      const eff = effectivePurchasePeriod(resolvePurchasePeriod({ today }), chosen);
      expect(eff.fechaInicio).toBe("2026-09-01");
    }
  });

  it("etiqueta legible del período", () => {
    const ctx = parseReingresoContext(rawInactivo)!;
    expect(optionLabel(ctx.opciones[1])).toBe("Septiembre 2026 · 01/09 al 30/09");
  });

  it("contexto inexistente no fuerza el paso", () => {
    expect(parseReingresoContext({ found: false })).toBeNull();
    expect(needsPeriodChoice({ context: null })).toBe(false);
  });
});
