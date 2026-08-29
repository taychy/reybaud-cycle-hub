import { describe, it, expect } from "vitest";
import {
  defaultScope,
  isScopeAvailable,
  scopeLabel,
  resolveProgramStudentIds,
  visiblePrograms,
  type StaffProgram,
} from "./staffScope";

const PLAN = "c1e21518-5bc0-47a7-9342-eee8fa6a9854";
const programas: StaffProgram[] = [
  { plan_id: PLAN, nombre: "Programa Iniciación 2026/2", alumnos_activos: 11 },
];

describe("staffScope", () => {
  it("usa el primer grupo como alcance por defecto", () => {
    expect(defaultScope(["G1", "G2"], programas)).toEqual({ tipo: "grupo", value: "G1" });
  });

  it("cae al primer programa si el staff no tiene grupos", () => {
    expect(defaultScope([], programas)).toEqual({ tipo: "programa", value: PLAN });
  });

  it("devuelve null si no hay grupos ni programas", () => {
    expect(defaultScope([], [])).toBeNull();
  });

  it("valida disponibilidad del alcance guardado", () => {
    expect(isScopeAvailable({ tipo: "grupo", value: "G1" }, ["G1"], [])).toBe(true);
    expect(isScopeAvailable({ tipo: "grupo", value: "G9" }, ["G1"], [])).toBe(false);
    expect(isScopeAvailable({ tipo: "programa", value: PLAN }, [], programas)).toBe(true);
    expect(isScopeAvailable({ tipo: "programa", value: "otro" }, [], programas)).toBe(false);
  });

  it("etiqueta el programa con nombre y cantidad de activos", () => {
    expect(scopeLabel({ tipo: "programa", value: PLAN }, programas)).toBe(
      "Programa Iniciación 2026/2 · 11 alumnos",
    );
    expect(scopeLabel({ tipo: "grupo", value: "G3" }, programas)).toBe("G3");
  });

  it("resuelve alumnos del programa sólo por suscripciones activas", () => {
    const ids = resolveProgramStudentIds(
      [
        { alumno_id: "a", plan_id: PLAN, estado: "activa" },
        { alumno_id: "b", plan_id: PLAN, estado: "cancelada" },
        { alumno_id: "c", plan_id: PLAN, estado: "activa", cancelada_at: "2026-01-01" },
        { alumno_id: "d", plan_id: "otro", estado: "activa" },
        { alumno_id: "a", plan_id: PLAN, estado: "activa" },
        { alumno_id: "e", plan_id: PLAN, estado: "vencida" },
      ],
      PLAN,
    );
    expect(ids).toEqual(["a"]);
  });

  it("oculta programas sin alumnos activos", () => {
    expect(
      visiblePrograms([...programas, { plan_id: "x", nombre: "Viejo", alumnos_activos: 0 }]),
    ).toHaveLength(1);
  });
});
