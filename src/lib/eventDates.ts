/**
 * Fechas "a confirmar": si `metadata.dates_tbd === true` la UI oculta la fecha
 * cargada (que sigue siendo obligatoria en la base) y muestra este texto.
 * Opt-in por evento: los demás eventos no cambian.
 */
export const DATES_TBD_LABEL = "Fechas a confirmar";

export function isEventDateTbd(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).dates_tbd === true;
}
