import type { ArcaImportedFiscalDocument } from "@/lib/arca-comprobantes-import";

export interface ReybaudFiscalInvoiceLike {
  id: string;
  tipo_comprobante: number | null;
  numero_comprobante: string | null;
  monto: number | string | null;
  cae?: string | null;
  fecha_emision?: string | null;
}

export interface ExistingFiscalMatch {
  document: ArcaImportedFiscalDocument;
  facturaId: string;
}

export interface FiscalMismatch {
  document: ArcaImportedFiscalDocument;
  facturaId: string;
  reason: string;
}

export interface FiscalReconciliation {
  newDocuments: ArcaImportedFiscalDocument[];
  existingDocuments: ExistingFiscalMatch[];
  mismatches: FiscalMismatch[];
}

export function normalizeCuit(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function parseReybaudFiscalNumber(value: string | null | undefined): {
  puntoVenta: number;
  numeroComprobante: number;
} | null {
  const match = String(value ?? "").trim().match(/^(\d{1,5})-(\d{1,8})$/);
  if (!match) return null;

  const puntoVenta = Number(match[1]);
  const numeroComprobante = Number(match[2]);
  if (!Number.isInteger(puntoVenta) || puntoVenta <= 0) return null;
  if (!Number.isInteger(numeroComprobante) || numeroComprobante <= 0) return null;

  return { puntoVenta, numeroComprobante };
}

export function fiscalIdentity(params: {
  tipoComprobante: number;
  puntoVenta: number;
  numeroComprobante: number;
}): string {
  return `${params.tipoComprobante}:${params.puntoVenta}:${params.numeroComprobante}`;
}

export function reconcileArcaWithReybaud(
  documents: ArcaImportedFiscalDocument[],
  facturas: ReybaudFiscalInvoiceLike[],
): FiscalReconciliation {
  const appByIdentity = new Map<string, ReybaudFiscalInvoiceLike>();

  for (const factura of facturas) {
    if (!factura.tipo_comprobante || !factura.numero_comprobante) continue;
    const parsed = parseReybaudFiscalNumber(factura.numero_comprobante);
    if (!parsed) continue;

    appByIdentity.set(
      fiscalIdentity({
        tipoComprobante: factura.tipo_comprobante,
        puntoVenta: parsed.puntoVenta,
        numeroComprobante: parsed.numeroComprobante,
      }),
      factura,
    );
  }

  const newDocuments: ArcaImportedFiscalDocument[] = [];
  const existingDocuments: ExistingFiscalMatch[] = [];
  const mismatches: FiscalMismatch[] = [];

  for (const document of documents) {
    const identity = fiscalIdentity({
      tipoComprobante: document.tipoComprobante,
      puntoVenta: document.puntoVenta,
      numeroComprobante: document.numeroComprobante,
    });
    const factura = appByIdentity.get(identity);

    if (!factura) {
      newDocuments.push(document);
      continue;
    }

    const appAmount = Number(factura.monto ?? 0);
    const amountMatches = Number.isFinite(appAmount) && Math.abs(appAmount - document.importeTotal) <= 0.01;

    if (!amountMatches) {
      mismatches.push({
        document,
        facturaId: factura.id,
        reason: `El mismo comprobante existe en Reybaud por $${appAmount.toFixed(2)}, pero ARCA informa $${document.importeTotal.toFixed(2)}.`,
      });
      continue;
    }

    existingDocuments.push({ document, facturaId: factura.id });
  }

  return { newDocuments, existingDocuments, mismatches };
}
