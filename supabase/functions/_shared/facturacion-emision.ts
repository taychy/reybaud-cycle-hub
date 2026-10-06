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
  cbteFch?: string | null;
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

/**
 * ARCA exige que la fecha de un comprobante no sea anterior a la del último
 * autorizado para el mismo punto de venta y tipo. Si el cobro es más viejo,
 * se emite con la fecha del último (el período de servicio no cambia).
 */
export function ajustarFechaAlUltimo(fechas: FechasEmision, ultimoCbteFch: string | null | undefined): FechasEmision & { ajustadaPorUltimo: boolean } {
  if (!ultimoCbteFch || !/^\d{8}$/.test(ultimoCbteFch) || ultimoCbteFch <= fechas.cbteFch) {
    return { ...fechas, ajustadaPorUltimo: false };
  }
  return {
    ...fechas,
    cbteFch: ultimoCbteFch,
    vtoPago: fechas.vtoPago < ultimoCbteFch ? ultimoCbteFch : fechas.vtoPago,
    usoFechaCobro: false,
    ajustadaPorUltimo: true,
  };
}

/** Rechazo 10016: número o fecha no corresponde con el próximo a autorizar. */
export function esMismatchNumeracion(msg: string | null | undefined): boolean {
  return /no se corresponde con el proximo a autorizar|10016/i.test(msg || "");
}

/** WSAA rechaza pedir un TA nuevo mientras hay uno vigente. */
export function esTaVigente(msg: string | null | undefined): boolean {
  return /ya posee un TA valido/i.test(msg || "");
}

/** ¿Se puede reutilizar un TA guardado? Margen de 2 minutos. */
export function taReutilizable(expiresAt: string | null | undefined, ahoraMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - ahoraMs > 2 * 60 * 1000;
}

/**
 * Obtiene un TA para emisor/servicio: reutiliza el guardado si está vigente;
 * si no, hace login. Si WSAA dice que ya hay uno vigente, espera y vuelve a
 * leer el guardado (otra invocación pudo haberlo guardado).
 */
export async function obtenerTicketWsaa(deps: {
  leer: () => Promise<{ token: string; sign: string; expires_at: string } | null>;
  guardar: (t: { token: string; sign: string; expires_at: string }) => Promise<void>;
  login: () => Promise<{ token?: string; sign?: string; expires_at?: string; error?: string }>;
  ahora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}): Promise<{ token?: string; sign?: string; reutilizado?: boolean; error?: string; code?: string }> {
  const ahora = deps.ahora ?? (() => Date.now());
  const esperar = deps.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const g = await deps.leer();
  if (g && taReutilizable(g.expires_at, ahora())) return { token: g.token, sign: g.sign, reutilizado: true };
  const l = await deps.login();
  if (l.token && l.sign) {
    const expires_at = l.expires_at || new Date(ahora() + 11 * 3600 * 1000).toISOString();
    await deps.guardar({ token: l.token, sign: l.sign, expires_at });
    return { token: l.token, sign: l.sign, reutilizado: false };
  }
  if (esTaVigente(l.error)) {
    for (const ms of [800, 1600, 3200]) {
      await esperar(ms);
      const r = await deps.leer();
      if (r && taReutilizable(r.expires_at, ahora())) return { token: r.token, sign: r.sign, reutilizado: true };
    }
    return {
      error: "Ticket WSAA vigente en ARCA pero no guardado en el sistema: se puede reintentar cuando venza (máx. 12 h desde el último login).",
      code: "ta_vigente_no_disponible",
    };
  }
  return { error: `WSAA: ${l.error || "sin token"}`, code: "wsaa_error" };
}
