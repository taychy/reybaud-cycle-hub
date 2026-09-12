/**
 * Validación de identidad fiscal antes de emitir facturas (ARCA/AFIP).
 *
 * Regla única y compartida (front + edge functions + SQL):
 *  - Se limpia el documento SOLO si el valor es numérico con separadores
 *    típicos (espacios, puntos, guiones). URLs, letras o texto entre
 *    paréntesis lo vuelven inválido: nunca se "extrae" un número embebido.
 *  - 11 dígitos con dígito verificador módulo 11 válido => CUIT (DocTipo 80).
 *  - 7 u 8 dígitos => DNI (DocTipo 96).
 *  - Cualquier otra longitud (9, 10, etc.) => inválido.
 *  - `tipo_documento` de la ficha nunca pisa al valor limpio: si dice "dni"
 *    pero el número es un CUIT válido, se emite como CUIT y se marca
 *    la inconsistencia para que un humano corrija la ficha.
 */

export type FiscalClase = "ok" | "documento_faltante" | "documento_invalido";

export interface FiscalIdentity {
  clase: FiscalClase;
  /** DocTipo AFIP: 80 = CUIT, 96 = DNI. */
  docTipo: 80 | 96 | null;
  docNro: string | null;
  /** El `tipo_documento` de la ficha no coincide con el número real. */
  inconsistente: boolean;
  mensaje: string | null;
}

const CLEAN_RE = /^[0-9][0-9 .\-]*$/;

/** Devuelve sólo dígitos si el valor es "limpio"; `null` si trae texto/URL. */
export function fiscalDocDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (!CLEAN_RE.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits || null;
}

/** CUIT/CUIL argentino: 11 dígitos y dígito verificador módulo 11. */
export function isCuitValido(raw: string | null | undefined): boolean {
  const d = fiscalDocDigits(raw);
  if (!d || d.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * weights[i];
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(d[10]);
}

export function resolveFiscalIdentity(
  raw: string | null | undefined,
  tipoDocumento?: string | null,
): FiscalIdentity {
  const declarado = (tipoDocumento || "").trim().toLowerCase();
  const declaraCuit = declarado.includes("cuit") || declarado.includes("cuil");

  if (raw == null || String(raw).trim() === "") {
    return {
      clase: "documento_faltante",
      docTipo: null,
      docNro: null,
      inconsistente: false,
      mensaje: "Falta completar DNI o CUIT en la ficha del cliente",
    };
  }

  const d = fiscalDocDigits(raw);
  if (!d) {
    return {
      clase: "documento_invalido",
      docTipo: null,
      docNro: null,
      inconsistente: false,
      mensaje: "El documento cargado no es un número válido (contiene texto o caracteres inválidos)",
    };
  }

  if (d.length === 11) {
    if (isCuitValido(d)) {
      return {
        clase: "ok",
        docTipo: 80,
        docNro: d,
        inconsistente: declarado !== "" && !declaraCuit,
        mensaje: null,
      };
    }
    return {
      clase: "documento_invalido",
      docTipo: null,
      docNro: null,
      inconsistente: false,
      mensaje: "CUIT de 11 dígitos con dígito verificador inválido",
    };
  }

  if (d.length === 7 || d.length === 8) {
    return {
      clase: "ok",
      docTipo: 96,
      docNro: d,
      inconsistente: declarado !== "" && declaraCuit,
      mensaje: null,
    };
  }

  return {
    clase: "documento_invalido",
    docTipo: null,
    docNro: null,
    inconsistente: false,
    mensaje: `El documento tiene ${d.length} dígitos: no es un DNI (7 u 8) ni un CUIT (11)`,
  };
}

/** ¿Se puede emitir contra ARCA con estos datos? */
export function puedeEmitirFactura(id: FiscalIdentity): boolean {
  return id.clase === "ok";
}

/** Etiqueta corta para la UI de la cola de facturación. */
export function fiscalWarningLabel(id: FiscalIdentity): string | null {
  if (id.clase === "documento_faltante") return "⚠ Datos fiscales incompletos";
  if (id.clase === "documento_invalido") return "⚠ Documento inválido";
  if (id.inconsistente) return "Tipo de documento inconsistente";
  return null;
}

/** Nombre fiscal preferido: razón social si existe; si no, nombre + apellido. */
export function fiscalDisplayName(a: {
  nombre_fiscal?: string | null;
  nombre?: string | null;
  apellido?: string | null;
}): string | null {
  const razon = (a.nombre_fiscal || "").trim();
  if (razon) return razon;
  const full = `${a.nombre || ""} ${a.apellido || ""}`.trim();
  return full || null;
}
