import { describe, it, expect } from "vitest";
import { resolveCommercialPhase, sedePhase, inscriptionReadiness, fmtSedeHorario } from "./programCommercialPhase";

const dates = {
  fecha_inicio_preinscripcion: "2026-09-01",
  fecha_fin_preinscripcion: "2026-09-30",
  fecha_inicio_inscripcion: "2026-10-05",
  fecha_fin_inscripcion: "2026-10-20",
};

describe("resolveCommercialPhase", () => {
  it("recorre las fases por fecha", () => {
    expect(resolveCommercialPhase(dates, "2026-09-15")).toBe("preinscripcion");
    expect(resolveCommercialPhase(dates, "2026-10-02")).toBe("espera_apertura");
    expect(resolveCommercialPhase(dates, "2026-10-05")).toBe("inscripcion");
    expect(resolveCommercialPhase(dates, "2026-10-20")).toBe("inscripcion");
    expect(resolveCommercialPhase(dates, "2026-10-21")).toBe("lista_espera");
  });
  it("fallback legacy a fecha_cierre_inscripcion", () => {
    expect(resolveCommercialPhase({ fecha_cierre_inscripcion: "2026-10-16" }, "2026-10-10")).toBe("inscripcion");
    expect(resolveCommercialPhase({ fecha_cierre_inscripcion: "2026-10-16" }, "2026-10-17")).toBe("lista_espera");
  });
});

describe("sedes", () => {
  it("sede llena pasa a lista de espera sin afectar otras", () => {
    expect(sedePhase("inscripcion", { sede_id: "a", cupo_maximo: 10, inscriptos: 10 })).toBe("lista_espera");
    expect(sedePhase("inscripcion", { sede_id: "b", cupo_maximo: 10, inscriptos: 3 })).toBe("inscripcion");
  });
  it("formatea horario", () => {
    expect(fmtSedeHorario({ sede_id: "a", dia_semana: 6, hora_inicio: "08:00:00", hora_fin: "10:00:00" })).toBe("Sábado · 08:00 a 10:00 h");
  });
});

describe("inscriptionReadiness", () => {
  it("valida apertura completa", () => {
    const checks = inscriptionReadiness({
      program: { ...dates, activo: true, landing_public: true, cohort_slug: "x" },
      sedes: [{ sede_id: "a", nombre: "A", activa: true, dia_semana: 6, hora_inicio: "08:00", cupo_maximo: 12 }],
      stages: [{ precio: 1, fecha_desde: "2026-10-01", fecha_hasta: "2026-10-31" }],
    });
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  it("detecta sede sin cupo y sin precio", () => {
    const checks = inscriptionReadiness({
      program: { ...dates, activo: true, landing_public: true, cohort_slug: "x" },
      sedes: [{ sede_id: "a", nombre: "A", activa: true, dia_semana: 6, hora_inicio: "08:00", cupo_maximo: 0 }],
      stages: [],
    });
    expect(checks.find((c) => c.key === "sedes_completas")!.ok).toBe(false);
    expect(checks.find((c) => c.key === "precio")!.ok).toBe(false);
  });
});
