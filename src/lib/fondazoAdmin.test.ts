import { describe, expect, it } from "vitest";
import { csvCell, expectedLunchAmount, filterLunchRowsBySearch, holderWhatsApp, internalReport, matchesFilters, matchesLunchSearch, normalizeSearch, paymentOf, paymentWhatsApp, pelotonOf, restaurantReport, type AdminRow, type LunchSearchRow } from "./fondazoAdmin";

type LunchFixture = LunchSearchRow & { id: string };
const lunchBase: LunchFixture = {
  id: "l1", recipient_name: "María José Ferrández", recipient_email: "mj.ferrandez@example.com",
  participant_first_name: "María", participant_last_name: "Ferrández",
  lunch_attendees: [{ name: "Ana Beatriz Sosa" }],
  cyclist_guests: [{ name: "Iván Quiroga" }],
  non_cyclist_guests: [{ name: "José Núñez" }],
};
const lunchOther: LunchFixture = {
  id: "l2", recipient_name: "Carlos Gómez", recipient_email: "cg@example.com",
  participant_first_name: "Carlos", participant_last_name: "Gómez",
  lunch_attendees: [], cyclist_guests: [], non_cyclist_guests: [],
};

const prices = { adult_price: 40000, child_4_9_price: 20000, under_4_price: 0, prices_confirmed_at: "2026-11-16T00:00:00Z" };
const base: AdminRow = {
  id: "aaaaaaaa-0000-0000-0000-000000000000", recipient_name: "Ana Test", recipient_email: "ana@example.com", alumno_id: "x",
  participant_whatsapp: "11 5555-1234", alumno_telefono: null, alumno_grupo: "G2", peloton_override: null, response: "voy",
  participation_mode: "fondo_y_almuerzo", lunch_status: "instrucciones_enviadas", receipt_reference: null, lunch_status_changed_at: null,
  cyclist_guests: [], non_cyclist_guests: [{ name: "Hijo", category: "child_4_9" }, { name: "Bebé", category: "under_4" }],
};
const noFilters = { q: "", attendance: [], payment: [], peloton: [], holder: [] };

describe("Fondazo admin", () => {
  it("solo fondo never owes", () => {
    const r = { ...base, participation_mode: "solo_fondo" as const };
    expect(paymentOf(r)).toBe("no_aplica");
    expect(expectedLunchAmount(r, prices)).toBe(0);
    expect(paymentWhatsApp(r, prices).ok).toBe(false);
  });
  it("computes amount from confirmed prices: adult 40k + child 20k + under4 0", () => {
    expect(expectedLunchAmount(base, prices)).toBe(60000);
    expect(expectedLunchAmount({ ...base, cyclist_guests: [{ name: "Iván", lunch: true }] }, prices)).toBe(100000);
  });
  it("unconfirmed prices → sin conciliar", () => {
    expect(expectedLunchAmount(base, { ...prices, prices_confirmed_at: null })).toBeNull();
    expect(paymentWhatsApp(base, { ...prices, prices_confirmed_at: null })).toMatchObject({ ok: false });
  });
  it("comprobante informado is not paid; verified needs reference", () => {
    expect(paymentOf({ ...base, lunch_status: "comprobante_informado" })).toBe("comprobante_informado");
    expect(paymentOf({ ...base, lunch_status: "pago_verificado", receipt_reference: null })).toBe("pendiente");
    expect(paymentOf({ ...base, lunch_status: "pago_verificado", receipt_reference: "op 1" })).toBe("pago_verificado");
  });
  it("WhatsApp only for pending with valid holder phone, encoded", () => {
    const w = paymentWhatsApp(base, prices);
    expect(w.ok && w.url.startsWith("https://wa.me/5491155551234?text=")).toBe(true);
    expect(w.ok && decodeURIComponent(w.url).includes("Lacarretadelgato")).toBe(true);
    expect(paymentWhatsApp({ ...base, participant_whatsapp: "123" }, prices)).toMatchObject({ ok: false });
    expect(holderWhatsApp({ participant_whatsapp: "+598 99 123 456", alumno_telefono: null })).toBe("59899123456");
  });
  it("peloton: override wins, Principiante → iniciación, externos sin asignar", () => {
    expect(pelotonOf(base)).toBe("G2");
    expect(pelotonOf({ ...base, alumno_grupo: "Principiante" })).toBe("iniciacion");
    expect(pelotonOf({ ...base, alumno_grupo: "Aspirantes" })).toBe("sin_asignar");
    expect(pelotonOf({ ...base, alumno_id: null })).toBe("sin_asignar");
    expect(pelotonOf({ ...base, peloton_override: "G4" })).toBe("G4");
  });
  it("combined filters", () => {
    expect(matchesFilters(base, { ...noFilters, attendance: ["fondo_y_almuerzo"], payment: ["pendiente"], peloton: ["G2"], holder: ["alumno"] })).toBe(true);
    expect(matchesFilters(base, { ...noFilters, attendance: ["fondo_y_almuerzo"], payment: ["pago_verificado"] })).toBe(false);
    expect(matchesFilters(base, { ...noFilters, q: "5555" })).toBe(true);
  });
  it("CSV: BOM, escaped quotes, neutralized formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    const csv = internalReport([{ ...base, recipient_name: "-2+3" }], prices);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'-2+3"`);
  });
  it("restaurant report: no emails/phones, verified separate from expected, no duplicates", () => {
    const rows = [base, { ...base, id: "bbbbbbbb-1", lunch_status: "pago_verificado" as const, receipt_reference: "op9" }, { ...base, id: "c", participation_mode: "solo_fondo" as const }];
    const csv = restaurantReport(rows, prices);
    expect(csv).not.toContain("@example.com");
    expect(csv).not.toContain("5555");
    expect(csv.split("Ana Test").length - 1).toBe(4); // columnas Titular y Comensales
    expect(csv).toContain(`"120000";"";"";"";"Pago verificado ARS 60000"`);
  });
});

describe("Búsqueda de la pestaña Almuerzo", () => {
  it("normaliza mayúsculas, acentos y espacios", () => {
    expect(normalizeSearch("  MARÍA   JOSÉ  ")).toBe("mariajose");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch(undefined)).toBe("");
  });
  it("encuentra por nombre o apellido del titular", () => {
    expect(matchesLunchSearch(lunchBase, "ferrandez")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "FERRÁNDEZ")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "maria jose")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "mariajose")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "   Ferra   ndez   ")).toBe(true);
  });
  it("encuentra por titular cuando no hay nombre de destinatario", () => {
    const sinNombre = { ...lunchBase, recipient_name: null, lunch_attendees: [], cyclist_guests: [], non_cyclist_guests: [] };
    expect(matchesLunchSearch(sinNombre, "ferrandez")).toBe(true);
    expect(matchesLunchSearch(sinNombre, "maria")).toBe(true);
    expect(matchesLunchSearch(sinNombre, "ivan")).toBe(false);
  });
  it("encuentra por acompañante de encuesta, no ciclista y amigo ciclista", () => {
    expect(matchesLunchSearch(lunchBase, "ana beatriz")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "nunez")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "NUÑEZ")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "ivan quiroga")).toBe(true);
  });
  it("encuentra por correo, descarta ajenos y la consulta vacía no filtra", () => {
    expect(matchesLunchSearch(lunchBase, "mj.ferrandez@example.com")).toBe(true);
    expect(matchesLunchSearch(lunchBase, "pedro")).toBe(false);
    expect(matchesLunchSearch(lunchBase, "   ")).toBe(true);
    expect(matchesLunchSearch(lunchOther, "ferrandez")).toBe(false);
  });
  it("filtra solo las filas coincidentes sin mutar el arreglo original", () => {
    const rows = [lunchBase, lunchOther];
    expect(filterLunchRowsBySearch(rows, "gomez").map((r) => r.id)).toEqual(["l2"]);
    expect(filterLunchRowsBySearch(rows, "").map((r) => r.id)).toEqual(["l1", "l2"]);
    expect(rows.map((r) => r.id)).toEqual(["l1", "l2"]);
  });
});
