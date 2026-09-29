/** Shared multi-currency price formatter. */
const CURRENCY_MAP: Record<string, { currency: string; symbol: string }> = {
  ARS: { currency: "ARS", symbol: "$" },
  USD: { currency: "USD", symbol: "US$" },
  EUR: { currency: "EUR", symbol: "€" },
  BRL: { currency: "BRL", symbol: "R$" },
};

export const formatPrice = (precio: number, moneda: string = "ARS"): string => {
  const code = String(moneda || "ARS").toUpperCase();
  const config = CURRENCY_MAP[code] || CURRENCY_MAP.ARS;
  const rounded = Math.round(Number(precio) * 100) / 100;
  const hasCents = Math.abs(rounded - Math.trunc(rounded)) > 0.000001;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(rounded);
};

export const MONEDAS = [
  { value: "ARS", label: "$ ARS" },
  { value: "USD", label: "US$ USD" },
  { value: "EUR", label: "€ EUR" },
  { value: "BRL", label: "R$ BRL" },
] as const;
