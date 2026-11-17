import { describe, expect, it } from "vitest";
import {
  FONDAZO_TEST_RECIPIENT,
  buildApprovedCyclistsTestMail,
  buildAutomaticFondazoTestMails,
  type TestRsvp,
} from "./fondazoTestEmails";

const token = "e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39";
const base: TestRsvp = {
  is_test: true,
  name: "Test Reybaud",
  response: "voy",
  participation_mode: "fondo_y_almuerzo",
  cyclist_guests: [],
  lunch: { adults_count: 1, children_4_9_count: 1, under_4_count: 1 },
  prices: {
    adult_price: 40000,
    child_4_9_price: 20000,
    under_4_price: 0,
    prices_confirmed_at: "2026-11-17T00:00:00Z",
  },
};

describe("Fondazo: envío de correos automático para usuario de prueba", () => {
  it("no genera un solo email con registros reales", () => {
    expect(buildAutomaticFondazoTestMails({ ...base, is_test: false }, token)).toEqual([]);
  });

  it("envía confirmación y pago de parrilla cuando no hay ciclistas invitados", () => {
    const mails = buildAutomaticFondazoTestMails(base, token);
    expect(FONDAZO_TEST_RECIPIENT).toBe("scarlettbonatto@gmail.com");
    expect(mails.map(m => m.stage)).toEqual(["confirmacion", "parrilla"]);
    expect(mails[1].content_html).toContain("60.000");
    expect(mails[1].content_html).toContain("Lacarretadelgato");
    expect(mails[1].content_html).toContain("NO REALIZAR TRANSFERENCIAS");
    expect(mails[1].content_html).toContain(token);
  });

  it("NO VOY solo genera confirmación, nunca pago", () => {
    const mails = buildAutomaticFondazoTestMails({
      ...base, response: "no_voy", participation_mode: null,
    }, token);
    expect(mails.map(m => m.stage)).toEqual(["confirmacion"]);
    expect(mails[0].content_html).toContain("No tenés que pagar nada");
  });

  it("solo fondo sin invitados es gratuito, sin email de parrilla", () => {
    const mails = buildAutomaticFondazoTestMails({
      ...base, participation_mode: "solo_fondo",
    }, token);
    expect(mails.map(m => m.stage)).toEqual(["confirmacion"]);
  });

  it("con invitados: espera a Claudio para enviar email de cupo", () => {
    const riders = [{ name: "Invitado Ciclista", lunch: true, whatsapp: "+5491112345678" }];
    const rsvp = { ...base, cyclist_guests: riders };
    const first = buildAutomaticFondazoTestMails(rsvp, token);
    expect(first.map(m => m.stage)).toEqual(["confirmacion", "parrilla"]);
    expect(first[0].content_html).toContain("Claudio debe aprobarlos");
    const approved = buildApprovedCyclistsTestMail(rsvp);
    expect(approved.stage).toBe("ciclista_aprobado");
    expect(approved.content_html).toContain("granfondo.tc");
    expect(approved.content_html).toContain("Scarlett Tayná");
    expect(approved.content_html).toContain("NO REALIZAR TRANSFERENCIAS");
  });

  it("no deja simular aprobación de un ciclista inexistente", () => {
    expect(() => buildApprovedCyclistsTestMail(base)).toThrow();
  });

  it("no comunica importes sin tarifa confirmada", () => {
    expect(() => buildAutomaticFondazoTestMails({
      ...base, prices: { ...base.prices, prices_confirmed_at: null },
    }, token)).toThrow("tarifas");
  });
});
