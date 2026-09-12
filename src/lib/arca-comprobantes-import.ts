import { Workbook } from "exceljs";
import {
  getFiscalDocumentTypeInfo,
  type FiscalDocumentClass,
  type FiscalLetter,
  type SupportedFiscalDocumentType,
} from "@/lib/fiscal-comprobantes";

export interface ArcaImportedFiscalDocument {
  rowNumber: number;
  fechaEmision: string;
  tipoComprobante: SupportedFiscalDocumentType;
  clase: FiscalDocumentClass;
  letra: FiscalLetter;
  puntoVenta: number;
  numeroComprobante: number;
  cae: string | null;
  clienteDocTipo: string | null;
  clienteDocNro: string | null;
  clienteNombre: string | null;
  moneda: string;
  importeTotal: number;
}

export interface ArcaImportIssue {
  rowNumber: number;
  reason: string;
}

export interface ArcaImportPreview {
  cuitEmisor: string | null;
  documents: ArcaImportedFiscalDocument[];
  issues: ArcaImportIssue[];
  duplicates: number;
}

const REQUIRED_HEADERS = ["Fecha", "Tipo", "Punto de Venta", "Número Desde", "Imp. Total"] as const;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findValue(row: Record<string, string>, header: string): string {
  const target = normalizeHeader(header);
  const entry = Object.entries(row).find(([key]) => normalizeHeader(key) === target);
  return entry?.[1]?.trim() ?? "";
}

function parseMoney(value: string): number | null {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return null;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseInteger(value: string): number | null {
  const cleaned = value.replace(/[^0-9-]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isInteger(number) ? number : null;
}

function parseArcaDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return iso;
}

function parseDocumentType(value: string): SupportedFiscalDocumentType | null {
  const match = value.match(/^\s*(\d+)/);
  if (!match) return null;
  const type = Number(match[1]);
  return getFiscalDocumentTypeInfo(type)?.tipo ?? null;
}

export function extractCuitFromArcaTitle(title: string): string | null {
  return title.match(/CUIT\s+(\d{11})/i)?.[1] ?? null;
}

export function parseArcaComprobantesRows(
  rows: Record<string, string>[],
  cuitEmisor: string | null = null,
): ArcaImportPreview {
  const documents: ArcaImportedFiscalDocument[] = [];
  const issues: ArcaImportIssue[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 3;
    if (Object.values(row).every((value) => !String(value ?? "").trim())) return;

    const missing = REQUIRED_HEADERS.filter((header) => !findValue(row, header));
    if (missing.length > 0) {
      issues.push({ rowNumber, reason: `Faltan datos requeridos: ${missing.join(", ")}` });
      return;
    }

    const fechaEmision = parseArcaDate(findValue(row, "Fecha"));
    const tipoComprobante = parseDocumentType(findValue(row, "Tipo"));
    const puntoVenta = parseInteger(findValue(row, "Punto de Venta"));
    const numeroComprobante = parseInteger(findValue(row, "Número Desde"));
    const importeTotal = parseMoney(findValue(row, "Imp. Total"));

    if (!fechaEmision) {
      issues.push({ rowNumber, reason: "Fecha inválida" });
      return;
    }
    if (!tipoComprobante) {
      issues.push({ rowNumber, reason: `Tipo de comprobante no soportado: ${findValue(row, "Tipo") || "vacío"}` });
      return;
    }
    if (!puntoVenta || puntoVenta <= 0) {
      issues.push({ rowNumber, reason: "Punto de venta inválido" });
      return;
    }
    if (!numeroComprobante || numeroComprobante <= 0) {
      issues.push({ rowNumber, reason: "Número de comprobante inválido" });
      return;
    }
    if (importeTotal === null || importeTotal < 0) {
      issues.push({ rowNumber, reason: "Importe total inválido" });
      return;
    }

    const identity = `${tipoComprobante}:${puntoVenta}:${numeroComprobante}`;
    if (seen.has(identity)) {
      duplicates += 1;
      issues.push({ rowNumber, reason: "Comprobante duplicado dentro del archivo" });
      return;
    }
    seen.add(identity);

    const typeInfo = getFiscalDocumentTypeInfo(tipoComprobante)!;
    documents.push({
      rowNumber,
      fechaEmision,
      tipoComprobante,
      clase: typeInfo.clase,
      letra: typeInfo.letra,
      puntoVenta,
      numeroComprobante,
      cae: findValue(row, "Cód. Autorización") || null,
      clienteDocTipo: findValue(row, "Tipo Doc. Receptor") || null,
      clienteDocNro: findValue(row, "Nro. Doc. Receptor") || null,
      clienteNombre: findValue(row, "Denominación Receptor") || null,
      moneda: findValue(row, "Moneda") || "$",
      importeTotal,
    });
  });

  return { cuitEmisor, documents, issues, duplicates };
}

export async function readArcaComprobantesXlsx(file: File): Promise<ArcaImportPreview> {
  const workbook = new Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("El archivo no contiene hojas de cálculo.");

  const title = worksheet.getCell("A1").text ?? "";
  const cuitEmisor = extractCuitFromArcaTitle(title);

  const headerRow = worksheet.getRow(2);
  const headers: string[] = [];
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    headers.push(headerRow.getCell(column).text.trim());
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (required) => !headers.some((header) => normalizeHeader(header) === normalizeHeader(required)),
  );
  if (missingHeaders.length > 0) {
    throw new Error(`No parece ser un export de ARCA. Faltan columnas: ${missingHeaders.join(", ")}.`);
  }

  const rows: Record<string, string>[] = [];
  for (let rowNumber = 3; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = row.getCell(index + 1).text.trim();
    });
    rows.push(record);
  }

  return parseArcaComprobantesRows(rows, cuitEmisor);
}
