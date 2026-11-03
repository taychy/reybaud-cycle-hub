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
  /** Parte de este cobro ya representada por créditos; no supone una deuda cancelada. */
  credito_representado?: number | null;
  monto_disponible?: number | null;
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
  return deriveMpConciliacionEstado(m) !== "imputado" && !isTiendaMovement(m) && !m.rp_existente
    && !(Number(m.credito_representado ?? 0) > 0)
    && (m.monto_disponible == null || m.monto_disponible > 0);
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

/** Compatibilidad entre la cuenta que recibió el dinero y su destino contable.
 * La cuenta física es la fuente de verdad, no el nombre del alumno ni el texto libre.
 * Las rutas son las registradas en cuenta_mp_routing/unidad_routing.
 */
export type MpDestino = "reservation" | "suscripcion" | "nueva_suscripcion" | "cargo" | "saldo";

export function unidadDeRuta(unidad: string): MpUnidadNegocio | null {
  switch (unidad) {
    case "tienda":
    case "preventa": return "tienda";
    case "viaje_camp":
    case "evento":
    case "viajes": return "viajes";
    case "suscripcion_escuela":
    case "personalizado":
    case "turnera":
    case "escuela": return "escuela";
    default: return null;
  }
}

export function evaluarImputacionMp(
  movimiento: MpMovementLike & { cuenta_unidades?: string[]; ruteo_verificado?: boolean },
  destino: MpDestino,
): string | null {
  if (movimiento.ruteo_verificado !== true) {
    return "No se pudo verificar la cuenta receptora. Actualizá los movimientos antes de imputar.";
  }
  const unidades = new Set((movimiento.cuenta_unidades ?? []).map(unidadDeRuta).filter(Boolean));
  if (unidades.size === 0) {
    return "La cuenta receptora no tiene una ruta comercial configurada. Revisá el ruteo antes de imputar.";
  }
  if (movimiento.tienda_existente || isTiendaMovement(movimiento)) {
    return "Este cobro corresponde a Tienda. No lo vuelvas a imputar: revisá el pedido original.";
  }
  if (movimiento.rp_existente || movimiento.reservation_payment_id) {
    return "Este cobro ya está registrado en una reserva. No generes otra cobranza.";
  }
  if (movimiento.suscripcion_id || movimiento.credito_aplicado) {
    return "Este cobro ya se utilizó para cancelar una deuda.";
  }
  if (Number(movimiento.credito_representado ?? 0) > 0) {
    return "Ya hay un saldo a favor por esta operación. Aplicá ese crédito existente desde la cuenta corriente.";
  }
  if (movimiento.monto_disponible != null && movimiento.monto_disponible <= 0) {
    return "Este cobro no tiene saldo disponible para volver a imputar.";
  }
  const requerida: MpUnidadNegocio = destino === "reservation" ? "viajes" : "escuela";
  if (destino === "saldo") {
    // El crédito genérico puede terminar pagando una deuda de cualquier unidad.
    // Para fondos de Tienda/Viajes debe crearse un crédito restringido a su origen.
    if (!unidades.has("escuela")) {
      return "No se puede crear un crédito general con fondos de Tienda o Viajes. Imputá a una obligación de la misma unidad.";
    }
    return null;
  }
  if (!unidades.has(requerida)) {
    return `La transferencia ingresó en una cuenta de ${[...unidades].map((u) => MP_UNIDAD_LABEL[u]).join("/")} y no corresponde a ${MP_UNIDAD_LABEL[requerida]}. Revisá la cuenta receptora.`;
  }
  return null;
}
