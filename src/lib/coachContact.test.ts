import { describe, it, expect } from "vitest";
import { resolveCoachPhone, buildGrupoOptions, GRUPOS_BASE } from "./coachContact";

describe("resolveCoachPhone", () => {
  const alumnos = [
    { user_id: "u1", email: "scarlettbonatto@gmail.com", telefono: "+541171711122" },
    { user_id: "u2", email: "otro@mail.com", telefono: "+541100000000" },
  ];

  it("prioriza el whatsapp explícito del coach", () => {
    const r = resolveCoachPhone({ whatsapp: " 11 2222-3333 ", user_id: "u1", email: "scarlettbonatto@gmail.com" }, alumnos);
    expect(r).toEqual({ phone: "11 2222-3333", source: "coach" });
  });

  it("usa la ficha de alumno vinculada por user_id", () => {
    const r = resolveCoachPhone({ whatsapp: null, user_id: "u1", email: "no-match@mail.com" }, alumnos);
    expect(r).toEqual({ phone: "+541171711122", source: "alumno_user_id" });
  });

  it("cae al email exacto normalizado cuando no hay user_id", () => {
    const r = resolveCoachPhone({ whatsapp: "", user_id: null, email: "  ScarlettBonatto@Gmail.com " }, alumnos);
    expect(r).toEqual({ phone: "+541171711122", source: "alumno_email" });
  });

  it("no matchea por nombre ni devuelve teléfonos ajenos", () => {
    const r = resolveCoachPhone({ whatsapp: null, user_id: "uX", email: "scarlett@otra.com" }, alumnos);
    expect(r).toEqual({ phone: "", source: "none" });
  });

  it("ignora fichas sin teléfono", () => {
    const r = resolveCoachPhone(
      { whatsapp: null, user_id: "u3", email: "x@x.com" },
      [{ user_id: "u3", email: "x@x.com", telefono: "  " }],
    );
    expect(r.source).toBe("none");
  });
});

describe("buildGrupoOptions", () => {
  it("incluye Aspirantes y el orden base", () => {
    expect(buildGrupoOptions([])).toEqual([...GRUPOS_BASE]);
  });

  it("excluye Sin grupo y nulos, y dedupe case-insensitive", () => {
    const opts = buildGrupoOptions(["Sin grupo", null, "G1", "g2", "  "]);
    expect(opts).toEqual([...GRUPOS_BASE]);
  });

  it("agrega grupos nuevos alfabéticamente al final", () => {
    const opts = buildGrupoOptions(["Zeta", "Elite", "Aspirantes"]);
    expect(opts).toEqual([...GRUPOS_BASE, "Elite", "Zeta"]);
  });
});
