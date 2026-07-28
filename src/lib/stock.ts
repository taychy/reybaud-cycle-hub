/**
 * Fuente única de verdad para el stock de un producto de tienda.
 *
 * `store_products.stock` es el total agregado, pero cuando el producto tiene
 * variantes el dato real vive en `store_products.variant_stock` (es lo que
 * actualizan depósito, ingresos de mercadería y ventas). Si alguien edita el
 * total a mano, los dos números se desincronizan.
 *
 * Usar siempre `effectiveStock()` para mostrar stock en pantalla.
 */

export interface StockLike {
  stock?: number | null;
  variant_stock?: Record<string, number> | null | any;
}

export const variantStockSum = (variant_stock: any): number | null => {
  if (!variant_stock || typeof variant_stock !== "object") return null;
  const values = Object.values(variant_stock as Record<string, any>);
  if (values.length === 0) return null;
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
};

export const effectiveStock = (p: StockLike): number => {
  const sum = variantStockSum(p?.variant_stock);
  if (sum !== null) return sum;
  return Number(p?.stock ?? 0) || 0;
};

/** true cuando el total guardado difiere del stock por variantes. */
export const hasStockMismatch = (p: StockLike): boolean => {
  const sum = variantStockSum(p?.variant_stock);
  if (sum === null) return false;
  return sum !== (Number(p?.stock ?? 0) || 0);
};
