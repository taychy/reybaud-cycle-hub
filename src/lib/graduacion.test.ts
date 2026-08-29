import { describe, it, expect } from "vitest";
import {
  grupoRank, isGraduacion, isReversion, graduacionDedupeKey,
  buildMensajeGraduacion, graduacionTareaTitulo,
} from "./graduacion";

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
