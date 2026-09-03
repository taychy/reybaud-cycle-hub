/**
 * "Usar como cambio": la prenda de prueba se queda con el alumno y, a cambio,
 * el alumno devuelve una prenda que YA HABÍA COMPRADO en ese pedido.
 * Hay que elegir explícitamente cuál ítem del pedido vuelve: nunca se infiere
 * en silencio si hay más de uno.
 */

export interface OrderItemLike {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  variant_selection?: Record<string, unknown> | null;
  quantity?: number | null;
}

/**
 * Ítems que pueden devolverse: deben tener producto real y no pueden ser
 * la propia prenda de prueba (cuando la prueba ya generó su ítem de venta).
 */
export const itemsElegiblesParaCambio = (
  items: OrderItemLike[],
  pruebaOrderItemId?: string | null,
): OrderItemLike[] =>
  (items || []).filter((i) => !!i.product_id && i.id !== pruebaOrderItemId);

/** Preselección: sólo cuando hay exactamente un ítem elegible. */
export const preseleccionItemCambio = (
  items: OrderItemLike[],
  pruebaOrderItemId?: string | null,
): string => {
  const elegibles = itemsElegiblesParaCambio(items, pruebaOrderItemId);
  return elegibles.length === 1 ? elegibles[0].id : "";
};

/** Etiqueta legible del ítem para el selector. */
export const labelItemCambio = (i: OrderItemLike): string => {
  const variante = Object.entries(i.variant_selection || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return [i.product_name || "Producto", variante].filter(Boolean).join(" — ");
};
