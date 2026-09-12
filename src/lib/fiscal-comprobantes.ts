export type FiscalDocumentOrigin = "emitido_app" | "historico_importado";
export type FiscalDocumentClass = "factura" | "nota_credito" | "nota_debito";
export type FiscalLetter = "A" | "B" | "C";

export type SupportedFiscalDocumentType = 1 | 3 | 6 | 8 | 11 | 13;

export interface FiscalDocumentTypeInfo {
  tipo: SupportedFiscalDocumentType;
  clase: Exclude<FiscalDocumentClass, "nota_debito">;
  letra: FiscalLetter;
  label: string;
}

export interface FiscalAmountLike {
  clase: FiscalDocumentClass;
  importe_total: number;
}

export const FISCAL_DOCUMENT_TYPES: Record<SupportedFiscalDocumentType, FiscalDocumentTypeInfo> = {
  1: { tipo: 1, clase: "factura", letra: "A", label: "Factura A" },
  3: { tipo: 3, clase: "nota_credito", letra: "A", label: "Nota de Crédito A" },
  6: { tipo: 6, clase: "factura", letra: "B", label: "Factura B" },
  8: { tipo: 8, clase: "nota_credito", letra: "B", label: "Nota de Crédito B" },
  11: { tipo: 11, clase: "factura", letra: "C", label: "Factura C" },
  13: { tipo: 13, clase: "nota_credito", letra: "C", label: "Nota de Crédito C" },
};

const CREDIT_NOTE_BY_INVOICE: Record<1 | 6 | 11, 3 | 8 | 13> = {
  1: 3,
  6: 8,
  11: 13,
};

export function isSupportedFiscalDocumentType(value: number): value is SupportedFiscalDocumentType {
  return value in FISCAL_DOCUMENT_TYPES;
}

export function getFiscalDocumentTypeInfo(tipo: number): FiscalDocumentTypeInfo | null {
  return isSupportedFiscalDocumentType(tipo) ? FISCAL_DOCUMENT_TYPES[tipo] : null;
}

export function getCreditNoteTypeForInvoice(tipoFactura: number): 3 | 8 | 13 | null {
  if (tipoFactura !== 1 && tipoFactura !== 6 && tipoFactura !== 11) return null;
  return CREDIT_NOTE_BY_INVOICE[tipoFactura];
}

/**
 * Returns the fiscal contribution of a document to revenue.
 * Credit notes subtract; invoices and future debit notes add.
 * Amounts are stored as positive values in the ledger.
 */
export function signedFiscalAmount(document: FiscalAmountLike): number {
  const amount = Math.abs(Number(document.importe_total) || 0);
  return document.clase === "nota_credito" ? -amount : amount;
}

export function calculateFiscalNet(documents: FiscalAmountLike[]): number {
  return documents.reduce((total, document) => total + signedFiscalAmount(document), 0);
}

/** Stable key used both by imports and the DB unique constraint semantics. */
export function buildFiscalDocumentKey(params: {
  emisorId: string;
  tipoComprobante: number;
  puntoVenta: number;
  numeroComprobante: string | number;
}): string {
  const numero = String(params.numeroComprobante).trim().replace(/^0+(?=\d)/, "") || "0";
  return [params.emisorId.trim(), params.tipoComprobante, params.puntoVenta, numero].join(":");
}
