import { describe, it, expect } from "vitest";
import {
  distributeOrderTotal,
  getPaymentState,
  needsPhysicalReturn,
  operationalLabel,
  operationalOptions,
} from "./storeOrderStatus";

describe("storeOrderStatus", () => {
  it("el pago no se deduce del status", () => {
    expect(getPaymentState({ status: "pagado", pagado_at: null, metodo_pago: "mp" })).toBe("pendiente");
    expect(getPaymentState({ status: "en_camioneta", pagado_at: "2026-09-01", metodo_pago: "mp" })).toBe("pagado");
    expect(getPaymentState({ status: "preparando", pagado_at: null, metodo_pago: "efectivo" })).toBe("efectivo_pendiente");
  });

  it("los status legacy iniciales se muestran como Nuevo", () => {
    ["pendiente", "pendiente_pago", "pendiente_pago_efectivo", "pagado"].forEach((s) => {
      expect(operationalLabel(s)).toBe("Nuevo · por preparar");
    });
    expect(operationalLabel("en_camioneta")).toBe("En camioneta");
  });

  it("el selector conserva el status actual como opción", () => {
    const opts = operationalOptions("pendiente_pago_efectivo");
    expect(opts[0].value).toBe("pendiente_pago_efectivo");
    expect(opts.map((o) => o.value)).toContain("en_camioneta");
    expect(operationalOptions("preparando").map((o) => o.value)).toEqual([
      "preparando", "en_camioneta", "enviado", "entregado",
    ]);
  });

  it("un cancelado sin stock restituido requiere retorno físico", () => {
    expect(needsPhysicalReturn({ status: "cancelado", stock_restored_at: null })).toBe(true);
    expect(needsPhysicalReturn({ status: "cancelado", stock_restored_at: "2026-09-15" })).toBe(false);
    expect(needsPhysicalReturn({ status: "en_camioneta", stock_restored_at: null })).toBe(false);
  });

  it("una sola línea muestra exactamente el total del pedido", () => {
    expect(distributeOrderTotal([{ unit_price: 84, quantity: 1 }], 130200)).toEqual([130200]);
  });

  it("varias líneas reparten el total en proporción y suman exacto", () => {
    const res = distributeOrderTotal(
      [{ unit_price: 84, quantity: 1 }, { unit_price: 42, quantity: 2 }],
      130200,
    );
    expect(res.reduce((a, b) => a + b, 0)).toBeCloseTo(130200, 2);
    expect(res[0]).toBeCloseTo(65100, 2);
  });

  it("sin subtotal crudo reparte en partes iguales", () => {
    const res = distributeOrderTotal([{ unit_price: 0, quantity: 1 }, { unit_price: 0, quantity: 1 }], 1000);
    expect(res).toEqual([500, 500]);
  });
});
