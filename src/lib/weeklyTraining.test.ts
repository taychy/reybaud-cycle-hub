import { describe, it, expect } from "vitest";
import {
  applyTrainingScope,
  isPersonalScope,
  weekRangeAR,
  nextWeekRangeAR,
  arTodayISO,
  isValidEmail,
  isEligibleForAutoDigest,
  formatWeekLabel,
} from "./weeklyTraining";

function fakeQuery() {
  const calls: Array<[string, string, unknown]> = [];
  const q: any = {
    eq: (c: string, v: unknown) => { calls.push(["eq", c, v]); return q; },
    is: (c: string, v: unknown) => { calls.push(["is", c, v]); return q; },
    calls,
  };
  return q;
}

describe("scope de entrenamientos", () => {
  it("G1 sólo recibe entrenamientos del grupo G1 sin alumno_id", () => {
    const q = fakeQuery();
    applyTrainingScope(q, "G1", "alu-1");
    expect(q.calls).toEqual([["eq", "grupo", "G1"], ["is", "alumno_id", null]]);
  });

  it.each(["G2", "G3", "G4"])("%s queda aislado de otros grupos", (g) => {
    const q = fakeQuery();
    applyTrainingScope(q, g, "alu-1");
    expect(q.calls[0]).toEqual(["eq", "grupo", g]);
  });

  it("Personalizado usa la asignación individual", () => {
    const q = fakeQuery();
    applyTrainingScope(q, "Personalizado", "alu-9");
    expect(q.calls).toEqual([["eq", "alumno_id", "alu-9"]]);
  });

  it("Aspirantes (programa) usa la asignación individual", () => {
    const q = fakeQuery();
    applyTrainingScope(q, "Aspirantes", "alu-7");
    expect(q.calls).toEqual([["eq", "alumno_id", "alu-7"]]);
    expect(isPersonalScope("Aspirantes")).toBe(true);
    expect(isPersonalScope("G2")).toBe(false);
  });
});

describe("semanas lunes-domingo (Argentina)", () => {
  it("calcula la semana actual desde un miércoles", () => {
    const r = weekRangeAR("2026-09-16");
    expect(r.inicio).toBe("2026-09-14");
    expect(r.fin).toBe("2026-09-20");
    expect(r.dates).toHaveLength(7);
  });

  it("un domingo pertenece a la semana que empezó el lunes previo", () => {
    expect(weekRangeAR("2026-09-20").inicio).toBe("2026-09-14");
  });

  it("la próxima semana desde un domingo es lunes siguiente a domingo", () => {
    const r = weekRangeAR("2026-09-20", 1);
    expect(r.inicio).toBe("2026-09-21");
    expect(r.fin).toBe("2026-09-27");
  });

  it("cruza fin de mes correctamente", () => {
    const r = weekRangeAR("2026-09-30", 1);
    expect(r.inicio).toBe("2026-10-05");
    expect(r.fin).toBe("2026-10-11");
  });

  it("usa el día argentino y no el UTC", () => {
    // 2026-09-21T01:00Z => 20/09 22:00 en Argentina
    expect(arTodayISO(new Date("2026-09-21T01:00:00Z"))).toBe("2026-09-20");
    expect(nextWeekRangeAR(new Date("2026-09-20T21:05:00Z")).inicio).toBe("2026-09-21");
  });

  it("arma una etiqueta legible", () => {
    expect(formatWeekLabel(weekRangeAR("2026-09-21"))).toBe("21 al 27 de septiembre");
    expect(formatWeekLabel(weekRangeAR("2026-09-30", 0))).toBe("28 de septiembre al 4 de octubre");
  });
});

describe("elegibilidad del envío automático", () => {
  const base = { estado: "activo", email: "a@b.com", recibe_entrenamientos_email: true };

  it("default OFF no envía", () => {
    expect(isEligibleForAutoDigest({ ...base, recibe_entrenamientos_email: false })).toBe(false);
    expect(isEligibleForAutoDigest({ estado: "activo", email: "a@b.com" })).toBe(false);
  });

  it("ON + activo + email válido es elegible", () => {
    expect(isEligibleForAutoDigest(base)).toBe(true);
  });

  it("alumno inactivo no envía", () => {
    expect(isEligibleForAutoDigest({ ...base, estado: "inactivo" })).toBe(false);
  });

  it("email inválido no envía", () => {
    expect(isEligibleForAutoDigest({ ...base, email: "no-es-mail" })).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("hola@dominio.com")).toBe(true);
  });
});
