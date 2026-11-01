// Agrupa los movimientos de cuenta corriente por origen comercial, para que
// un filtro como "Evento / Viaje" muestre el cargo Y todos sus pagos,
// créditos aplicados, imputaciones y devoluciones vinculadas a la reserva.
// Solo clasifica filas existentes: nunca crea ni suma movimientos.

export type OrigenGrupo = "evento" | "suscripcion" | "preventa" | "tienda" | "entrega" | "ajuste" | "devolucion";

export interface MovimientoClasificable {
  tipo: string;
  referencia_extra?: Record<string, unknown> | null;
}

export const ORIGEN_GRUPOS: { key: OrigenGrupo; label: string }[] = [
  { key: "evento", label: "Evento / Viaje (cargos y pagos)" },
  { key: "suscripcion", label: "Suscripción (cargos y pagos)" },
  { key: "preventa", label: "Preventa (cargos y pagos)" },
  { key: "tienda", label: "Tienda (cargos y pagos)" },
  { key: "entrega", label: "Entrega (cargos y pagos)" },
  { key: "ajuste", label: "Ajustes sin vincular" },
  { key: "devolucion", label: "Devoluciones sin vincular" },
];

const TIPO_GRUPO: Record<string, OrigenGrupo> = {
  cargo_reserva: "evento",
  pago_reserva: "evento",
  cargo_suscripcion: "suscripcion",
  pago_suscripcion: "suscripcion",
  cargo_preventa: "preventa",
  pago_preventa: "preventa",
  cargo_tienda: "tienda",
  pago_tienda: "tienda",
  cargo_entrega: "entrega",
  pago_entrega: "entrega",
  ajuste_cargo: "ajuste",
  ajuste_credito: "ajuste",
  pago_imputacion: "ajuste",
  devolucion: "devolucion",
};

const TABLA_GRUPO: Record<string, OrigenGrupo> = {
  event_reservations: "evento",
  suscripciones: "suscripcion",
  store_orders: "tienda",
  store_preorders: "preventa",
};

const OBLIGACION_GRUPO: Record<string, OrigenGrupo> = {
  reserva: "evento",
  suscripcion: "suscripcion",
};

export function origenGrupoDe(m: MovimientoClasificable): OrigenGrupo | null {
  const ref = (m.referencia_extra || {}) as Record<string, any>;
  // Vínculo explícito a otra obligación (créditos aplicados, imputaciones, devoluciones).
  const tabla = ref.aplicado_a_fuente_tabla as string | undefined;
  if (tabla && TABLA_GRUPO[tabla]) return TABLA_GRUPO[tabla];
  const oblig = ref.obligacion_tipo as string | undefined;
  if (oblig && OBLIGACION_GRUPO[oblig]) return OBLIGACION_GRUPO[oblig];
  if (m.tipo !== "cargo_reserva" && m.tipo !== "pago_reserva") {
    if (ref.reservation_id) return "evento";
    if (ref.suscripcion_id && m.tipo !== "pago_suscripcion") return "suscripcion";
    if (ref.store_order_id) return "tienda";
  }
  return TIPO_GRUPO[m.tipo] ?? null;
}

/** Filtro: "all", un grupo de origen ("grupo:evento") o un tipo exacto. */
export function coincideFiltroOrigen(m: MovimientoClasificable, filtro: string): boolean {
  if (!filtro || filtro === "all") return true;
  if (filtro.startsWith("grupo:")) return origenGrupoDe(m) === filtro.slice(6);
  return m.tipo === filtro;
}
