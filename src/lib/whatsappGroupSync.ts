/**
 * Sincronización manual de grupos de WhatsApp.
 *
 * El cambio de `alumnos.grupo` lo hace la RPC `registrar_cambio_grupo_alumno`,
 * que además crea/actualiza/cancela UNA sola tarea de Admin por alumno.
 * Estos helpers son la lógica pura equivalente (para UI y tests): nunca envían
 * mensajes ni tocan grupos reales de WhatsApp.
 */

export type WhatsappSyncAccion = "creada" | "actualizada" | "cancelada" | "sin_cambio";

export interface WhatsappSyncState {
  /** Último grupo confirmado en WhatsApp (null si nunca se confirmó). */
  confirmado: string | null;
  /** Grupo actual en la ficha. */
  actual: string | null;
}

/**
 * Decide qué pasa con la tarea al cambiar de grupo.
 * `origenTareaAbierta` es el `grupo_origen` de la tarea pendiente, si existe.
 */
export function reconcileGroupChange(params: {
  grupoPrevio: string | null;
  grupoNuevo: string | null;
  confirmado: string | null;
  origenTareaAbierta?: string | null;
}): { accion: WhatsappSyncAccion; grupoOrigen: string | null } {
  const { grupoPrevio, grupoNuevo, confirmado } = params;
  const tieneTarea = params.origenTareaAbierta !== undefined && params.origenTareaAbierta !== null;
  const grupoOrigen = tieneTarea
    ? (params.origenTareaAbierta as string)
    : (confirmado ?? grupoPrevio);

  if (grupoNuevo === grupoOrigen) {
    return { accion: tieneTarea ? "cancelada" : "sin_cambio", grupoOrigen };
  }
  return { accion: tieneTarea ? "actualizada" : "creada", grupoOrigen };
}

/** Etiqueta compacta de estado para la ficha del alumno. */
export function whatsappSyncLabel(state: WhatsappSyncState): string {
  const { confirmado, actual } = state;
  if (confirmado === null || confirmado === actual) return "WhatsApp sincronizado ✓";
  return `WhatsApp pendiente · ${confirmado ?? "sin grupo"} → ${actual ?? "sin grupo"}`;
}

export function isWhatsappSynced(state: WhatsappSyncState): boolean {
  return state.confirmado === null || state.confirmado === state.actual;
}
