import { describe, it, expect } from "vitest";
import { normalizePaymentMethod, getPaymentMethodLabel, resolvePaymentDisplay } from "./paymentMethods";

describe("normalizePaymentMethod", () => {
  it("nunca convierte valores desconocidos o internos en efectivo", () => {
    for (const raw of [null, undefined, "", "pendiente", "manual", "conciliado", "approved", "vaya-a-saber"]) {
      expect(normalizePaymentMethod(raw as any)).toBeNull();
    }
  });

  it("sólo devuelve efectivo con evidencia explícita", () => {
    expect(normalizePaymentMethod("efectivo")).toBe("efectivo");
    expect(normalizePaymentMethod("cash")).toBe("efectivo");
  });

  it("mapea el resto de medios reales", () => {
    expect(normalizePaymentMethod("transferencia")).toBe("transferencia");
    expect(normalizePaymentMethod("mercadopago")).toBe("mercadopago");
    expect(normalizePaymentMethod("card")).toBe("tarjeta");
  });
});

describe("getPaymentMethodLabel", () => {
  it("'pendiente' no se renderiza como Efectivo", () => {
    expect(getPaymentMethodLabel("pendiente")).toBe("Pendiente de conciliación");
    expect(getPaymentMethodLabel("pendiente")).not.toMatch(/Efectivo/i);
  });

  it("null/desconocido → Sin definir", () => {
    expect(getPaymentMethodLabel(null)).toBe("Sin definir");
    expect(getPaymentMethodLabel("xyz")).toBe("Sin definir");
  });

  it("efectivo explícito sí muestra Efectivo", () => {
    expect(getPaymentMethodLabel("efectivo")).toBe("Efectivo");
  });
});

describe("resolvePaymentDisplay", () => {
  it("'manual' no se muestra como Efectivo", () => {
    expect(resolvePaymentDisplay({ mp_status: "manual" }).method).toBe("Sin definir");
  });
  it("con mp_payment_id muestra Mercado Pago", () => {
    expect(resolvePaymentDisplay({ mp_payment_id: "123" }).method).toBe("Mercado Pago");
  });
});
