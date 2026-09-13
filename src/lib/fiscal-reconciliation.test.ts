import { describe, expect, it } from "vitest";
import type { ArcaImportedFiscalDocument } from "@/lib/arca-comprobantes-import";
import {
  normalizeCuit,
  parseReybaudFiscalNumber,
  reconcileArcaWithReybaud,
} from "@/lib/fiscal-reconciliation";

const doc = (overrides: Partial<ArcaImportedFiscalDocument> = {}): ArcaImportedFiscalDocument => ({
  rowNumber: 3,
  fechaEmision: "2026-09-01",
  tipoComprobante: 11,
  clase: "factura",
  letra: "C",
  puntoVenta: 4,
  numeroComprobante: 869,
  cae: "12345678901234",
  clienteDocTipo: "96",
  clienteDocNro: "12345678",
  clienteNombre: "Cliente",
  moneda: "$",
  importeTotal: 16590,
  ...overrides,
});

describe("fiscal reconciliation", () => {
  it("normalizes CUIT with punctuation", () => {
    expect(normalizeCuit("23-95115383-4")).toBe("23951153834");
  });

  it("parses Reybaud fiscal number with five-digit point of sale", () => {
    expect(parseReybaudFiscalNumber("00004-00000869")).toEqual({
      puntoVenta: 4,
      numeroComprobante: 869,
    });
  });

  it("classifies exact fiscal identity and amount as existing", () => {
    const result = reconcileArcaWithReybaud([doc()], [
      {
        id: "factura-1",
        tipo_comprobante: 11,
        numero_comprobante: "00004-00000869",
        monto: 16590,
        cae: "123",
      },
    ]);

    expect(result.existingDocuments).toHaveLength(1);
    expect(result.existingDocuments[0].source).toBe("app");
    expect(result.newDocuments).toHaveLength(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("recognizes a previously imported historical comprobante", () => {
    const result = reconcileArcaWithReybaud([doc()], [
      {
        id: "historical-1",
        tipo_comprobante: 11,
        numero_comprobante: "00004-00000869",
        monto: 16590,
        source: "historical",
      },
    ]);

    expect(result.existingDocuments).toHaveLength(1);
    expect(result.existingDocuments[0].source).toBe("historical");
    expect(result.newDocuments).toHaveLength(0);
  });

  it("keeps a different point of sale as new", () => {
    const result = reconcileArcaWithReybaud([doc({ puntoVenta: 2 })], [
      {
        id: "factura-1",
        tipo_comprobante: 11,
        numero_comprobante: "00004-00000869",
        monto: 16590,
      },
    ]);

    expect(result.newDocuments).toHaveLength(1);
    expect(result.existingDocuments).toHaveLength(0);
  });

  it("flags same fiscal identity with different amount for review", () => {
    const result = reconcileArcaWithReybaud([doc({ importeTotal: 17000 })], [
      {
        id: "factura-1",
        tipo_comprobante: 11,
        numero_comprobante: "00004-00000869",
        monto: 16590,
      },
    ]);

    expect(result.mismatches).toHaveLength(1);
    expect(result.newDocuments).toHaveLength(0);
    expect(result.existingDocuments).toHaveLength(0);
  });
});
