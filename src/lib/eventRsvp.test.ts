import { describe, expect, it } from "vitest";
import {
  LUNCH_POLICY_PENDING,
  LUNCH_POLICY_TEXT,
  LUNCH_POLICY_VERSION,
  RESTAURANT_ALIAS,
  RESTAURANT_WHATSAPP_URL,
  guestCyclistPaymentEmail,
  hasLunchInterest,
  lunchAmount,
  lunchDinerTotal,
  rsvpInvitationEmail,
  rsvpLunchEmail,
  validateLunchCounts,
} from "./eventRsvp";

const counts = { adults_count: 2, children_4_9_count: 1, under_4_count: 1 };
const prices = { adult_price: 45000, child_4_9_price: 25000, under_4_price: 0, prices_confirmed_at: "2026-11-16T00:00:00Z" };

describe("Fondazo · interés y comensales", () => {
  it("sólo VOY con modalidad que incluye almuerzo expresa interés", () => {
    expect(hasLunchInterest("voy", "fondo_y_almuerzo")).toBe(true);
    expect(hasLunchInterest("voy", "solo_almuerzo")).toBe(true);
    expect(hasLunchInterest("voy", "solo_fondo")).toBe(false);
    expect(hasLunchInterest("no_voy", "fondo_y_almuerzo")).toBe(false);
  });

  it("cuenta también a los menores de cuatro años como comensales", () => {
    expect(lunchDinerTotal(counts)).toBe(4);
  });

  it("exige que las edades sumen la persona invitada más sus acompañantes", () => {
    expect(validateLunchCounts(counts, 3)).toBeNull();
    expect(validateLunchCounts(counts, 2)).toContain("tiene que ser 3");
    expect(validateLunchCounts({ ...counts, adults_count: 0 }, 3)).toContain("al menos un adulto");
  });
});

describe("Fondazo · precios verificados", () => {
  it("calcula el total del restaurante, no una seña porcentual", () => {
    expect(lunchAmount(counts, prices)).toBe(115000);
  });

  it("no calcula ni muestra importes hasta confirmar todas las tarifas", () => {
    expect(lunchAmount(counts, { ...prices, prices_confirmed_at: null })).toBeNull();
    expect(lunchAmount(counts, { ...prices, child_4_9_price: null })).toBeNull();
  });

  it("el segundo correo usa tarifas confirmadas y nunca los valores viejos del folleto", () => {
    const mail = rsvpLunchEmail();
    expect(mail.content_html).toContain(RESTAURANT_ALIAS);
    expect(mail.content_html).toContain(RESTAURANT_WHATSAPP_URL);
    expect(mail.content_html).toContain("WhatsApp a Scarlett");
    expect(mail.content_html).toContain("verificar tu reserva con el restaurante");
    expect(mail.content_html).not.toContain("Comprobantes del restaurante");
    expect(mail.content_html).toContain("{rsvp_adult_price}");
    expect(mail.content_html).toContain("{rsvp_child_price}");
    expect(mail.content_html).not.toContain("40.000");
    expect(mail.content_html).not.toContain("20.000");
    expect(mail.content_html).not.toContain("No pagues en la aplicación");
    expect(mail.content_html).toContain("ENVIAR COMPROBANTE POR WHATSAPP");
  });
});

describe("Fondazo · correo y condiciones", () => {
  it("los botones abren una pantalla y no son endpoints de voto", () => {
    const mail = rsvpInvitationEmail();
    expect(mail.content_html).toContain("{rsvp_voy_url}");
    expect(mail.content_html).toContain("{rsvp_no_voy_url}");
    expect(mail.content_html).toContain("confirmar tu participación");
  });

  it("incluye el crédito hasta el 27/11 y no lo promete después", () => {
    expect(LUNCH_POLICY_TEXT).toContain("viernes 27/11/2026 inclusive");
    expect(LUNCH_POLICY_TEXT).toContain("sábado 28/11/2026");
    expect(LUNCH_POLICY_TEXT).toContain("no hay devolución ni crédito");
    expect(LUNCH_POLICY_PENDING).toContain("los administra La Carreta del Gato");
    expect(LUNCH_POLICY_VERSION).toBe("fondazo-almuerzo-v2-2026-11-17");
    expect(rsvpLunchEmail().content_html).toContain(LUNCH_POLICY_TEXT);
    expect(rsvpLunchEmail().content_html).not.toContain("24/11");
  });
});

import { validateLunchCounts as vlc, GUEST_CYCLIST_MAX, GUEST_CYCLIST_FEE, ADULT_LUNCH_PRICE_ANNOUNCED } from "./eventRsvp";
describe("Fondazo reglas nuevas", () => {
  it("acepta más de 30 acompañantes no ciclistas", () => {
    expect(vlc({ adults_count: 41, children_4_9_count: 0, under_4_count: 0 }, 40)).toBeNull();
  });
  it("cupo y precios anunciados", () => {
    expect(GUEST_CYCLIST_MAX).toBe(10);
    expect(GUEST_CYCLIST_FEE + ADULT_LUNCH_PRICE_ANNOUNCED).toBe(70000);
  });
});

describe("Fondazo · correo separado para cupo ciclista aprobado", () => {
  it("incluye alias granfondo.tc y titular Scarlett Tayná por $30.000 cada uno", () => {
    const mail = guestCyclistPaymentEmail(["Amigo A", "Amigo B"]);
    expect(mail.body).toContain("Amigo A, Amigo B");
    expect(mail.body).toContain("60.000");
    expect(mail.body).toContain("granfondo.tc");
    expect(mail.body).toContain("Scarlett Tayná");
    expect(mail.body).toContain("https://wa.me/5491171711122");
    expect(mail.body).not.toContain("Lacarretadelgato");
  });

  it("no permite preparar mensajes de pago para invitados no aprobados", () => {
    expect(() => guestCyclistPaymentEmail([])).toThrow(/No hay ciclistas aprobados/);
  });
});
