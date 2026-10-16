import { describe, it, expect } from "vitest";
import { normalizeQuote, buildSharedRoomConsent, isOverdueAssignment, SHARED_ROOM_CONSENT_TEXT } from "./sharedRoomAssignment";

describe("sharedRoomAssignment", () => {
  it("no aplica sin política", () => {
    expect(normalizeQuote(null)).toEqual({ applies: false });
    expect(normalizeQuote({ applies: false })).toEqual({ applies: false });
  });
  it("bloquea si falta importe o es inválido", () => {
    expect(normalizeQuote({ applies: true, blocked: true, reason: "x" })).toMatchObject({ blocked: true });
    expect(normalizeQuote({ applies: true, blocked: false, difference: 0, single_price: 1, currency: "EUR", deadline: "2027-04-22" })).toMatchObject({ blocked: true });
    expect(normalizeQuote({ applies: true, blocked: false, difference: 600, single_price: 4490, deadline: "2027-04-22" })).toMatchObject({ blocked: true });
  });
  it("cotización válida arma consentimiento con texto exacto", () => {
    const q = normalizeQuote({ applies: true, blocked: false, difference: 600, single_price: 4490, double_price: 3890, currency: "EUR", deadline: "2027-04-22", version: "1" });
    expect(q).toMatchObject({ blocked: false, difference: 600 });
    const c = buildSharedRoomConsent(q as any, "alumno");
    expect(c.texto).toBe(SHARED_ROOM_CONSENT_TEXT);
    expect(c).toMatchObject({ acepta: true, difference: 600, currency: "EUR", version: "1" });
  });
  it("vencimiento solo para pendientes", () => {
    const d = new Date(2027, 3, 22);
    expect(isOverdueAssignment("pendiente_asignacion", "2027-04-22", d)).toBe(true);
    expect(isOverdueAssignment("acompanante_propuesto", "2027-04-22", new Date(2027, 3, 21))).toBe(false);
    expect(isOverdueAssignment("completa", "2027-04-22", d)).toBe(false);
  });
});
