import { describe, it, expect } from "vitest";
import { parseDescriptionBlocks } from "./TrainingDetailView";

describe("parseDescriptionBlocks — duración planificada", () => {
  it("lee la duración total del encabezado ⏱", () => {
    const { totalMinutes } = parseDescriptionBlocks("⏱ 90 min\n▸ RODAJE Zona 2\n• 90' continuos");
    expect(totalMinutes).toBe(90);
  });

  it("no inventa duración cuando no hay encabezado (día de descanso)", () => {
    const { totalMinutes } = parseDescriptionBlocks("▸ DESCANSO\nElongación - FUERZA\nOPCIONAL: Descanso");
    expect(totalMinutes).toBe(0);
  });

  it("no interpreta distancias, zonas, RPM ni cadencia como duración", () => {
    const { totalMinutes, blocks } = parseDescriptionBlocks(
      "▸ SALIDA Ruta [100 RPM]\n• Zona 3 durante 40 km\n• Cadencia: 95 RPM",
    );
    expect(totalMinutes).toBe(0);
    expect(blocks[0].minutes).toBe(0);
  });

  it("ignora números de potencia/velocidad al inferir minutos de bloque", () => {
    const { blocks } = parseDescriptionBlocks("▸ SERIES Umbral\n• 4 x 5' a 250 w");
    expect(blocks[0].minutes).toBe(20);
  });

  it("no suma topes/límites expresados en minutos", () => {
    const { blocks } = parseDescriptionBlocks("▸ CALOR Entrada\n• Calentamiento 30 minutos - No pasar de Z2");
    expect(blocks[0].minutes).toBe(0);
  });

  it("no toma la duración si el texto está vacío", () => {
    expect(parseDescriptionBlocks("").totalMinutes).toBe(0);
  });
});
