/**
 * Lenguaje compartido de `store_cambios` entre Admin y Depósito.
 * Ambas vistas leen la misma tabla; acá viven las etiquetas y los buckets
 * para que un mismo estado se llame igual en las dos pantallas.
 */

export const ESTADO_CAMBIO_LABEL: Record<string, string> = {
  solicitado: "Solicitado",
  aprobado: "Aprobado · a recibir",
  en_deposito: "En depósito",
  listo_retiro: "Listo para retirar",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  devolucion_solicitada: "Devolución solicitada",
};

export const ESTADO_CAMBIO_CLASS: Record<string, string> = {
  solicitado: "bg-muted text-muted-foreground",
  aprobado: "bg-cyan-500/20 text-cyan-400",
  en_deposito: "bg-primary/20 text-primary",
  listo_retiro: "bg-green-500/20 text-green-400",
  entregado: "bg-green-500/30 text-green-300",
  rechazado: "bg-destructive/20 text-destructive",
  cancelado: "bg-muted/40 text-muted-foreground",
  devolucion_solicitada: "bg-amber-500/20 text-amber-300",
};

export const estadoCambioLabel = (e?: string | null): string =>
  (e && ESTADO_CAMBIO_LABEL[e]) || e || "—";

export const estadoCambioClass = (e?: string | null): string =>
  (e && ESTADO_CAMBIO_CLASS[e]) || "bg-muted text-muted-foreground";

export const ESTADOS_PENDIENTE_ADMIN = ["solicitado", "devolucion_solicitada"];
export const ESTADOS_EN_CURSO = ["aprobado", "en_deposito", "listo_retiro"];
export const ESTADOS_CERRADOS = ["entregado", "rechazado", "cancelado"];
