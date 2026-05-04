export type PaymentMethodKey =
  | "efectivo"
  | "transferencia"
  | "mercadopago"
  | "mp_externo"
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
  { key: "mercadopago", label: "MercadoPago (automático)", shortLabel: "MP auto" },
  { key: "mp_externo", label: "MercadoPago (externo)", shortLabel: "MP externo" },
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
  if (lower === "mp_externo") return "mp_externo";
  if (lower === "tarjeta" || lower === "card" || lower === "tarjeta_externa") return "tarjeta";
  if (lower === "externo" || lower === "plataforma_externa" || lower === "otro" || lower === "manual") return "plataforma_externa";
  return "efectivo";
}

/** Get display label for a raw DB value */
export function getPaymentMethodLabel(raw: string | null | undefined): string {
  const key = normalizePaymentMethod(raw);
  return methodMap.get(key)?.label ?? raw ?? "Sin definir";
}

// --- Smart inference for admin display ---

/** Values that are MP gateway responses, NOT payment methods */
const MP_GATEWAY_STATUSES = new Set(["approved", "400", "cancelled", "rejected", "pending", "in_process"]);

/** Values that are internal states, NOT payment methods */
const INTERNAL_STATUSES = new Set(["conciliado", "manual", "pendiente_verificacion"]);

export interface ResolvedPayment {
  method: string;       // Human-readable payment method
  methodKey: PaymentMethodKey | null;  // For filtering
  origin: string;       // How the record was created
}

/**
 * Infer the real payment method and registration origin from subscription data.
 * This avoids showing gateway statuses or internal states as payment methods.
 */
export function resolvePaymentDisplay(sub: {
  mp_payment_id?: string | null;
  mp_status?: string | null;
  estado?: string | null;
}): ResolvedPayment {
  const mpStatus = sub.mp_status?.toLowerCase().trim() || "";
  const hasMpId = !!sub.mp_payment_id;

  // --- Resolve METHOD ---
  let method = "Sin definir";
  let methodKey: PaymentMethodKey | null = null;

  if (hasMpId || MP_GATEWAY_STATUSES.has(mpStatus)) {
    // Came through Mercado Pago gateway
    method = "Mercado Pago";
    methodKey = "mercadopago";
  } else if (mpStatus === "efectivo" || mpStatus === "cash") {
    method = "Efectivo";
    methodKey = "efectivo";
  } else if (mpStatus === "transferencia") {
    method = "Transferencia";
    methodKey = "transferencia";
  } else if (mpStatus === "tarjeta" || mpStatus === "card") {
    method = "Tarjeta";
    methodKey = "tarjeta";
  } else if (mpStatus === "mercadopago" || mpStatus === "mp") {
    method = "Mercado Pago";
    methodKey = "mercadopago";
  } else if (mpStatus === "externo" || mpStatus === "plataforma_externa" || mpStatus === "otro") {
    method = "Otro";
    methodKey = "plataforma_externa";
  } else if (mpStatus === "manual") {
    // "manual" is an origin, not a method – default to Efectivo
    method = "Efectivo";
    methodKey = "efectivo";
  } else if (mpStatus === "conciliado" || mpStatus === "pendiente_verificacion") {
    // Internal states – can't determine method
    method = "Sin definir";
    methodKey = null;
  } else if (mpStatus && !INTERNAL_STATUSES.has(mpStatus) && !MP_GATEWAY_STATUSES.has(mpStatus)) {
    // Unknown value – show as-is but flag
    method = mpStatus;
    methodKey = null;
  }

  // --- Resolve ORIGIN ---
  let origin = "—";

  if (hasMpId || MP_GATEWAY_STATUSES.has(mpStatus)) {
    origin = "Automático";
  } else if (sub.estado === "pendiente_verificacion" || mpStatus === "pendiente_verificacion") {
    origin = "Informado por alumno";
  } else if (mpStatus === "manual" || mpStatus === "conciliado") {
    origin = "Cargado por admin";
  } else if (mpStatus && !MP_GATEWAY_STATUSES.has(mpStatus) && !INTERNAL_STATUSES.has(mpStatus)) {
    // Has an explicit method value set (efectivo, transferencia, etc.)
    // If estado is activa/conciliado, likely admin-recorded
    if (sub.estado === "activa" || sub.estado === "conciliado") {
      origin = "Cargado por admin";
    }
  }

  return { method, methodKey, origin };
}
