import { describe, it, expect } from "vitest";
import {
  clasificarGrupoOperativo,
  distribucionGrupoOperativo,
  tieneEvaluatoriaActiva,
  tienePersonalizadoActivo,
  tieneProgramaFormacionActivo,
  grupoOperativoFilterKey,
  GRUPO_OP,
  type AlumnoClasificable,
} from "./grupoOperativo";

const HOY = "2026-09-03";

const base = (over: Partial<AlumnoClasificable> = {}): AlumnoClasificable => ({
  id: "x",
  grupo: null,
  subsActivas: [],
  reservas: [],
  ...over,
});

describe("grupoOperativo", () => {
  it("programa de formación activo => Aspirantes", () => {
    const a = base({ grupo: "G2", subsActivas: [{ categoria: "formacion" }] });
    expect(tieneProgramaFormacionActivo(a)).toBe(true);
    expect(clasificarGrupoOperativo(a, HOY)).toBe(GRUPO_OP.ASPIRANTES);
  });

  it("programa cancelado (no está en subsActivas) no clasifica como Aspirantes", () => {
    const a = base({ grupo: "Aspirantes", subsActivas: [] });
    expect(tieneProgramaFormacionActivo(a)).toBe(false);
    expect(clasificarGrupoOperativo(a, HOY)).toBe(GRUPO_OP.SIN_GRUPO);
  });

  it("grupo manual Personalizado sin relación real => Sin grupo", () => {
    expect(clasificarGrupoOperativo(base({ grupo: "Personalizado" }), HOY)).toBe(GRUPO_OP.SIN_GRUPO);
  });

  it("plan de asesoría activo => Personalizado", () => {
    const a = base({ subsActivas: [{ categoria: "asesoria" }] });
    expect(tienePersonalizadoActivo(a, HOY)).toBe(true);
    expect(clasificarGrupoOperativo(a, HOY)).toBe(GRUPO_OP.PERSONALIZADO);
  });

  it("reserva personalizada vigente => Personalizado; cancelada o antigua no", () => {
    expect(
      clasificarGrupoOperativo(
        base({ reservas: [{ slug: "personalizada-90", estado: "reservada", fecha: "2026-09-09" }] }),
        HOY,
      ),
    ).toBe(GRUPO_OP.PERSONALIZADO);
    expect(
      tienePersonalizadoActivo(
        base({ reservas: [{ slug: "personalizada", estado: "cancelada_por_admin", fecha: "2026-09-09" }] }),
        HOY,
      ),
    ).toBe(false);
    expect(
      tienePersonalizadoActivo(
        base({ reservas: [{ slug: "personalizada", estado: "realizada", fecha: "2026-05-01" }] }),
        HOY,
      ),
    ).toBe(false);
  });

  it("evaluatoria vigente y no cancelada => Evaluatorias sólo si no está en pelotón", () => {
    const ev = { slug: "clase-evaluatoria", estado: "reservada", fecha: "2026-08-29" };
    expect(tieneEvaluatoriaActiva(base({ reservas: [ev] }), HOY)).toBe(true);
    expect(clasificarGrupoOperativo(base({ reservas: [ev] }), HOY)).toBe(GRUPO_OP.EVALUATORIAS);
    // ya integrado a pelotón: manda el pelotón
    expect(clasificarGrupoOperativo(base({ grupo: "G3", reservas: [ev] }), HOY)).toBe(GRUPO_OP.G3);
    // cancelada no cuenta
    expect(
      tieneEvaluatoriaActiva(
        base({ reservas: [{ ...ev, estado: "cancelada_por_alumno" }] }),
        HOY,
      ),
    ).toBe(false);
  });

  it("no mezcla evaluatoria dentro de Personalizado", () => {
    const a = base({ reservas: [{ slug: "clase-evaluatoria", estado: "reservada", fecha: "2026-09-05" }] });
    expect(tienePersonalizadoActivo(a, HOY)).toBe(false);
  });

  it("G1-G4 se conservan; Principiante pasa a Sin grupo", () => {
    for (const g of ["G1", "G2", "G3", "G4"]) {
      expect(clasificarGrupoOperativo(base({ grupo: g }), HOY)).toBe(g);
    }
    expect(clasificarGrupoOperativo(base({ grupo: "Principiante" }), HOY)).toBe(GRUPO_OP.SIN_GRUPO);
  });

  it("precedencia formación > personalizado > pelotón", () => {
    const a = base({
      grupo: "G1",
      subsActivas: [{ categoria: "formacion" }, { categoria: "asesoria" }],
    });
    expect(clasificarGrupoOperativo(a, HOY)).toBe(GRUPO_OP.ASPIRANTES);
    const b = base({ grupo: "G1", subsActivas: [{ categoria: "asesoria" }] });
    expect(clasificarGrupoOperativo(b, HOY)).toBe(GRUPO_OP.PERSONALIZADO);
  });

  it("la suma de buckets es exactamente el total y el filtro coincide con el count", () => {
    const alumnos = [
      base({ id: "1", grupo: "G2" }),
      base({ id: "2", grupo: "G2" }),
      base({ id: "3", grupo: "Principiante" }),
      base({ id: "4", subsActivas: [{ categoria: "formacion" }] }),
      base({ id: "5", subsActivas: [{ categoria: "asesoria" }] }),
      base({ id: "6", reservas: [{ slug: "clase-evaluatoria", estado: "reservada", fecha: "2026-09-05" }] }),
    ];
    const buckets = distribucionGrupoOperativo(alumnos, HOY);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(alumnos.length);
    for (const b of buckets) {
      const filtrados = alumnos.filter((a) => clasificarGrupoOperativo(a, HOY) === b.grupo);
      expect(filtrados.length).toBe(b.count);
    }
    expect(grupoOperativoFilterKey(GRUPO_OP.SIN_GRUPO)).toBe("grupo_op_Sin grupo");
  });
});
