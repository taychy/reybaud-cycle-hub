/**
 * Reglas únicas para el cobro en efectivo de pedidos de tienda.
 *
 * Fuente de verdad: `store_orders`. Un pedido está pagado sólo cuando tiene
 * `pagado_at`. Confirmar efectivo escribe una sola vez ese campo (idempotente)
 * y NO genera ningún movimiento de Mercado Pago.
 *
 * El pago es independiente del estado operativo: un pedido puede estar
 * `preparando` o `en_camioneta` y seguir pendiente de cobro en efectivo.
 */

import { isLegacyInitialStatus } from "@/lib/storeOrderStatus";

export const CASH_PENDING_STATUS = "pendiente_pago_efectivo";

export interface StoreOrderCashLike {
  id?: string;
  status: string;
  metodo_pago?: string | null;
  pagado_at?: string | null;
  total?: number | string | null;
  currency?: string | null;
  notes?: string | null;
}

/** Un pedido está pagado únicamente si tiene fecha real de cobro. */
export function isOrderPaid(o: StoreOrderCashLike): boolean {
  return !!o.pagado_at;
}

/** Pedido a cobrar en efectivo y todavía sin cobrar (sin importar la logística). */
export function isCashPending(o: StoreOrderCashLike): boolean {
  return (o.metodo_pago || "") === "efectivo" && !isOrderPaid(o) && o.status !== "cancelado";
}

export type CashConfirmBlockReason = "ya_pagado" | "cancelado" | "no_es_efectivo";

/** Devuelve null si se puede cobrar; si no, el motivo del bloqueo. */
export function cashConfirmBlockReason(o: StoreOrderCashLike): CashConfirmBlockReason | null {
  if (isOrderPaid(o)) return "ya_pagado";
  if (o.status === "cancelado") return "cancelado";
  if ((o.metodo_pago || "") !== "efectivo") return "no_es_efectivo";
  return null;
}

export function canConfirmCashPayment(o: StoreOrderCashLike): boolean {
  return cashConfirmBlockReason(o) === null;
}

export const CASH_BLOCK_MESSAGE: Record<CashConfirmBlockReason, string> = {
  ya_pagado: "Este pedido ya figura cobrado. No se puede volver a cobrar.",
  cancelado: "El pedido está anulado: no corresponde registrar el cobro.",
  no_es_efectivo: "Este pedido no quedó marcado para pagar en efectivo.",
};

export interface CashPaymentPatch {
  status?: string;
  pagado_at: string;
  metodo_pago: "efectivo";
  notes: string | null;
}

/**
 * Parche a aplicar sobre `store_orders` al confirmar el efectivo.
 * Devuelve null cuando el pedido no está en condiciones (idempotencia).
 * Sólo mueve el status si el pedido todavía está en un estado legacy inicial:
 * nunca pisa `preparando`, `en_camioneta`, `enviado`, etc.
 */
export function buildCashPaymentPatch(
  o: StoreOrderCashLike,
  opts: { actor: string; nowIso?: string; monto?: number },
): CashPaymentPatch | null {
  if (!canConfirmCashPayment(o)) return null;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const monto = opts.monto ?? Number(o.total || 0);
  const traza = `[${new Date(nowIso).toLocaleString("es-AR")}] Pago en efectivo registrado por ${opts.actor} · ${monto}`;
  const patch: CashPaymentPatch = {
    pagado_at: nowIso,
    metodo_pago: "efectivo",
    notes: [o.notes, traza].filter(Boolean).join("\n") || null,
  };
  if (isLegacyInitialStatus(o.status)) patch.status = "pagado";
  return patch;
}
