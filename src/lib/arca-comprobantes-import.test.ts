import { describe, expect, it } from "vitest";
import { extractCuitFromArcaTitle, parseArcaComprobantesRows } from "@/lib/arca-comprobantes-import";

describe("ARCA comprobantes import", () => {
  it("extracts CUIT from the ARCA export title", () => {
    expect(extractCuitFromArcaTitle("Mis Comprobantes Emitidos - CUIT 23951153834")).toBe("23951153834");
  });

  it("parses invoices and credit notes and preserves their fiscal identity", () => {
    const preview = parseArcaComprobantesRows(
      [
        {
          Fecha: "05/09/2025",
          Tipo: "11 - Factura C",
          "Punto de Venta": "4",
          "Número Desde": "866",
          "Cód. Autorización": "75364479832710",
          "Tipo Doc. Receptor": "DNI",
          "Nro. Doc. Receptor": "27408696",
          "Denominación Receptor": "PERONA GRACIANA LOURDES",
          Moneda: "$",
          "Imp. Total": "393750",
        },
        {
          Fecha: "10/09/2025",
          Tipo: "13 - Nota de Crédito C",
          "Punto de Venta": "4",
          "Número Desde": "12",
          "Cód. Autorización": "75364479832711",
          "Tipo Doc. Receptor": "CUIT",
          "Nro. Doc. Receptor": "20259876428",
          "Denominación Receptor": "CLIENTE PRUEBA",
          Moneda: "$",
          "Imp. Total": "25.000,50",
        },
      ],
      "23951153834",
    );

    expect(preview.cuitEmisor).toBe("23951153834");
    expect(preview.documents).toHaveLength(2);
    expect(preview.issues).toHaveLength(0);
    expect(preview.documents[0]).toMatchObject({
      fechaEmision: "2025-09-05",
      tipoComprobante: 11,
      clase: "factura",
      letra: "C",
      puntoVenta: 4,
      numeroComprobante: 866,
      importeTotal: 393750,
    });
    expect(preview.documents[1]).toMatchObject({
      tipoComprobante: 13,
      clase: "nota_credito",
      importeTotal: 25000.5,
    });
  });

  it("flags duplicates and skips unsupported types", () => {
    const base = {
      Fecha: "05/09/2025",
      "Punto de Venta": "4",
      "Número Desde": "866",
      "Imp. Total": "1000",
    };

    const preview = parseArcaComprobantesRows([
      { ...base, Tipo: "11 - Factura C" },
      { ...base, Tipo: "11 - Factura C" },
      { ...base, "Número Desde": "867", Tipo: "99 - Otro" },
    ]);

    expect(preview.documents).toHaveLength(1);
    expect(preview.duplicates).toBe(1);
    expect(preview.issues).toHaveLength(2);
  });
});
