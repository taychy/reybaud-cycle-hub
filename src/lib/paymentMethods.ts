export type PaymentMethodKey =
  | "efectivo"
  | "transferencia"
  | "mercadopago"
  | "tarjeta"
  | "plataforma_externa";

export interface PaymentMethodDef {
  key: PaymentMethodKey;
  label: string;
  shortLabel: string;
}

export const PAYMENT_METHODS: PaymentMethodDef[] = [
  { key: "efectivo", label: "Efectivo", shortLabel: "Efectivo" },
  { key: "transferencia", label: "Transferencia bancaria", shortLabel: "Transferencia" },
  { key: "mercadopago", label: "MercadoPago", shortLabel: "MP" },
  { key: "tarjeta", label: "Tarjeta de crédito/débito", shortLabel: "Tarjeta" },
  { key: "plataforma_externa", label: "Plataforma de pago externa", shortLabel: "Externo" },
];

const methodMap = new Map(PAYMENT_METHODS.map((m) => [m.key, m]));

/** Normalise legacy DB values ("cash", "manual", "externo", "otro") → canonical key */
export function normalizePaymentMethod(raw: string | null | undefined): PaymentMethodKey {
  if (!raw) return "efectivo";
  const lower = raw.toLowerCase().trim();
  if (lower === "cash" || lower === "efectivo") return "efectivo";
  if (lower === "transferencia") return "transferencia";
  if (lower === "mercadopago" || lower === "mp") return "mercadopago";
  if (lower === "tarjeta" || lower === "card") return "tarjeta";
  if (lower === "externo" || lower === "plataforma_externa" || lower === "otro" || lower === "manual") return "plataforma_externa";
  return "efectivo";
}

/** Get display label for a raw DB value */
export function getPaymentMethodLabel(raw: string | null | undefined): string {
  const key = normalizePaymentMethod(raw);
  return methodMap.get(key)?.label ?? raw ?? "Sin definir";
}
