import { describe, it, expect } from "vitest";
import { buildFechaNacimientoISO, toLocalISODate } from "../turneraDates";

describe("buildFechaNacimientoISO", () => {
  it("alumno existente sin fecha de nacimiento → null (antes '-00-00')", () => {
    expect(buildFechaNacimientoISO("", "", "")).toBeNull();
  });
  it("fecha incompleta → null", () => {
    expect(buildFechaNacimientoISO("1990", "", "5")).toBeNull();
  });
  it("fecha imposible → null", () => {
    expect(buildFechaNacimientoISO("2023", "2", "30")).toBeNull();
  });
  it("fecha válida → ISO", () => {
    expect(buildFechaNacimientoISO("1990", "3", "7")).toBe("1990-03-07");
  });
});

describe("toLocalISODate", () => {
  it("sábado 24/10/2026 local", () => {
    expect(toLocalISODate(new Date(2026, 9, 24))).toBe("2026-10-24");
  });
});
