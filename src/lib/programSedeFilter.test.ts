import { describe, it, expect } from "vitest";
import { matchesSedeId, resolveSedeByName, SEDE_ALL, SEDE_NONE } from "./programSedeFilter";

const sedes = [{ id: "k", nombre: "KDT" }, { id: "p", nombre: "Parque Sarmiento" }];

describe("programSedeFilter", () => {
  it("todas incluye todo", () => {
    expect(matchesSedeId(null, SEDE_ALL, sedes)).toBe(true);
    expect(matchesSedeId("k", SEDE_ALL, sedes)).toBe(true);
  });
  it("sin sede incluye null y sedes ajenas al programa", () => {
    expect(matchesSedeId(null, SEDE_NONE, sedes)).toBe(true);
    expect(matchesSedeId("otra", SEDE_NONE, sedes)).toBe(true);
    expect(matchesSedeId("k", SEDE_NONE, sedes)).toBe(false);
  });
  it("sede específica", () => {
    expect(matchesSedeId("p", "p", sedes)).toBe(true);
    expect(matchesSedeId("k", "p", sedes)).toBe(false);
  });
  it("resuelve respuestas de formulario por nombre", () => {
    expect(resolveSedeByName("parque sarmiento", sedes)).toBe("p");
    expect(resolveSedeByName("Sede KDT", sedes)).toBe("k");
    expect(resolveSedeByName("", sedes)).toBeNull();
    expect(resolveSedeByName("Otra", sedes)).toBeNull();
  });
});
