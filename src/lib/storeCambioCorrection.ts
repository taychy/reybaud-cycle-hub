export const correctionFields = [
  "producto_id", "variante_origen", "producto_reemplazo_id", "variante_destino",
  "recepcion_estado", "recepcion_fecha", "comentario", "motivo_admin",
] as const;
export type CorrectionField = typeof correctionFields[number];
export type CorrectionData = Partial<Record<CorrectionField, unknown>>;

export const correctionLabels: Record<CorrectionField, string> = {
  producto_id: "Producto original declarado", variante_origen: "Variante original declarada",
  producto_reemplazo_id: "Producto reemplazo declarado", variante_destino: "Variante reemplazo declarada",
  recepcion_estado: "Recepción declarada", recepcion_fecha: "Fecha declarada de recepción",
  comentario: "Comentario", motivo_admin: "Descripción administrativa",
};

export function correctionBaseline(c: Record<string, any>): CorrectionData {
  return {
    producto_id: c.producto_id, variante_origen: c.variante_origen || {},
    producto_reemplazo_id: c.producto_reemplazo_id || c.producto_id,
    variante_destino: c.variante_destino || {},
    recepcion_estado: c.recibido_en ? "recibida" : "pendiente",
    recepcion_fecha: c.recibido_en || null, comentario: c.comentario || "",
    motivo_admin: c.motivo_admin || "", ...(c.correccion_administrativa || {}),
  };
}

export function correctionChanges(before: CorrectionData, after: CorrectionData): CorrectionData {
  return Object.fromEntries(correctionFields.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => [k, after[k]]));
}

export function correctionStage(c: Record<string, any>) {
  if (["entregado", "cancelado", "rechazado"].includes(c.estado)) return "Cerrado: solo datos administrativos. No reabre ni revierte entregas.";
  if (c.stock_devuelto_at || c.stock_descontado_at || c.recibido_en || c.preparado_at || c.reemplazo_entregado_at) return "Con operación física: identidades y movimientos históricos protegidos.";
  return "Pendiente: la corrección documenta datos; la recepción y preparación se confirman por separado.";
}

export function validateCorrection(before: CorrectionData, after: CorrectionData, reason: string, confirmed: boolean): string | null {
  if (!Object.keys(correctionChanges(before, after)).length) return "No hay diferencias para registrar.";
  if (!reason.trim()) return "Indicá el motivo de la corrección.";
  if (!confirmed) return "Confirmá explícitamente la corrección administrativa.";
  if (after.recepcion_estado === "pendiente" && after.recepcion_fecha) return "Una recepción declarada pendiente no puede tener fecha.";
  if (after.recepcion_estado === "recibida" && !after.recepcion_fecha) return "Indicá la fecha de recepción declarada.";
  return null;
}