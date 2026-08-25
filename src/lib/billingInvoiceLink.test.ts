import { describe, it, expect } from "vitest";
import {
  resolveExistingFactura,
  isFacturaEmitida,
  describeFacturaProblem,
  FacturaLike,
} from "./billingInvoiceLink";

const rows: FacturaLike[] = [
  { id: "f1", facturacion_cola_id: "c1", referencia_tipo: "evento", referencia_id: "r1", estado: "emitida", cae: "123" },
  { id: "f2", facturacion_cola_id: "c2", referencia_tipo: "evento", referencia_id: "r1", estado: "sin_factura", cae: null },
  { id: "f3", facturacion_cola_id: null, referencia_tipo: "suscripcion", referencia_id: "s1", estado: "error", cae: null },
];

describe("resolveExistingFactura", () => {
  it("resuelve por facturacion_cola_id exacto (idempotencia por pago)", () => {
    expect(resolveExistingFactura(rows, { facturacionColaId: "c2" })?.id).toBe("f2");
  });

  it("no cae al fallback por referencia cuando hay cola id sin match", () => {
    expect(
      resolveExistingFactura(rows, {
        facturacionColaId: "c9",
        referenciaTipo: "evento",
        referenciaId: "r1",
      }),
    ).toBeNull();
  });

  it("usa referencia solo como fallback legacy", () => {
    expect(resolveExistingFactura(rows, { referenciaTipo: "suscripcion", referenciaId: "s1" })?.id).toBe("f3");
  });

  it("devuelve null sin datos suficientes", () => {
    expect(resolveExistingFactura(rows, {})).toBeNull();
  });
});

describe("isFacturaEmitida", () => {
  it("requiere CAE", () => {
    expect(isFacturaEmitida({ estado: "emitida", cae: "1" })).toBe(true);
    expect(isFacturaEmitida({ estado: "emitida", cae: null })).toBe(false);
    expect(isFacturaEmitida(null)).toBe(false);
  });
});

describe("describeFacturaProblem", () => {
  it("traduce estados a lenguaje humano", () => {
    expect(describeFacturaProblem({ estado: "error", cae: null })).toBe("Error al emitir");
    expect(describeFacturaProblem({ estado: "emitida", cae: null })).toBe("Factura manual sin CAE");
    expect(describeFacturaProblem({ estado: "emitida", cae: "9" })).toBeNull();
  });
});
