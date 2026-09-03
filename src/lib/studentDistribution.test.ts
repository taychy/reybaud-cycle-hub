import { describe, it, expect } from "vitest";
import {
  distribucionPorGrupo,
  distribucionPorPlan,
  contarMultiPlan,
  contarSinPlanActivo,
  contarStaffConFicha,
} from "./studentDistribution";

const alumnos = [
  { id: "a", grupo: "G2" },
  { id: "b", grupo: "G2" },
  { id: "c", grupo: "G1" },
  { id: "d", grupo: "Sin grupo" },
  { id: "e", grupo: null },
];

describe("studentDistribution", () => {
  it("cuenta por grupo de forma excluyente y suma el total", () => {
    const buckets = distribucionPorGrupo(alumnos);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(alumnos.length);
    expect(buckets[0]).toEqual({ grupo: "G2", count: 2 });
    expect(buckets[buckets.length - 1]).toEqual({ grupo: "Sin grupo", count: 2 });
  });

  it("cuenta alumnos únicos por plan (sin doble conteo)", () => {
    const entries = [
      { alumnoId: "a", planId: "p1", planNombre: "Pase Libre" },
      { alumnoId: "a", planId: "p1", planNombre: "Pase Libre" },
      { alumnoId: "b", planId: "p1", planNombre: "Pase Libre" },
      { alumnoId: "b", planId: "p2", planNombre: "Pista" },
    ];
    expect(distribucionPorPlan(entries)).toEqual([
      { planId: "p1", planNombre: "Pase Libre", count: 2 },
      { planId: "p2", planNombre: "Pista", count: 1 },
    ]);
    expect(contarMultiPlan(entries)).toBe(1);
  });

  it("no cuenta multi-plan cuando el mismo plan aparece repetido", () => {
    expect(contarMultiPlan([
      { alumnoId: "a", planId: "p1", planNombre: "X" },
      { alumnoId: "a", planId: "p1", planNombre: "X" },
    ])).toBe(0);
  });

  it("cuenta activos sin plan activo", () => {
    expect(contarSinPlanActivo(alumnos, [{ alumnoId: "a", planId: "p1", planNombre: "X" }])).toBe(4);
  });

  it("cuenta staff sólo por cruce de identidad real", () => {
    const lista = [
      { id: "a", user_id: "u1" },
      { id: "b", user_id: null },
      { id: "c", user_id: "u9" },
    ];
    expect(contarStaffConFicha(lista, new Set(["u1", "u2"]))).toBe(1);
    expect(contarStaffConFicha(lista, new Set())).toBe(0);
  });
});
