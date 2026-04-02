/**
 * Unified event price display helper.
 *
 * Source of truth: metadata.pricing_mode  ("con_valor" | "gratuito" | "no_mostrar")
 * Fallback for legacy events that don't have pricing_mode set:
 *   - price > 0  → "con_valor"
 *   - price === 0 → "gratuito"
 *   - price null  → "no_mostrar"
 */

export type PricingMode = "con_valor" | "gratuito" | "no_mostrar";

export interface EventPriceDisplay {
  mode: PricingMode;
  /** Only meaningful when mode === "con_valor" */
  price: number | null;
  currency: string;
}

export function getEventPriceDisplay(event: {
  price: number | null;
  currency?: string;
  metadata?: Record<string, any> | null;
}): EventPriceDisplay {
  const meta = event.metadata as Record<string, any> | null;
  const currency = event.currency || meta?.currency || "ARS";

  // Explicit pricing_mode is the source of truth
  if (meta?.pricing_mode) {
    const pm = meta.pricing_mode as PricingMode;
    return {
      mode: pm,
      price: pm === "con_valor" ? event.price : null,
      currency,
    };
  }

  // Legacy fallback: infer from price value
  if (event.price != null && event.price > 0) {
    return { mode: "con_valor", price: event.price, currency };
  }
  if (event.price === 0) {
    return { mode: "gratuito", price: null, currency };
  }
  // price is null/undefined → treat as hidden
  return { mode: "no_mostrar", price: null, currency };
}
