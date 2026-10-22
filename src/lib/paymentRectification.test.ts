import { describe, it, expect } from "vitest";
import {
  selectInstallment,
  installmentPendingHint,
  requiresRectification,
  interpretRectificationResponse,
} from "./paymentRectification";

describe("Imputar a cuota", () => {
  const manual = { amount: "250", rate: "1.08", equivalent: "270", override: true };

  it("elegir una cuota no pisa el monto manual ni la cotización/equivalente", () => {
    const next = selectInstallment(manual, "inst-1");
    expect(next.amount).toBe("250");
    expect(next.rate).toBe("1.08");
    expect(next.equivalent).toBe("270");
    expect(next.override).toBe(true);
    expect(next.installmentId).toBe("inst-1");
  });

  it("volver a Pago general tampoco cambia el monto", () => {
    expect(selectInstallment(manual, null).amount).toBe("250");
  });

  it("el saldo de la cuota es solo una ayuda", () => {
    expect(installmentPendingHint({ id: "a", balance_due: 812.5 })).toBe(812.5);
    expect(installmentPendingHint({ id: "a", balance_due: 0 })).toBeNull();
  });
});

describe("Rectificación de pago", () => {
  it("corresponde al cambiar importe", () => {
    expect(requiresRectification([{ field: "amount", old_val: "500", new_val: "450" }])).toBe(true);
  });
  it("corresponde al cambiar moneda", () => {
    expect(requiresRectification([{ field: "currency", old_val: "EUR", new_val: "USD" }])).toBe(true);
  });
  it("no corresponde al editar solo notas o fecha", () => {
    expect(
      requiresRectification([
        { field: "notes", old_val: "", new_val: "x" },
        { field: "payment_date", old_val: "2026-10-01", new_val: "2026-10-02" },
      ]),
    ).toBe(false);
  });
  it("nunca informa enviado si el envío falló", () => {
    expect(interpretRectificationResponse({ success: false, email_sent: false, email_error: "Queue" }, null).kind).toBe("failed");
    expect(interpretRectificationResponse(null, { message: "500" }).kind).toBe("failed");
    expect(interpretRectificationResponse({ email_sent: true }, null).kind).toBe("sent");
    expect(interpretRectificationResponse({ sent: false, reason: "no_original_notification" }, null).kind).toBe("no_original");
  });
});
