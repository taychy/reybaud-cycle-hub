import { describe, it, expect } from "vitest";
import { effectiveCoachSedes, diffCoachSedes, resolvePrincipalSede, dedupe } from "./coachSedes";

const A = "aaaa", B = "bbbb", C = "cccc";

describe("coachSedes", () => {
  it("usa la relación cuando existe", () => {
    expect(effectiveCoachSedes([A, B], C)).toEqual([A, B]);
  });

  it("fallback al sede_id legado cuando no hay filas", () => {
    expect(effectiveCoachSedes([], C)).toEqual([C]);
    expect(effectiveCoachSedes(null, C)).toEqual([C]);
    expect(effectiveCoachSedes(undefined, null)).toEqual([]);
  });

  it("no duplica sedes", () => {
    expect(dedupe([A, A, B])).toEqual([A, B]);
    expect(diffCoachSedes([A], [A, A, B]).toAdd).toEqual([B]);
  });

  it("guardar múltiples sedes", () => {
    expect(diffCoachSedes([], [A, B, C])).toEqual({ toAdd: [A, B, C], toRemove: [] });
  });

  it("quitar una sede", () => {
    expect(diffCoachSedes([A, B], [A])).toEqual({ toAdd: [], toRemove: [B] });
  });

  it("dejar ninguna", () => {
    expect(diffCoachSedes([A, B], [])).toEqual({ toAdd: [], toRemove: [A, B] });
    expect(resolvePrincipalSede(A, [])).toBeNull();
  });

  it("sin cambios es idempotente", () => {
    expect(diffCoachSedes([A, B], [B, A])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("mantiene la sede principal si sigue seleccionada", () => {
    expect(resolvePrincipalSede(B, [A, B])).toBe(B);
  });

  it("usa la primera seleccionada si la principal fue quitada", () => {
    expect(resolvePrincipalSede(C, [A, B])).toBe(A);
    expect(resolvePrincipalSede(null, [B])).toBe(B);
  });
});
