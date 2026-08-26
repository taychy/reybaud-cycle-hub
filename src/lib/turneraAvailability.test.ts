import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  intervalsOverlap,
  isSlotBooked,
  validateFormResponses,
  pickUniqueAlumnoMatch,
  type OccupiedReservation,
} from "./turneraAvailability";

describe("intervalsOverlap", () => {
  it("detecta cruces parciales", () => {
    expect(intervalsOverlap(600, 660, 630, 720)).toBe(true);
  });
  it("no marca contiguos como solapados", () => {
    expect(intervalsOverlap(600, 630, 630, 660)).toBe(false);
  });
  it("detecta contención", () => {
    expect(intervalsOverlap(640, 650, 600, 720)).toBe(true);
  });
});

describe("isSlotBooked", () => {
  const occ: OccupiedReservation[] = [
    { fecha: "2026-08-27", hora_inicio: "10:30:00", hora_fin: "12:00:00", coach_id: "c1" },
  ];

  it("bloquea un slot que se cruza aunque la hora de inicio sea distinta", () => {
    expect(isSlotBooked(occ, "2026-08-27", "c1", "11:00", "12:00")).toBe(true);
    expect(isSlotBooked(occ, "2026-08-27", "c1", "10:00", "11:00")).toBe(true);
  });
  it("no bloquea slots fuera del intervalo", () => {
    expect(isSlotBooked(occ, "2026-08-27", "c1", "12:00", "13:00")).toBe(false);
    expect(isSlotBooked(occ, "2026-08-27", "c1", "09:00", "10:00")).toBe(false);
  });
  it("no bloquea a otro coach ni otra fecha", () => {
    expect(isSlotBooked(occ, "2026-08-27", "c2", "11:00", "12:00")).toBe(false);
    expect(isSlotBooked(occ, "2026-08-28", "c1", "11:00", "12:00")).toBe(false);
  });
  it("asume 60 minutos si falta hora_fin", () => {
    const legacy: OccupiedReservation[] = [{ fecha: "2026-08-27", hora_inicio: "10:00:00", hora_fin: null, coach_id: "c1" }];
    expect(isSlotBooked(legacy, "2026-08-27", "c1", "10:30", "11:30")).toBe(true);
    expect(isSlotBooked(legacy, "2026-08-27", "c1", "11:00", "12:00")).toBe(false);
  });
});

describe("validateFormResponses", () => {
  const fields = [
    { key: "a", label: "Pregunta A", type: "textarea" as const, required: true },
    { key: "b", label: "Pregunta B", type: "text" as const, required: false },
  ];
  it("exige los obligatorios", () => {
    expect(validateFormResponses(fields, {})).toBe("Completá: Pregunta A");
    expect(validateFormResponses(fields, { a: "   " })).toBe("Completá: Pregunta A");
  });
  it("pasa cuando están completos", () => {
    expect(validateFormResponses(fields, { a: "hace 3 años" })).toBeNull();
  });
  it("no falla sin campos configurados", () => {
    expect(validateFormResponses([], {})).toBeNull();
    expect(validateFormResponses(null, null)).toBeNull();
  });
});

describe("pickUniqueAlumnoMatch", () => {
  it("devuelve la ficha cuando hay una sola", () => {
    expect(pickUniqueAlumnoMatch([{ id: "x" }])).toEqual({ id: "x" });
  });
  it("descarta ambigüedad", () => {
    expect(pickUniqueAlumnoMatch([{ id: "x" }, { id: "y" }])).toBeNull();
  });
  it("descarta sin coincidencias", () => {
    expect(pickUniqueAlumnoMatch([])).toBeNull();
    expect(pickUniqueAlumnoMatch(null)).toBeNull();
  });
});

describe("timeToMinutes", () => {
  it("parsea HH:MM y HH:MM:SS", () => {
    expect(timeToMinutes("10:30")).toBe(630);
    expect(timeToMinutes("10:30:00")).toBe(630);
  });
});
