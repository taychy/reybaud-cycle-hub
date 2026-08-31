/**
 * Prendas de prueba (`store_cambios.tipo = 'prueba'`).
 *
 * Una prueba NO es una venta: la unidad sale del stock físico, queda
 * identificada como "en prueba" y se cierra de tres formas posibles:
 * devuelta, convertida en venta o usada como reemplazo de un cambio real.
 */

export type TipoRegistroCambio = "cambio" | "devolucion" | "prueba";

export type PruebaResultado =
  | "pendiente"
  | "devuelta"
  | "convertida_en_venta"
  | "convertida_en_cambio";

export interface PruebaLike {
  tipo?: string | null;
  prueba_resultado?: string | null;
  prueba_salida_at?: string | null;
  created_at?: string | null;
}

export const TIPO_LABEL: Record<TipoRegistroCambio, string> = {
  cambio: "Cambio",
  devolucion: "Devolución",
  prueba: "Prenda de prueba",
};

export const PRUEBA_RESULTADO_LABEL: Record<PruebaResultado, string> = {
  pendiente: "En prueba",
  devuelta: "Devuelta",
  convertida_en_venta: "Se la quedó (vendida)",
  convertida_en_cambio: "Usada como cambio",
};

export const PRUEBA_RESULTADO_CLASS: Record<PruebaResultado, string> = {
  pendiente: "bg-amber-500/20 text-amber-300",
  devuelta: "bg-muted text-muted-foreground",
  convertida_en_venta: "bg-emerald-500/20 text-emerald-400",
  convertida_en_cambio: "bg-cyan-500/20 text-cyan-400",
};

export const tipoRegistro = (r: PruebaLike | null | undefined): TipoRegistroCambio => {
  const t = r?.tipo;
  if (t === "prueba" || t === "devolucion") return t;
  return "cambio";
};

export const esPrueba = (r: PruebaLike | null | undefined): boolean => tipoRegistro(r) === "prueba";

/** Una prueba sigue afuera: la prenda está con el alumno y falta resolverla. */
export const esPruebaActiva = (r: PruebaLike | null | undefined): boolean =>
  esPrueba(r) && (r?.prueba_resultado ?? "pendiente") === "pendiente";

/** Prueba ya resuelta (devuelta, vendida o usada como cambio). */
export const esPruebaCerrada = (r: PruebaLike | null | undefined): boolean =>
  esPrueba(r) && !esPruebaActiva(r);

export const resultadoLabel = (r: PruebaLike | null | undefined): string => {
  const v = (r?.prueba_resultado || "pendiente") as PruebaResultado;
  return PRUEBA_RESULTADO_LABEL[v] ?? v;
};

export const resultadoClass = (r: PruebaLike | null | undefined): string => {
  const v = (r?.prueba_resultado || "pendiente") as PruebaResultado;
  return PRUEBA_RESULTADO_CLASS[v] ?? "bg-muted text-muted-foreground";
};

/** Días que la prenda lleva fuera del depósito. */
export const diasAfuera = (r: PruebaLike | null | undefined, now: Date = new Date()): number => {
  const iso = r?.prueba_salida_at || r?.created_at;
  if (!iso) return 0;
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

/** Semáforo de antigüedad para pruebas que siguen afuera. */
export const alertaAntiguedad = (dias: number): "ok" | "atencion" | "critico" =>
  dias > 14 ? "critico" : dias > 7 ? "atencion" : "ok";

/** Separa la colección de `store_cambios` en universos que no se mezclan. */
export const separarPorTipo = <T extends PruebaLike>(rows: T[]) => ({
  cambios: rows.filter((r) => tipoRegistro(r) === "cambio"),
  devoluciones: rows.filter((r) => tipoRegistro(r) === "devolucion"),
  pruebas: rows.filter((r) => tipoRegistro(r) === "prueba"),
  pruebasActivas: rows.filter((r) => esPruebaActiva(r)),
});
