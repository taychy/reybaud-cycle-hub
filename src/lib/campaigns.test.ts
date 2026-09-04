import { describe, it, expect } from "vitest";
import {
  applyCampaignItem,
  buildVariantKey,
  campaignStatus,
  resolveEffectivePrice,
  urgencyText,
  promoMap,
  normalizeMediosPago,
  mediosPagoLabel,
  aplicaATodosLosMedios,
  promoPaymentNote,
  type StoreCampaign,
  type StoreCampaignItem,
} from "./campaigns";

const NOW = new Date("2026-09-02T12:00:00Z");

const camp = (over: Partial<StoreCampaign> = {}): StoreCampaign => ({
  id: "11111111-1111-1111-1111-111111111111",
  nombre: "Fin de Invierno",
  slug: "fin-de-invierno",
  descripcion: null,
  fecha_inicio: "2026-09-01T00:00:00Z",
  fecha_fin: "2026-09-30T23:59:59Z",
  activa: true,
  badge_texto: "FIN DE INVIERNO",
  mostrar_urgencia: true,
  ...over,
});

const item = (over: Partial<StoreCampaignItem> = {}): StoreCampaignItem => ({
  product_id: "p1",
  variant_keys: null,
  tipo: "porcentaje",
  valor: 20,
  activo: true,
  ...over,
});

describe("campaignStatus", () => {
  it("marca pausada cuando activa=false", () => {
    expect(campaignStatus(camp({ activa: false }), NOW)).toBe("pausada");
  });
  it("marca programada / activa / finalizada según fechas", () => {
    expect(campaignStatus(camp({ fecha_inicio: "2026-10-01T00:00:00Z", fecha_fin: "2026-10-30T00:00:00Z" }), NOW)).toBe("programada");
    expect(campaignStatus(camp(), NOW)).toBe("activa");
    expect(campaignStatus(camp({ fecha_inicio: "2026-07-01T00:00:00Z", fecha_fin: "2026-08-01T00:00:00Z" }), NOW)).toBe("finalizada");
  });
});

describe("resolveEffectivePrice", () => {
  it("a) campaña fuera de fecha => precio normal", () => {
    const r = resolveEffectivePrice(10000, null, [{ ...item(), campaign: camp({ fecha_inicio: "2026-10-01T00:00:00Z", fecha_fin: "2026-10-30T00:00:00Z" }) }], NOW);
    expect(r.precio_efectivo).toBe(10000);
    expect(r.campaign_id).toBeNull();
  });

  it("b) campaña pausada => precio normal", () => {
    const r = resolveEffectivePrice(10000, null, [{ ...item(), campaign: camp({ activa: false }) }], NOW);
    expect(r.precio_efectivo).toBe(10000);
    expect(r.descuento_pct).toBe(0);
  });

  it("b2) item desactivado => precio normal", () => {
    const r = resolveEffectivePrice(10000, null, [{ ...item({ activo: false }), campaign: camp() }], NOW);
    expect(r.precio_efectivo).toBe(10000);
  });

  it("c) porcentaje calcula correcto", () => {
    const r = resolveEffectivePrice(10000, null, [{ ...item({ tipo: "porcentaje", valor: 25 }), campaign: camp() }], NOW);
    expect(r.precio_efectivo).toBe(7500);
    expect(r.descuento_pct).toBe(25);
    expect(r.badge_texto).toBe("FIN DE INVIERNO");
  });

  it("d) precio fijo correcto y nunca superior al de lista", () => {
    expect(applyCampaignItem(10000, { tipo: "precio_fijo", valor: 6990 })).toBe(6990);
    expect(applyCampaignItem(10000, { tipo: "precio_fijo", valor: 15000 })).toBe(10000);
    const r = resolveEffectivePrice(10000, null, [{ ...item({ tipo: "precio_fijo", valor: 6990 }), campaign: camp() }], NOW);
    expect(r.precio_efectivo).toBe(6990);
    expect(r.descuento_pct).toBe(30);
  });

  it("e) variante incluida vs no incluida", () => {
    const it = { ...item({ variant_keys: ["Talle:M"] }), campaign: camp() };
    expect(resolveEffectivePrice(10000, "Talle:M", [it], NOW).precio_efectivo).toBe(8000);
    expect(resolveEffectivePrice(10000, "Talle:L", [it], NOW).precio_efectivo).toBe(10000);
    expect(resolveEffectivePrice(10000, null, [it], NOW).precio_efectivo).toBe(10000);
    expect(resolveEffectivePrice(10000, "Talle:M", [it], NOW).solo_variantes).toBe(true);
  });

  it("no apila descuentos: gana un solo item, el de menor precio resultante", () => {
    const a = { ...item({ tipo: "porcentaje", valor: 20 }), campaign: camp({ id: "aaaa", slug: "a" }) };
    const b = { ...item({ tipo: "precio_fijo", valor: 6000 }), campaign: camp({ id: "bbbb", slug: "b" }) };
    const r = resolveEffectivePrice(10000, null, [a, b], NOW);
    expect(r.precio_efectivo).toBe(6000);
    expect(r.campaign_id).toBe("bbbb");
  });

  it("desempata por fecha_inicio más reciente y luego por id", () => {
    const a = { ...item(), campaign: camp({ id: "bbbb", fecha_inicio: "2026-09-01T00:00:00Z" }) };
    const b = { ...item(), campaign: camp({ id: "aaaa", fecha_inicio: "2026-09-02T00:00:00Z" }) };
    expect(resolveEffectivePrice(10000, null, [a, b], NOW).campaign_id).toBe("aaaa");
  });

  it("f) combo fixed: sólo cuenta la campaña asignada al combo, no la de sus componentes", () => {
    // El combo es product_id 'combo'; el componente 'p1' tiene su propia campaña.
    const items = [
      { ...item({ product_id: "p1", tipo: "porcentaje", valor: 50 }), campaign: camp({ id: "cccc" }) },
    ];
    const delCombo = items.filter((i) => i.product_id === "combo");
    const r = resolveEffectivePrice(20000, null, delCombo, NOW);
    expect(r.precio_efectivo).toBe(20000);
    expect(r.campaign_id).toBeNull();
  });
});

describe("buildVariantKey", () => {
  it("respeta el orden de variants del producto", () => {
    expect(buildVariantKey([{ name: "Talle" }, { name: "Color" }], { Color: "Negro", Talle: "M" })).toBe("Talle:M|Color:Negro");
  });
  it("ordena alfabéticamente si el producto no define variants", () => {
    expect(buildVariantKey([], { Talle: "M", Color: "Negro" })).toBe("Color:Negro|Talle:M");
  });
  it("devuelve null sin selección", () => {
    expect(buildVariantKey([{ name: "Talle" }], {})).toBeNull();
  });
});

describe("urgencyText", () => {
  it("usa días restantes o fecha límite, nunca segundos", () => {
    expect(urgencyText("2026-09-02T20:00:00Z", NOW)).toBe("Termina hoy");
    expect(urgencyText("2026-09-05T12:00:00Z", NOW)).toBe("Termina en 3 días");
    expect(urgencyText("2026-09-30T12:00:00Z", NOW)).toMatch(/^Hasta 30\/09$/);
    expect(urgencyText(null, NOW)).toBeNull();
  });
});

describe("promoMap", () => {
  it("indexa por producto", () => {
    const rows: any[] = [{ product_id: "p1", precio_efectivo: 100 }];
    expect(promoMap(rows).p1.precio_efectivo).toBe(100);
    expect(promoMap(null)).toEqual({});
  });
});

describe("medios de pago", () => {
  const campPago = (medios: string[] | null | undefined, over: Partial<StoreCampaign> = {}) =>
    camp({ ...over, medios_pago: medios } as Partial<StoreCampaign>);

  it("campaña sin campo (histórica) aplica a ambos medios", () => {
    const it = { ...item(), campaign: camp() };
    expect(resolveEffectivePrice(10000, null, [it], NOW, "mp").precio_efectivo).toBe(8000);
    expect(resolveEffectivePrice(10000, null, [it], NOW, "efectivo").precio_efectivo).toBe(8000);
    expect(normalizeMediosPago(undefined)).toEqual(["mp", "efectivo"]);
    expect(normalizeMediosPago([])).toEqual(["mp", "efectivo"]);
  });

  it("campaña con ambos medios aplica siempre", () => {
    const it = { ...item(), campaign: campPago(["mp", "efectivo"]) };
    expect(resolveEffectivePrice(10000, null, [it], NOW, "mp").precio_efectivo).toBe(8000);
    expect(resolveEffectivePrice(10000, null, [it], NOW, "efectivo").precio_efectivo).toBe(8000);
  });

  it("campaña sólo efectivo consultada con MP => precio de lista", () => {
    const it = { ...item(), campaign: campPago(["efectivo"]) };
    expect(resolveEffectivePrice(10000, null, [it], NOW, "mp").precio_efectivo).toBe(10000);
    expect(resolveEffectivePrice(10000, null, [it], NOW, "mp").campaign_id).toBeNull();
    expect(resolveEffectivePrice(10000, null, [it], NOW, "efectivo").precio_efectivo).toBe(8000);
  });

  it("campaña sólo MP consultada con efectivo => precio de lista", () => {
    const it = { ...item(), campaign: campPago(["mp"]) };
    expect(resolveEffectivePrice(10000, null, [it], NOW, "efectivo").precio_efectivo).toBe(10000);
    expect(resolveEffectivePrice(10000, null, [it], NOW, "mp").precio_efectivo).toBe(8000);
  });

  it("sin método (vitrina) no filtra e informa los medios de la ganadora", () => {
    const it = { ...item(), campaign: campPago(["efectivo"]) };
    const r = resolveEffectivePrice(10000, null, [it], NOW);
    expect(r.precio_efectivo).toBe(8000);
    expect(r.medios_pago).toEqual(["efectivo"]);
  });

  it("respeta variantes junto con el medio de pago", () => {
    const it = { ...item({ variant_keys: ["Talle:M"] }), campaign: campPago(["efectivo"]) };
    expect(resolveEffectivePrice(10000, "Talle:M", [it], NOW, "efectivo").precio_efectivo).toBe(8000);
    expect(resolveEffectivePrice(10000, "Talle:M", [it], NOW, "mp").precio_efectivo).toBe(10000);
    expect(resolveEffectivePrice(10000, "Talle:L", [it], NOW, "efectivo").precio_efectivo).toBe(10000);
  });

  it("no apila: con el medio filtrado gana la más barata de las elegibles", () => {
    const soloMp = { ...item({ tipo: "precio_fijo", valor: 6000 }), campaign: campPago(["mp"], { id: "aaaa", slug: "a" }) };
    const ambas = { ...item({ tipo: "porcentaje", valor: 20 }), campaign: campPago(["mp", "efectivo"], { id: "bbbb", slug: "b" }) };
    const mp = resolveEffectivePrice(10000, null, [soloMp, ambas], NOW, "mp");
    expect(mp.precio_efectivo).toBe(6000);
    expect(mp.campaign_id).toBe("aaaa");
    const ef = resolveEffectivePrice(10000, null, [soloMp, ambas], NOW, "efectivo");
    expect(ef.precio_efectivo).toBe(8000);
    expect(ef.campaign_id).toBe("bbbb");
  });

  it("etiquetas y nota de vitrina", () => {
    expect(mediosPagoLabel(["efectivo"])).toBe("Efectivo");
    expect(mediosPagoLabel(null)).toBe("Mercado Pago y Efectivo");
    expect(aplicaATodosLosMedios(["mp"])).toBe(false);
    expect(promoPaymentNote({ medios_pago: ["mp"] })).toBe("pagando con Mercado Pago");
    expect(promoPaymentNote({ medios_pago: ["mp", "efectivo"] })).toBeNull();
    expect(promoPaymentNote(null)).toBeNull();
  });
});
