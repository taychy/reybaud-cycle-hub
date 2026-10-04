import { describe, it, expect } from "vitest";
import * as c from "./mpConciliacion";
describe("casos", () => {
  it("Nicolás", () => {
    const m = { alumno_id: "x", reservation_payment_id: null, external_reference: "event:bf48", raw: { metadata: { payment_type: "event_ars" } }, rp_existente: { id: "8e51", evento: "Training Camp San Luis Octubre" }, tienda_existente: false };
    expect(c.deriveMpConciliacionEstado(m)).toBe("imputado");
    expect(c.imputadoDestinoLabel(m)).toBe("Imputado a Training Camp San Luis Octubre");
    expect(c.canOfferGenericImputation(m)).toBe(false);
    expect(c.classifyMpUnidad(m)).toBe("viajes");
  });
  it("Teresa", () => {
    const m = { alumno_id: "x", reservation_payment_id: "0b03", external_reference: "store_order:c6a4", raw: { metadata: { payment_type: "store_order" } }, rp_existente: { id: "0b03", evento: "TC" }, tienda_existente: true };
    expect(c.classifyMpUnidad(m)).toBe("tienda");
    expect(c.imputadoDestinoLabel(m)).toBe("Imputado a Tienda");
    expect(c.canOfferGenericImputation(m)).toBe(false);
  });
  it("genérico", () => {
    const m = { alumno_id: "x", external_reference: null };
    expect(c.canOfferGenericImputation(m)).toBe(true);
    expect(c.classifyMpUnidad(m)).toBe("sin_clasificar");
  });
});
