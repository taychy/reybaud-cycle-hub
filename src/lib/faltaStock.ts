/**
 * Sustitución por falta de stock.
 *
 * Cuando un pedido ya cobrado no se puede entregar porque no hay stock del
 * producto original, admin elige un reemplazo REAL (con stock > 0) y decide
 * qué pasa con la diferencia de plata. Todo se resuelve en la RPC
 * `resolver_falta_stock`; acá viven sólo los cálculos y etiquetas.
 */

export type ResolucionEconomica =
  | "sin_ajuste"
  | "cobrar_diferencia"
  | "absorbe_reybaud"
  | "saldo_a_favor"
  | "devolucion";

export const RESOLUCION_LABEL: Record<ResolucionEconomica, string> = {
  sin_ajuste: "Sin ajuste",
  cobrar_diferencia: "Cobrar diferencia",
  absorbe_reybaud: "Absorbe Reybaud",
  saldo_a_favor: "Saldo a favor",
  devolucion: "Devolución",
};

export interface DiferenciaCalculo {
  original: number;
  reemplazo: number;
  diferencia: number;
  /** Opciones económicas válidas para esa diferencia. */
  opciones: ResolucionEconomica[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Diferencia entre lo cobrado por el ítem original y el precio del reemplazo. */
export const calcularDiferencia = (
  precioCobradoUnitario: number,
  cantidad: number,
  precioReemplazoUnitario: number,
): DiferenciaCalculo => {
  const qty = Math.max(Number(cantidad) || 1, 1);
  const original = r2((Number(precioCobradoUnitario) || 0) * qty);
  const reemplazo = r2((Number(precioReemplazoUnitario) || 0) * qty);
  const diferencia = r2(reemplazo - original);
  const opciones: ResolucionEconomica[] =
    diferencia > 0.009
      ? ["cobrar_diferencia", "absorbe_reybaud"]
      : diferencia < -0.009
        ? ["saldo_a_favor", "devolucion"]
        : ["sin_ajuste"];
  return { original, reemplazo, diferencia, opciones };
};

export interface VariantSpec { name: string; options?: string[] }

/**
 * Misma clave que `_build_variant_key` en la base: "Talle:L|Color:Negro",
 * en el orden en que están declaradas las variantes del producto.
 */
export const buildVariantKey = (
  variants: VariantSpec[] | null | undefined,
  selection: Record<string, string>,
): string | null => {
  const entries = Object.entries(selection || {}).filter(([, v]) => !!v);
  if (entries.length === 0) return null;
  const specs = Array.isArray(variants) ? variants.filter((v) => v?.name) : [];
  if (specs.length === 0) {
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
  }
  const parts = specs
    .filter((s) => selection[s.name])
    .map((s) => `${s.name}:${selection[s.name]}`);
  return parts.length ? parts.join("|") : null;
};

export interface ProductoStockLike {
  variants?: VariantSpec[] | null;
  variant_stock?: Record<string, number> | null;
  stock?: number | null;
}

/** Claves de variante con stock real disponible (> 0). */
export const variantesDisponibles = (p: ProductoStockLike): { key: string; stock: number }[] =>
  Object.entries(p?.variant_stock || {})
    .map(([key, stock]) => ({ key, stock: Number(stock) || 0 }))
    .filter((v) => v.stock > 0)
    .sort((a, b) => a.key.localeCompare(b.key));

/** Stock real de la combinación elegida (o del producto sin variantes). */
export const stockDeSeleccion = (
  p: ProductoStockLike,
  selection: Record<string, string>,
): number => {
  const key = buildVariantKey(p?.variants, selection);
  if (key == null) return Number(p?.stock ?? 0) || 0;
  return Number((p?.variant_stock || {})[key] ?? 0) || 0;
};

export const esSustitucionFaltaStock = (c: { tipo?: string | null } | null | undefined): boolean =>
  (c?.tipo || "") === "sustitucion_falta_stock";

/** Texto legible de la variante para mostrar en pantalla. */
export const varianteTexto = (v: Record<string, any> | null | undefined): string =>
  Object.entries(v || {})
    .map(([k, val]) => `${k}: ${val}`)
    .join(" · ");
