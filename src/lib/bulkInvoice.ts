/**
 * Reglas del modal de facturación masiva: cada fila se emite con SU emisor
 * resuelto (nunca un emisor global) y el cupo se controla por emisor.
 */

export interface EmisorLite {
  id: string;
  nombre_fiscal: string;
  cuit?: string | null;
  punto_venta?: number | null;
  activo?: boolean;
  tiene_credenciales?: boolean;
}

export interface FilaEmisor {
  id: string;
  emisor_id?: string | null;
  auto_estado?: string | null;
  monto: number;
  fecha?: string | null;
}

/** Motivo por el que la fila no puede emitirse por su emisor, o null si está OK. */
export function bloqueoEmisor(row: FilaEmisor, emisores: EmisorLite[]): string | null {
  if (row.auto_estado === "requiere_revision_emisor") return "Revisar emisor";
  if (!row.emisor_id) return "Revisar emisor";
  const e = emisores.find((x) => x.id === row.emisor_id);
  if (!e || e.activo === false) return "Revisar emisor";
  if (!e.cuit || !e.punto_venta || !e.tiene_credenciales) return "Emisor sin CUIT, punto de venta o certificado";
  return null;
}

/** Total seleccionado por emisor. */
export function totalesPorEmisor<T extends FilaEmisor>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.emisor_id) continue;
    m.set(r.emisor_id, (m.get(r.emisor_id) ?? 0) + Number(r.monto || 0));
  }
  return m;
}

/**
 * Orden de emisión: agrupado por emisor y, dentro de cada uno, por fecha de
 * cobro ascendente (ARCA no admite fechas anteriores al último comprobante).
 */
export function ordenEmision<T extends FilaEmisor>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const e = String(a.emisor_id).localeCompare(String(b.emisor_id));
    if (e !== 0) return e;
    return String(a.fecha ?? "").localeCompare(String(b.fecha ?? ""));
  });
}

/** Mensaje legible para el resultado de una emisión fallida. */
export function mensajeErrorEmision(raw: string, code?: string | null): string {
  if (code === "ta_vigente_no_disponible" || /ya posee un TA valido|Ticket WSAA vigente/i.test(raw)) {
    return "Ticket WSAA vigente en ARCA que el sistema no tiene guardado: reintentá más tarde (vence en hasta 12 h). " + raw;
  }
  if (code === "numeracion_arca" || /no se corresponde con el proximo a autorizar/i.test(raw)) {
    return "ARCA rechazó la numeración o la fecha incluso después de reconsultar: " + raw;
  }
  return raw;
}
