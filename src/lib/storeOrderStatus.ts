/**
 * Separación entre PAGO y ESTADO OPERATIVO de un pedido de tienda.
 *
 * - `pagado_at` es la única fuente de verdad del pago.
 * - `metodo_pago` define si el cobro es en efectivo o por Mercado Pago.
 * - `status` describe la logística. Los status legacy de inicio
 *   (`pendiente`, `pendiente_pago`, `pendiente_pago_efectivo`, `pagado`)
 *   operativamente significan "Nuevo / por preparar".
 */

export const LEGACY_INITIAL_STATUSES = [
  "pendiente",
  "pendiente_pago",
  "pendiente_pago_efectivo",
  "pagado",
] as const;

export const isLegacyInitialStatus = (status?: string | null): boolean =>
  LEGACY_INITIAL_STATUSES.includes((status || "") as any);

export interface OrderPaymentLike {
  status?: string | null;
  metodo_pago?: string | null;
  pagado_at?: string | null;
}

export type PaymentState = "pagado" | "efectivo_pendiente" | "pendiente";

export const getPaymentState = (o: OrderPaymentLike): PaymentState => {
  if (o.pagado_at) return "pagado";
  if ((o.metodo_pago || "") === "efectivo") return "efectivo_pendiente";
  return "pendiente";
};

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  pagado: "Pagado",
  efectivo_pendiente: "Efectivo pendiente",
  pendiente: "Pendiente",
};

export const paymentLabel = (o: OrderPaymentLike): string =>
  PAYMENT_LABEL[getPaymentState(o)];

export const paymentBadgeClass = (state: PaymentState): string => {
  switch (state) {
    case "pagado": return "bg-emerald-500/20 text-emerald-400";
    case "efectivo_pendiente": return "bg-amber-500/20 text-amber-400";
    default: return "bg-muted text-muted-foreground";
  }
};

/** Estados logísticos reales (lo que se puede elegir hacia adelante). */
export const OPERATIONAL_STATUSES = [
  "preparando",
  "en_camioneta",
  "enviado",
  "entregado",
] as const;

export const NUEVO_LABEL = "Nuevo · por preparar";

export const operationalLabel = (status?: string | null): string => {
  const s = status || "";
  if (isLegacyInitialStatus(s)) return NUEVO_LABEL;
  switch (s) {
    case "preparando": return "Preparando";
    case "en_camioneta": return "En camioneta";
    case "enviado": return "Enviado";
    case "entregado": return "Entregado";
    case "cancelado": return "Cancelado";
    case "listo_retiro": return "Listo para retirar";
    default: return s.replace(/_/g, " ");
  }
};

export const operationalBadgeClass = (status?: string | null): string => {
  const s = status || "";
  if (isLegacyInitialStatus(s)) return "bg-muted text-muted-foreground";
  switch (s) {
    case "preparando": return "bg-accent/20 text-accent";
    case "en_camioneta": return "bg-cyan-500/20 text-cyan-400";
    case "enviado": return "bg-primary/20 text-primary";
    case "entregado": return "bg-green-500/20 text-green-400";
    case "cancelado": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

/**
 * Opciones del selector logístico para un pedido concreto.
 * Si el pedido sigue en un status legacy inicial, se mantiene ese valor
 * como opción visible etiquetada "Nuevo / por preparar".
 */
export const operationalOptions = (
  currentStatus?: string | null,
): { value: string; label: string }[] => {
  const opts = OPERATIONAL_STATUSES.map((s) => ({ value: s, label: operationalLabel(s) }));
  const s = currentStatus || "";
  if (isLegacyInitialStatus(s)) return [{ value: s, label: NUEVO_LABEL }, ...opts];
  if (s === "cancelado") return [{ value: s, label: "Cancelado" }, ...opts];
  if (s && !OPERATIONAL_STATUSES.includes(s as any)) {
    return [{ value: s, label: operationalLabel(s) }, ...opts];
  }
  return opts;
};

/** Un pedido cancelado con mercadería todavía fuera del depósito. */
export const needsPhysicalReturn = (o: {
  status?: string | null;
  stock_restored_at?: string | null;
}): boolean => (o.status || "") === "cancelado" && !o.stock_restored_at;

// ─────────────────────────────────────────────────────────────
// Importes de línea (precios legacy en otra moneda)
// ─────────────────────────────────────────────────────────────

export interface LineLike {
  unit_price?: number | string | null;
  quantity?: number | string | null;
}

/**
 * Reparte el total del pedido entre sus líneas en proporción al subtotal
 * crudo de cada una. Evita mostrar precios base en otra moneda (USD legacy)
 * como si fueran de la moneda del pedido. No modifica datos persistidos.
 */
export const distributeOrderTotal = (lines: LineLike[], total: number): number[] => {
  const n = lines.length;
  if (n === 0) return [];
  const t = Number(total || 0);
  const raw = lines.map(
    (l) => Number(l.unit_price || 0) * Math.max(Number(l.quantity || 0), 0),
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(Math.round((t - acc) * 100) / 100);
      break;
    }
    const part = sum > 0 ? (raw[i] / sum) * t : t / n;
    const rounded = Math.round(part * 100) / 100;
    out.push(rounded);
    acc += rounded;
  }
  return out;
};

/** Precio unitario visual derivado del total repartido. */
export const displayUnitPrice = (lineTotal: number, quantity: number): number => {
  const q = Math.max(Number(quantity || 0), 1);
  return Math.round((lineTotal / q) * 100) / 100;
};
