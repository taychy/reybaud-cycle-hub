/**
 * Validación del documento en la ficha del alumno (DNI o CUIT/CUIL).
 * Coherente con src/lib/fiscalIdentity.ts: si el tipo guardado coincide con
 * el número, la facturación no marca "Tipo de documento inconsistente".
 */
import { fiscalDocDigits, isCuitValido } from "./fiscalIdentity";

export type TipoDocumento = "dni" | "cuit";

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  dni: "DNI",
  cuit: "CUIT/CUIL",
};

export function normalizeTipoDocumento(raw: string | null | undefined): TipoDocumento {
  const t = (raw || "").toLowerCase();
  return t.includes("cuit") || t.includes("cuil") ? "cuit" : "dni";
}

export interface DocumentoCheck {
  /** Valor limpio a guardar (solo dígitos) o null si vacío. */
  value: string | null;
  error: string | null;
  /** Tipo sugerido cuando el número no coincide con el tipo elegido. */
  suggestTipo: TipoDocumento | null;
}

export function checkDocumento(raw: string, tipo: TipoDocumento): DocumentoCheck {
  const t = raw.trim();
  if (!t) return { value: null, error: null, suggestTipo: null };
  const d = fiscalDocDigits(t);
  if (!d) return { value: null, error: "Solo números (sin letras ni símbolos)", suggestTipo: null };

  if (tipo === "dni") {
    if (d.length === 11 && isCuitValido(d)) {
      return { value: d, error: "Ese número es un CUIT/CUIL válido, no un DNI", suggestTipo: "cuit" };
    }
    if (d.length !== 7 && d.length !== 8) {
      return { value: d, error: "El DNI debe tener 7 u 8 dígitos", suggestTipo: null };
    }
    return { value: d, error: null, suggestTipo: null };
  }

  if (d.length === 7 || d.length === 8) {
    return { value: d, error: "Ese número es un DNI, no un CUIT/CUIL", suggestTipo: "dni" };
  }
  if (d.length !== 11) return { value: d, error: "El CUIT/CUIL debe tener 11 dígitos", suggestTipo: null };
  if (!isCuitValido(d)) return { value: d, error: "CUIT/CUIL con dígito verificador inválido", suggestTipo: null };
  return { value: d, error: null, suggestTipo: null };
}

/** Formato de lectura: "DNI 33292577" / "CUIT/CUIL 20-33292577-7". */
export function formatDocumento(doc: string | null | undefined, tipo: string | null | undefined): string {
  if (!doc) return "—";
  const tp = normalizeTipoDocumento(tipo);
  const d = fiscalDocDigits(doc);
  if (tp === "cuit" && d && d.length === 11) {
    return `${TIPO_DOCUMENTO_LABEL.cuit} ${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  }
  return `${TIPO_DOCUMENTO_LABEL[tp]} ${doc}`;
}
