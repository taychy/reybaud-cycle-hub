/**
 * Estado de conciliación de un movimiento de Mercado Pago.
 *
 * Regla central (Fase 1): tener `alumno_id` NO significa que el pago esté imputado.
 * Sólo hay imputación cuando el movimiento apunta a una obligación real
 * (suscripción, pago de reserva, o un crédito aplicado a una deuda).
 *
 * Esta función es la ÚNICA fuente de verdad en el frontend: filtros, KPIs,
 * chips y botones deben derivar de acá para no duplicar reglas.
 */
export type MpConciliacionEstado = "sin_identificar" | "identificado_sin_imputar" | "imputado";

export interface MpMovementLike {
  alumno_id?: string | null;
  suscripcion_id?: string | null;
  reservation_payment_id?: string | null;
  /** true si existe un crédito en cuenta corriente ya aplicado a una deuda */
  credito_aplicado?: boolean | null;
}

export function deriveMpConciliacionEstado(m: MpMovementLike): MpConciliacionEstado {
  const imputado = !!(m.suscripcion_id || m.reservation_payment_id || m.credito_aplicado);
  if (imputado) return "imputado";
  if (m.alumno_id) return "identificado_sin_imputar";
  return "sin_identificar";
}

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
