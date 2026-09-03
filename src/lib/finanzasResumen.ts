/**
 * Resumen financiero simple del mes (lenguaje humano).
 *
 * Fuente canónica: RPC `get_resumen_financiero_mes`.
 * Reglas duras que la UI NO debe violar:
 *  - `Entró` = SOLO movimientos MP aprobados de ingreso. Facturas, `cuenta_ajustes`
 *    y `pagos_imputaciones` NO son plata que entró.
 *  - `Salió` = gastos del mes + egresos MP del mes SIN gasto vinculado (nunca ambos:
 *    un egreso MP ya convertido en gasto es UN solo egreso).
 *  - `Falta cobrar` = `vw_pagos_por_cobrar`, separando el mes vigente del arrastre vencido.
 *  - `Falta pagar` = compromisos realmente modelados. Si no hay ninguno → `null`
 *    (se muestra "Sin datos cargados", nunca 0).
 */

export interface ResumenMesRaw {
  mes: string;
  moneda: string;
  entro: number;
  desglose: Record<string, number>;
  falta_cobrar_mes: number;
  vencido_de_antes: number;
  salio: number;
  salio_gastos: number;
  salio_mp_sin_gasto: number;
  /** null = no hay ninguna fuente de compromisos cargada */
  falta_pagar: number | null;
  falta_pagar_filas: number;
  liquidaciones_generadas: boolean;
  liquidaciones_pendientes: number;
}

export interface ResumenMesCalculado extends ResumenMesRaw {
  /** Entró - Salió */
  saldoDelMes: number;
  /** Entró + Falta cobrar del mes - Salió - Falta pagar del mes */
  comoPuedeCerrar: number;
  /** true si faltan fuentes importantes de compromisos */
  estimacionIncompleta: boolean;
  motivosIncompleta: string[];
}

export const UNIDAD_LABEL: Record<string, string> = {
  escuela: "Escuela",
  viajes: "Viajes y eventos",
  tienda: "Tienda",
  personalizadas: "Personalizadas",
  sin_identificar: "Sin identificar",
};

export const UNIDAD_ORDEN = ["escuela", "viajes", "tienda", "personalizadas", "sin_identificar"];

export function calcularResumenMes(r: ResumenMesRaw): ResumenMesCalculado {
  const saldoDelMes = r.entro - r.salio;
  const faltaPagar = r.falta_pagar ?? 0;
  const comoPuedeCerrar = r.entro + r.falta_cobrar_mes - r.salio - faltaPagar;

  const motivos: string[] = [];
  if (!r.liquidaciones_generadas) {
    motivos.push("Las liquidaciones de profesores del mes todavía no están generadas.");
  }
  if (r.falta_pagar === null) {
    motivos.push("No hay compromisos de pago cargados para este mes.");
  }

  return {
    ...r,
    saldoDelMes,
    comoPuedeCerrar,
    estimacionIncompleta: motivos.length > 0,
    motivosIncompleta: motivos,
  };
}

/** Desglose ordenado y sin unidades en cero. */
export function desgloseOrdenado(r: ResumenMesRaw): { unidad: string; label: string; total: number }[] {
  return UNIDAD_ORDEN
    .map((u) => ({ unidad: u, label: UNIDAD_LABEL[u], total: Number(r.desglose?.[u] ?? 0) }))
    .filter((d) => d.total !== 0);
}

/** "2026-09" a partir de un Date, sin corrimiento de zona horaria. */
export function mesKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Primer día del mes como string literal, para pasar al RPC. */
export function mesToDateParam(mes: string): string {
  return `${mes}-01`;
}

export function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${nombres[(m ?? 1) - 1]} ${y}`;
}

/** Últimos N meses (incluye el actual), más recientes primero. */
export function ultimosMeses(desde: Date, n = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(mesKey(new Date(desde.getFullYear(), desde.getMonth() - i, 1)));
  }
  return out;
}
