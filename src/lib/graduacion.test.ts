import { describe, it, expect } from "vitest";
import {
  grupoRank, isGraduacion, isReversion, graduacionDedupeKey,
  buildMensajeGraduacion, graduacionTareaTitulo,
  clasificarCambioGrupo, cambioGrupoDedupeKey, cambioGrupoTareaTitulo,
  cambioGrupoBadge, buildMensajeDescenso, buildMensajeCambioNeutro,
} from "./graduacion";

describe("cambios de grupo", () => {
  it("clasifica graduación, descenso y neutro", () => {
    expect(clasificarCambioGrupo("G4", "G3")).toBe("graduacion");
    expect(clasificarCambioGrupo("G4", "G2")).toBe("graduacion");
    expect(clasificarCambioGrupo("G2", "G3")).toBe("descenso");
    expect(clasificarCambioGrupo("Personalizado", "G3")).toBe("cambio_grupo");
    expect(clasificarCambioGrupo("G2", "G2")).toBe("sin_cambio");
    expect(clasificarCambioGrupo(null, null)).toBe("sin_cambio");
  });

  it("dedupe de comunicación es único por alumno", () => {
    expect(cambioGrupoDedupeKey("abc")).toBe("gcom_abc");
    expect(cambioGrupoDedupeKey("abc")).toBe(cambioGrupoDedupeKey("abc"));
  });

  it("títulos por tipo", () => {
    expect(cambioGrupoTareaTitulo("graduacion", "Ana Perez", "G3", "G2")).toContain("🎓 Felicitar a Ana Perez");
    expect(cambioGrupoTareaTitulo("descenso", "Ana Perez", "G2", "G3")).toBe("💬 Hablar con Ana Perez sobre su cambio a G3");
    expect(cambioGrupoTareaTitulo("cambio_grupo", "Ana Perez", "Personalizado", "G3")).toBe(
      "💬 Avisar a Ana Perez su cambio de grupo: Personalizado → G3"
    );
  });

  it("badges no humillan al alumno", () => {
    expect(cambioGrupoBadge("graduacion")).toBe("🎓 Graduación");
    expect(cambioGrupoBadge("descenso")).toBe("↘ Cambio a menor exigencia");
    expect(cambioGrupoBadge("cambio_grupo")).toBe("↔ Cambio de grupo");
    expect(cambioGrupoBadge("descenso")).not.toMatch(/bajaste|descenso/i);
  });

  it("mensajes de descenso y neutro incluyen nombre y grupo, sin tono punitivo", () => {
    const d = buildMensajeDescenso({ alumnoNombre: "Ana Perez", grupoDestino: "G3", coachNombre: "Claudio" });
    expect(d).toContain("Ana,");
    expect(d).toContain("G3");
    expect(d).not.toMatch(/bajaste|no estás a la altura/i);
    expect(d.endsWith("Claudio")).toBe(true);

    const n = buildMensajeCambioNeutro({ alumnoNombre: "Ana Perez", grupoDestino: "Personalizado" });
    expect(n).toContain("Ana,");
    expect(n).toContain("Personalizado");
  });
});


describe("graduacion", () => {
  it("rankea la progresión", () => {
    expect(grupoRank("Aspirantes")).toBe(1);
    expect(grupoRank("g1")).toBe(6);
    expect(grupoRank("Personalizado")).toBeNull();
    expect(grupoRank(null)).toBeNull();
  });

  it("G4→G3 es graduación", () => expect(isGraduacion("G4", "G3")).toBe(true));
  it("G3→G2 es graduación", () => expect(isGraduacion("G3", "G2")).toBe(true));
  it("salto G4→G2 es una sola graduación", () => expect(isGraduacion("G4", "G2")).toBe(true));
  it("Aspirantes→Principiante es graduación", () => expect(isGraduacion("Aspirantes", "Principiante")).toBe(true));

  it("G2→G3 no es graduación pero sí reversión", () => {
    expect(isGraduacion("G2", "G3")).toBe(false);
    expect(isReversion("G2", "G3")).toBe(true);
  });

  it("cambios laterales/no reconocidos no son graduación ni reversión", () => {
    expect(isGraduacion("Personalizado", "G2")).toBe(false);
    expect(isReversion("G2", "Personalizado")).toBe(false);
    expect(isGraduacion("G2", "G2")).toBe(false);
  });

  it("dedupe key es por alumno + destino", () => {
    expect(graduacionDedupeKey("abc", "G2")).toBe("grad_abc_g2");
    expect(graduacionDedupeKey("abc", "G2")).toBe(graduacionDedupeKey("abc", "g2"));
    expect(graduacionDedupeKey("abc", "G1")).not.toBe(graduacionDedupeKey("abc", "G2"));
  });

  it("construye borrador determinístico con nombre y grupo", () => {
    const m = buildMensajeGraduacion({ alumnoNombre: "Marcelo Varela", grupoDestino: "G2", coachNombre: "Claudio" });
    expect(m).toContain("Marcelo,");
    expect(m).toContain("G2");
    expect(m.endsWith("Claudio")).toBe(true);
    expect(m).toBe(buildMensajeGraduacion({ alumnoNombre: "Marcelo Varela", grupoDestino: "G2", coachNombre: "Claudio" }));
  });

  it("incorpora nota del chequeo si existe", () => {
    const m = buildMensajeGraduacion({ alumnoNombre: "Ana", grupoDestino: "G3", notaChequeo: "Gran progreso en curvas." });
    expect(m).toContain("Gran progreso en curvas.");
  });

  it("titula la tarea de felicitación", () => {
    expect(graduacionTareaTitulo("Ana Perez", "G3")).toBe("🎓 Felicitar a Ana Perez por su graduación a G3");
  });
});
