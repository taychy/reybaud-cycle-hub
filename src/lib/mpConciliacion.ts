/**
 * Estado de conciliación de un movimiento de Mercado Pago.
 *
 * Regla central (Fase 1): tener `alumno_id` NO significa que el pago esté imputado.
 * Sólo hay imputación cuando el movimiento apunta a una obligación real
 * (suscripción, pago de reserva, orden/preventa de tienda, o un crédito aplicado a una deuda).
 *
 * Esta función es la ÚNICA fuente de verdad en el frontend: filtros, KPIs,
 * chips y botones deben derivar de acá para no duplicar reglas.
 */
export type MpConciliacionEstado = "sin_identificar" | "identificado_sin_imputar" | "imputado";
export type MpUnidadNegocio = "tienda" | "viajes" | "escuela" | "sin_clasificar";

export interface MpMovementLike {
  alumno_id?: string | null;
  suscripcion_id?: string | null;
  reservation_payment_id?: string | null;
  external_reference?: string | null;
  raw?: Record<string, any> | null;
  /** true si existe un crédito en cuenta corriente ya aplicado a una deuda */
  credito_aplicado?: boolean | null;
  /** Pago de reserva activo encontrado por mp_payment_id o payment_reference (aunque el movimiento no tenga el vínculo). */
  rp_existente?: { id: string; evento?: string | null } | null;
  /** Orden o preventa de tienda con este mp_payment_id. */
  tienda_existente?: boolean | null;
}

const TIENDA_TYPES = new Set(["store_order", "preorder", "preorder_saldo", "preorder_total"]);

export function isTiendaMovement(m: MpMovementLike): boolean {
  const ref = String(m.external_reference ?? "");
  if (ref.startsWith("store_order:") || ref.startsWith("preorder")) return true;
  const pt = String(m.raw?.metadata?.payment_type ?? "");
  if (TIENDA_TYPES.has(pt)) return true;
  return !!m.tienda_existente;
}

export function classifyMpUnidad(m: MpMovementLike): MpUnidadNegocio {
  // Tienda primero: un cobro de tienda nunca debe tratarse como pago de viaje/escuela.
  if (isTiendaMovement(m)) return "tienda";
  const ref = String(m.external_reference ?? "");
  if (m.reservation_payment_id || m.rp_existente || ref.startsWith("event:")) return "viajes";
  if (m.suscripcion_id || m.credito_aplicado || ref.startsWith("turnera:")) return "escuela";
  return "sin_clasificar";
}

export function deriveMpConciliacionEstado(m: MpMovementLike): MpConciliacionEstado {
  const imputado = !!(
    m.suscripcion_id ||
    m.reservation_payment_id ||
    m.credito_aplicado ||
    m.rp_existente ||
    (isTiendaMovement(m) && m.tienda_existente)
  );
  if (imputado) return "imputado";
  if (m.alumno_id) return "identificado_sin_imputar";
  return "sin_identificar";
}

/** Si el destino ya es conocido (tienda o pago de reserva existente) no se ofrece imputación genérica. */
export function canOfferGenericImputation(m: MpMovementLike): boolean {
  return deriveMpConciliacionEstado(m) !== "imputado" && !isTiendaMovement(m) && !m.rp_existente;
}

/** Texto de destino para movimientos imputados ("Imputado a Training Camp …", "Imputado a Tienda"). */
export function imputadoDestinoLabel(m: MpMovementLike): string | null {
  if (isTiendaMovement(m)) return m.tienda_existente ? "Imputado a Tienda" : null;
  if (m.rp_existente?.evento) return `Imputado a ${m.rp_existente.evento}`;
  if (m.reservation_payment_id || m.rp_existente) return "Imputado a evento";
  if (m.suscripcion_id) return "Imputado a suscripción";
  return null;
}

export const MP_UNIDAD_LABEL: Record<MpUnidadNegocio, string> = {
  tienda: "Tienda",
  viajes: "Viajes",
  escuela: "Escuela",
  sin_clasificar: "Sin clasificar",
};

export const MP_ESTADO_LABEL: Record<MpConciliacionEstado, string> = {
  sin_identificar: "Sin identificar",
  identificado_sin_imputar: "Identificado · falta imputar",
  imputado: "Imputado",
};

export const MP_ESTADO_CLASS: Record<MpConciliacionEstado, string> = {
  sin_identificar: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  identificado_sin_imputar: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  imputado: "bg-green-500/10 text-green-400 border-green-500/30",
};
