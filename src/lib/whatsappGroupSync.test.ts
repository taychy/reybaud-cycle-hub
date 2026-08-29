import { describe, it, expect } from "vitest";
import { reconcileGroupChange, whatsappSyncLabel, isWhatsappSynced } from "./whatsappGroupSync";

describe("reconcileGroupChange", () => {
  it("crea una tarea en el primer cambio", () => {
    expect(
      reconcileGroupChange({ grupoPrevio: "G1", grupoNuevo: "G2", confirmado: null }),
    ).toEqual({ accion: "creada", grupoOrigen: "G1" });
  });

  it("actualiza la misma tarea manteniendo el origen confirmado (G1→G2→G3)", () => {
    expect(
      reconcileGroupChange({
        grupoPrevio: "G2",
        grupoNuevo: "G3",
        confirmado: null,
        origenTareaAbierta: "G1",
      }),
    ).toEqual({ accion: "actualizada", grupoOrigen: "G1" });
  });

  it("cancela la tarea si vuelve al grupo original (G1→G2→G1)", () => {
    expect(
      reconcileGroupChange({
        grupoPrevio: "G2",
        grupoNuevo: "G1",
        confirmado: null,
        origenTareaAbierta: "G1",
      }),
    ).toEqual({ accion: "cancelada", grupoOrigen: "G1" });
  });

  it("usa el grupo confirmado como origen cuando ya hubo sincronización previa", () => {
    expect(
      reconcileGroupChange({ grupoPrevio: "G2", grupoNuevo: "G3", confirmado: "G2" }),
    ).toEqual({ accion: "creada", grupoOrigen: "G2" });
  });

  it("no genera tarea si el nuevo grupo coincide con el confirmado", () => {
    expect(
      reconcileGroupChange({ grupoPrevio: "G2", grupoNuevo: "G2", confirmado: "G2" }),
    ).toEqual({ accion: "sin_cambio", grupoOrigen: "G2" });
  });

  it("soporta sin grupo (null)", () => {
    expect(
      reconcileGroupChange({ grupoPrevio: null, grupoNuevo: "G1", confirmado: null }),
    ).toEqual({ accion: "creada", grupoOrigen: null });
  });
});

describe("whatsappSyncLabel", () => {
  it("muestra sincronizado si nunca se confirmó", () => {
    expect(whatsappSyncLabel({ confirmado: null, actual: "G1" })).toBe("WhatsApp sincronizado ✓");
    expect(isWhatsappSynced({ confirmado: null, actual: "G1" })).toBe(true);
  });

  it("muestra pendiente con origen y destino", () => {
    expect(whatsappSyncLabel({ confirmado: "G1", actual: "G2" })).toBe("WhatsApp pendiente · G1 → G2");
    expect(isWhatsappSynced({ confirmado: "G1", actual: "G2" })).toBe(false);
  });

  it("muestra sincronizado si coincide", () => {
    expect(whatsappSyncLabel({ confirmado: "G2", actual: "G2" })).toBe("WhatsApp sincronizado ✓");
  });
});
