import { describe, expect, it } from "vitest";
import { canChangeBillingExclusion, canInvoiceQueueRow, isBillingExcluded } from "./billingQueueExclusion";

describe("billing queue exclusion", () => {
  it("excluded payments never qualify for invoicing", () => {
    expect(canInvoiceQueueRow({ estado: "excluida" })).toBe(false);
    expect(canInvoiceQueueRow({ estado: "pendiente", excluida_facturacion: true })).toBe(false);
  });
  it("reinclusion restores eligibility without economic fields", () => {
    expect(canInvoiceQueueRow({ estado: "pendiente", excluida_facturacion: false, auto_estado: "manual" })).toBe(true);
  });
  it("exclusion may be reversed", () => {
    expect(isBillingExcluded({ estado: "excluida" })).toBe(true);
    expect(canChangeBillingExclusion({ estado: "excluida", auto_estado: "excluida" })).toBe(true);
  });
  it.each([
    { estado: "facturada" }, { estado: "anulada" },
    { estado: "pendiente", auto_estado: "emitiendo" },
    { estado: "pendiente", factura_estado: "emitiendo" },
    { estado: "pendiente", factura_estado: "emitida" },
    { estado: "pendiente", factura_cae: "123" },
  ])("protects issued/in-flight payments: %o", (row) => {
    expect(canChangeBillingExclusion(row)).toBe(false);
    expect(canInvoiceQueueRow(row)).toBe(false);
  });
});