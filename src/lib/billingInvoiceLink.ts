/**
 * Resolución determinística factura ↔ pago.
 *
 * Regla: si conocemos la fila exacta de `facturacion_cola`, la factura se busca
 * SOLO por `facturacion_cola_id`. La búsqueda por `referencia_tipo/referencia_id`
 * queda como fallback legacy (datos previos al vínculo explícito), porque una
 * misma reserva puede tener varios pagos legítimos.
 */
export interface FacturaLike {
  id: string;
  facturacion_cola_id?: string | null;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
  estado?: string | null;
  cae?: string | null;
}

export function resolveExistingFactura<T extends FacturaLike>(
  facturas: T[],
  opts: {
    facturacionColaId?: string | null;
    referenciaTipo?: string | null;
    referenciaId?: string | null;
  },
): T | null {
  if (opts.facturacionColaId) {
    return facturas.find((f) => f.facturacion_cola_id === opts.facturacionColaId) ?? null;
  }
  if (opts.referenciaTipo && opts.referenciaId) {
    return (
      facturas.find(
        (f) =>
          f.referencia_tipo === opts.referenciaTipo &&
          f.referencia_id === opts.referenciaId,
      ) ?? null
    );
  }
  return null;
}

/** Una factura está realmente emitida en AFIP sólo si tiene CAE. */
export function isFacturaEmitida(f: Pick<FacturaLike, "estado" | "cae"> | null | undefined): boolean {
  return !!f && f.estado === "emitida" && !!f.cae;
}

/** Problema en lenguaje humano para la bandeja "Problemas". */
export function describeFacturaProblem(
  f: Pick<FacturaLike, "estado" | "cae"> | null | undefined,
): string | null {
  if (!f) return null;
  if (f.estado === "error") return "Error al emitir";
  if (f.estado === "emitida" && !f.cae) return "Factura manual sin CAE";
  if (f.estado === "sin_factura") return "Preparada, sin emitir";
  return null;
}
