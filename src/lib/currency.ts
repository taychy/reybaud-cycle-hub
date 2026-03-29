/**
 * Shared multi-currency price formatter.
 * Supports ARS, USD and EUR.
 */

const CURRENCY_MAP: Record<string, { currency: string; symbol: string }> = {
  ARS: { currency: "ARS", symbol: "$" },
  USD: { currency: "USD", symbol: "US$" },
  EUR: { currency: "EUR", symbol: "€" },
};

export const formatPrice = (precio: number, moneda: string = "ARS"): string => {
  const config = CURRENCY_MAP[moneda] || CURRENCY_MAP.ARS;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(precio);
};

export const MONEDAS = [
  { value: "ARS", label: "$ ARS" },
  { value: "USD", label: "US$ USD" },
  { value: "EUR", label: "€ EUR" },
] as const;
