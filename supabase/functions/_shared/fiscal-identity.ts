/**
 * Validación de identidad fiscal compartida por las edge functions de
 * facturación. Misma regla que `src/lib/fiscalIdentity.ts` y que las
 * funciones SQL `clasificar_documento_fiscal` / `fiscal_cuit_valido`.
 */

export type FiscalClase = "ok" | "documento_faltante" | "documento_invalido";

export interface FiscalIdentity {
  clase: FiscalClase;
  docTipo: 80 | 96 | null;
  docNro: string | null;
  inconsistente: boolean;
  mensaje: string | null;
}

const CLEAN_RE = /^[0-9][0-9 .\-]*$/;

export function fiscalDocDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || !CLEAN_RE.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits || null;
}

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
      return { clase: "ok", docTipo: 80, docNro: d, inconsistente: declarado !== "" && !declaraCuit, mensaje: null };
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
    return { clase: "ok", docTipo: 96, docNro: d, inconsistente: declarado !== "" && declaraCuit, mensaje: null };
  }

  return {
    clase: "documento_invalido",
    docTipo: null,
    docNro: null,
    inconsistente: false,
    mensaje: `El documento tiene ${d.length} dígitos: no es un DNI (7 u 8) ni un CUIT (11)`,
  };
}

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

export interface ResolvedFiscalClient {
  identity: FiscalIdentity;
  nombre: string | null;
  documento: string | null;
  condicionFiscal: string | null;
  tipoDocumento: string | null;
}

/**
 * Relee la identidad fiscal actual desde la fuente canónica.
 * Si hay ficha de alumno, manda la ficha; si no, se usa el snapshot recibido.
 */
export async function resolveClienteFiscal(
  adminClient: {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: any }> } };
    };
  },
  opts: {
    alumnoId?: string | null;
    snapshotNombre?: string | null;
    snapshotDocumento?: string | null;
    snapshotCondicion?: string | null;
  },
): Promise<ResolvedFiscalClient> {
  let nombre = opts.snapshotNombre ?? null;
  let documento = opts.snapshotDocumento ?? null;
  let condicionFiscal = opts.snapshotCondicion ?? null;
  let tipoDocumento: string | null = null;

  if (opts.alumnoId) {
    const { data: alumno } = await adminClient
      .from("alumnos")
      .select("nombre, apellido, nombre_fiscal, documento, tipo_documento, condicion_fiscal")
      .eq("id", opts.alumnoId)
      .maybeSingle();

    if (alumno) {
      nombre = fiscalDisplayName(alumno) ?? nombre;
      // La ficha actual manda sobre el snapshot viejo de la cola.
      documento = alumno.documento ?? documento;
      tipoDocumento = alumno.tipo_documento ?? null;
      condicionFiscal = alumno.condicion_fiscal ?? condicionFiscal;
    }
  }

  return {
    identity: resolveFiscalIdentity(documento, tipoDocumento),
    nombre,
    documento,
    condicionFiscal,
    tipoDocumento,
  };
}
