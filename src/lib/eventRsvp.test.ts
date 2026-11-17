import { describe, expect, it } from "vitest";
import {
  LUNCH_POLICY_PENDING,
  LUNCH_POLICY_TEXT,
  LUNCH_POLICY_VERSION,
  RESTAURANT_ALIAS,
  RESTAURANT_WHATSAPP_URL,
  GUEST_CYCLIST_ALIAS,
  GUEST_CYCLIST_ACCOUNT_HOLDER,
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

  it("el segundo correo separa claramente las cuentas del restaurante y los ciclistas aprobados", () => {
    const mail = rsvpLunchEmail();
    expect(mail.content_html).toContain(RESTAURANT_ALIAS);
    expect(mail.content_html).toContain(RESTAURANT_WHATSAPP_URL);
    expect(mail.content_html).toContain(GUEST_CYCLIST_ALIAS);
    expect(mail.content_html).toContain(GUEST_CYCLIST_ACCOUNT_HOLDER);
    expect(mail.content_html).toContain("esperá la aprobación expresa de Claudio antes de transferir");
    expect(mail.content_html).toContain("ENVIAR COMPROBANTE POR WHATSAPP");
    expect(mail.content_html).toContain("{rsvp_adult_price}");
    expect(mail.content_html).toContain("{rsvp_child_price}");
    expect(mail.content_html).toContain("{rsvp_under_4_price}");
    expect(mail.content_html).toContain("$30.000");
  });
});

describe("Fondazo · correo y condiciones", () => {
  it("los botones abren una pantalla y no son endpoints de voto", () => {
    const mail = rsvpInvitationEmail();
    expect(mail.content_html).toContain("{rsvp_voy_url}");
    expect(mail.content_html).toContain("{rsvp_no_voy_url}");
    expect(mail.content_html).toContain("Tocá VOY o NO VOY");
  });

  it("conserva literalmente la política y deja pendiente el intervalo no definido", () => {
    expect(LUNCH_POLICY_TEXT).toContain("hasta el 24/11/2026 inclusive");
    expect(LUNCH_POLICY_TEXT).toContain("perdés el 100%");
    expect(LUNCH_POLICY_PENDING).toContain("25 y el 28/11/2026");
    expect(LUNCH_POLICY_PENDING).toContain("pendientes de definición administrativa");
    expect(LUNCH_POLICY_PENDING).toContain("La Carreta del Gato");
    expect(LUNCH_POLICY_VERSION).toBe("fondazo-almuerzo-v1-2026-11-16");
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
