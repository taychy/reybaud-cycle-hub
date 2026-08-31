import { describe, it, expect } from "vitest";
import { nextOccurrence, toLocalIso, labelFecha, resumenPlan, type AgendaSlotLite } from "./coachAgenda";

const slot = (id: string, dia: number, ini: string, fin: string): AgendaSlotLite => ({
  id, dia_semana: dia, hora_inicio: ini, hora_fin: fin, grupo: "G1",
});

describe("coachAgenda", () => {
  it("toma la clase de hoy si todavía no terminó", () => {
    const now = new Date(2026, 7, 31, 8, 0); // lunes 31/08/2026
    const r = nextOccurrence([slot("a", 1, "09:00:00", "10:30:00")], now);
    expect(r?.fecha).toBe("2026-08-31");
    expect(r?.slot.id).toBe("a");
  });

  it("descarta la clase de hoy si ya terminó y pasa a la siguiente semana", () => {
    const now = new Date(2026, 7, 31, 12, 0);
    const r = nextOccurrence([slot("a", 1, "09:00:00", "10:30:00")], now);
    expect(r?.fecha).toBe("2026-09-07");
  });

  it("elige la más temprana del día", () => {
    const now = new Date(2026, 7, 31, 6, 0);
    const r = nextOccurrence([slot("tarde", 1, "18:00:00", "19:30:00"), slot("temprano", 1, "07:00:00", "08:30:00")], now);
    expect(r?.slot.id).toBe("temprano");
  });

  it("devuelve null sin agenda", () => {
    expect(nextOccurrence([], new Date())).toBeNull();
  });

  it("usa fecha local, no UTC", () => {
    expect(toLocalIso(new Date(2026, 0, 1, 23, 30))).toBe("2026-01-01");
  });

  it("etiqueta Hoy y Mañana", () => {
    const now = new Date(2026, 7, 31, 8, 0);
    expect(labelFecha("2026-08-31", now)).toBe("Hoy");
    expect(labelFecha("2026-09-01", now)).toBe("Mañana");
  });

  it("resume el plan en pocas líneas", () => {
    expect(resumenPlan("a\n\n b \nc\nd", 3)).toEqual(["a", "b", "c"]);
    expect(resumenPlan(null)).toEqual([]);
  });
});
