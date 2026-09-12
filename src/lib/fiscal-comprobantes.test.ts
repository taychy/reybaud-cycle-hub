import { describe, expect, it } from "vitest";
import {
  buildFiscalDocumentKey,
  calculateFiscalNet,
  getCreditNoteTypeForInvoice,
  getFiscalDocumentTypeInfo,
  signedFiscalAmount,
} from "./fiscal-comprobantes";

describe("fiscal comprobantes", () => {
  it("maps supported invoice and credit-note types", () => {
    expect(getFiscalDocumentTypeInfo(1)?.label).toBe("Factura A");
    expect(getFiscalDocumentTypeInfo(6)?.label).toBe("Factura B");
    expect(getFiscalDocumentTypeInfo(11)?.label).toBe("Factura C");
    expect(getFiscalDocumentTypeInfo(3)?.label).toBe("Nota de Crédito A");
    expect(getFiscalDocumentTypeInfo(8)?.label).toBe("Nota de Crédito B");
    expect(getFiscalDocumentTypeInfo(13)?.label).toBe("Nota de Crédito C");
    expect(getFiscalDocumentTypeInfo(99)).toBeNull();
  });

  it("chooses the matching credit-note type for an invoice", () => {
    expect(getCreditNoteTypeForInvoice(1)).toBe(3);
    expect(getCreditNoteTypeForInvoice(6)).toBe(8);
    expect(getCreditNoteTypeForInvoice(11)).toBe(13);
    expect(getCreditNoteTypeForInvoice(13)).toBeNull();
  });

  it("subtracts credit notes from fiscal revenue", () => {
    expect(signedFiscalAmount({ clase: "factura", importe_total: 125000 })).toBe(125000);
    expect(signedFiscalAmount({ clase: "nota_credito", importe_total: 25000 })).toBe(-25000);
    expect(
      calculateFiscalNet([
        { clase: "factura", importe_total: 125000 },
        { clase: "factura", importe_total: 80000 },
        { clase: "nota_credito", importe_total: 25000 },
      ]),
    ).toBe(180000);
  });

  it("normalizes the fiscal duplicate key", () => {
    expect(
      buildFiscalDocumentKey({
        emisorId: " emisor-1 ",
        tipoComprobante: 11,
        puntoVenta: 4,
        numeroComprobante: "00001235",
      }),
    ).toBe("emisor-1:11:4:1235");
  });
});
