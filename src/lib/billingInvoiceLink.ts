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

/**
 * Extrae el mensaje real de error de una edge function.
 * `supabase.functions.invoke` devuelve "Edge Function returned a non-2xx status code"
 * y deja la respuesta HTTP en `error.context`; ahí está el JSON `{ error: "..." }`.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  data?: { error?: string } | null,
): Promise<string> {
  if (data?.error) return data.error;
  const ctx = (error as { context?: unknown } | null)?.context as Response | undefined;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      const raw = await (ctx as Response).clone().text();
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error) return String(parsed.error);
        if (parsed?.message) return String(parsed.message);
      } catch {
        if (raw?.trim()) return raw.trim().slice(0, 300);
      }
    } catch {
      /* ignorar: nos quedamos con el mensaje genérico */
    }
  }
  return (error as { message?: string } | null)?.message || "Error inesperado";
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
