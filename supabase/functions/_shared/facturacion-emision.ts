/**
 * Reglas puras de emisión/recuperación de facturas ARCA.
 * Sin dependencias de Deno: se testean con vitest desde src/lib.
 */

export type OrigenEmision = "auto" | "manual";

export interface FechasEmision {
  cbteFch: string; // YYYYMMDD
  servDesde: string;
  servHasta: string;
  vtoPago: string;
  usoFechaCobro: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toYmd(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** "2026-10-05" -> Date UTC (sin corrimiento de zona horaria). */
export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Días hacia atrás que ARCA admite para la fecha del comprobante. */
export function rangoDiasArca(segmento: string | null | undefined): number {
  return (segmento || "").toLowerCase() === "tienda" ? 5 : 10;
}

/**
 * Fechas del comprobante a partir del cobro (no "hoy").
 * - auto: si la fecha del cobro está fuera del rango ARCA, error (va a revisión manual).
 * - manual: si está fuera de rango, se emite con fecha de hoy pero el período de servicio
 *   sigue siendo el del cobro.
 */
export function resolverFechasEmision(opts: {
  hoy: Date; // fecha de hoy en Argentina (UTC midnight)
  fechaComprobante?: string | null;
  servicioDesde?: string | null;
  servicioHasta?: string | null;
  segmento?: string | null;
  origen: OrigenEmision;
}): FechasEmision | { error: string } {
  const hoy = opts.hoy;
  const rango = rangoDiasArca(opts.segmento);
  const minimo = new Date(hoy.getTime() - rango * 86400000);
  const cobro = parseIsoDate(opts.fechaComprobante);

  let cbte = hoy;
  let usoFechaCobro = false;
  if (cobro) {
    if (cobro >= minimo && cobro <= hoy) {
      cbte = cobro;
      usoFechaCobro = true;
    } else if (opts.origen === "auto") {
      return { error: `fecha_fuera_de_rango_arca: el cobro es del ${opts.fechaComprobante} y ARCA admite hasta ${rango} días atrás` };
    }
  }

  let desde = parseIsoDate(opts.servicioDesde);
  let hasta = parseIsoDate(opts.servicioHasta);
  if (!desde || !hasta) {
    const base = cobro ?? hoy;
    desde = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    hasta = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  }
  if (hasta < desde) hasta = desde;

  return {
    cbteFch: toYmd(cbte),
    servDesde: toYmd(desde),
    servHasta: toYmd(hasta),
    vtoPago: toYmd(cbte),
    usoFechaCobro,
  };
}

export interface ConsultaComprobante {
  encontrado: boolean;
  cae?: string | null;
  caeVto?: string | null;
  impTotal?: number | null;
  docNro?: string | null;
}

export type DecisionReconciliacion =
  | { accion: "recuperar"; cae: string; caeVto: string | null }
  | { accion: "liberar"; motivo: string }
  | { accion: "conflicto"; motivo: string }
  | { accion: "incierto"; motivo: string };

/**
 * Qué hacer con una factura en emisión incierta, según lo que responde ARCA
 * para el número esperado. Nunca libera para reemitir si ARCA podría tener el comprobante.
 */
export function decidirReconciliacion(input: {
  esperadoNro: number | null;
  consulta: ConsultaComprobante | null; // null = no se pudo consultar
  ultimoAutorizado: number | null;
  monto: number;
  docNro: string | null;
}): DecisionReconciliacion {
  if (input.esperadoNro == null) {
    return { accion: "liberar", motivo: "Nunca se pidió número a ARCA: se puede reintentar" };
  }
  if (!input.consulta) {
    return { accion: "incierto", motivo: "No se pudo consultar ARCA; se reintenta la conciliación" };
  }
  if (input.consulta.encontrado && input.consulta.cae) {
    const montoOk = input.consulta.impTotal == null || Math.abs(Number(input.consulta.impTotal) - Number(input.monto)) < 0.01;
    const docOk = !input.docNro || !input.consulta.docNro || String(input.consulta.docNro) === String(input.docNro);
    if (montoOk && docOk) {
      return { accion: "recuperar", cae: input.consulta.cae, caeVto: input.consulta.caeVto ?? null };
    }
    return { accion: "conflicto", motivo: "ARCA tiene ese número con otro importe o cliente: revisar a mano" };
  }
  if (input.ultimoAutorizado != null && input.ultimoAutorizado < input.esperadoNro) {
    return { accion: "liberar", motivo: "ARCA no autorizó el número esperado: se puede reintentar" };
  }
  return { accion: "incierto", motivo: "ARCA no confirma el comprobante y el último número es igual o mayor: revisar" };
}

/** Errores transitorios (red, servicio caído) que justifican reintento automático. */
export function esErrorTransitorio(msg: string | null | undefined): boolean {
  const m = (msg || "").toLowerCase();
  return /http 5\d\d|timeout|timed out|network|econn|fetch failed|service unavailable|wsaa|soap fault|ya posee un ta valido|connection/.test(m);
}
