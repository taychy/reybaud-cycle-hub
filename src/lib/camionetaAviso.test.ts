import { describe, expect, it } from "vitest";
import { buildAvisoCamionetaMessage, buildAvisoPedidoReferencia } from "./camionetaAviso";

describe("avisos de camioneta", () => {
  it("arma una referencia breve con número, producto, variante y cantidad", () => {
    expect(buildAvisoPedidoReferencia(81, [{
      product_name: "Campera Reybaud Santini",
      variant_selection: { Talle: "L" },
      quantity: 1,
    }])).toBe("pedido #81 — Campera Reybaud Santini · L");

    expect(buildAvisoPedidoReferencia(81, [
      { product_name: "Campera Reybaud Santini", variant_selection: { Talle: "L" }, quantity: 2 },
      { product_name: "Gorro" },
      { product_name: "Punteras" },
    ])).toBe("pedido #81 — Campera Reybaud Santini · L ×2 + 2 productos más");
  });

  it("usa descripción sin número y fallbacks seguros", () => {
    expect(buildAvisoPedidoReferencia(null, [{ producto: "Geles TRI-BERRY", variante: "Sabor: Frutilla", cantidad: 4 }]))
      .toBe("pedido — Geles TRI-BERRY · Frutilla ×4");
    expect(buildAvisoPedidoReferencia(81, [])).toBe("pedido #81");
    expect(buildAvisoPedidoReferencia(null, [])).toBe("tu pedido");
  });

  it("incluye la referencia sin cambiar las reglas de pago", () => {
    const referencia = buildAvisoPedidoReferencia(81, [{ product_name: "Campera Reybaud Santini", variant_selection: { Talle: "L" } }]);
    expect(buildAvisoCamionetaMessage("María", { pagado_at: "2026-09-22", total: 100, currency: "ARS" }, 0, referencia))
      .toBe("Hola, María. Tu pedido #81 — Campera Reybaud Santini · L ya está en la camioneta para que puedas retirarlo.");
    const efectivo = buildAvisoCamionetaMessage("María", { pagado_at: null, metodo_pago: "efectivo", total: 100, currency: "ARS" }, 75, referencia);
    expect(efectivo).toContain("Tu pedido #81 — Campera Reybaud Santini · L ya está en la camioneta.");
    expect(efectivo).toContain("Queda pendiente el pago de $ 75");
    expect(efectivo).toContain("sobre identificado");
  });
});