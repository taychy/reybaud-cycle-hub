// Resumen financiero de una reserva con devoluciones vinculadas (tabla devoluciones).
// No modifica datos: el histórico bruto se preserva; solo cambia la lectura en UI.

export type RefundRow = { reservation_payment_id: string | null; monto: number };
export type PaymentLite = { id: string; status: string; amount: number; equivalent_amount_event_currency?: number | null };

export function isReservaCancelada(status?: string | null) {
  return ["cancelada", "cancelado", "cancelled"].includes(String(status ?? "").toLowerCase());
}

/** Reservas sin deuda exigible: canceladas o rechazadas (el saldo bruto queda solo como histórico). */
export function isReservaSinDeuda(status?: string | null) {
  return isReservaCancelada(status) || ["rechazada", "rechazado", "rejected"].includes(String(status ?? "").toLowerCase());
}

/** Deuda exigible de una reserva para listados, filtros, orden y comunicaciones. */
export function deudaExigibleReserva(r: { reservation_status?: string | null; balance_due?: number | null; amount_total?: number | null; amount_paid?: number | null }) {
  if (isReservaSinDeuda(r.reservation_status)) return 0;
  const raw = r.balance_due ?? ((r.amount_total || 0) - (r.amount_paid || 0));
  return Math.max(0, Number(raw) || 0);
}

export function refundByPayment(refunds: RefundRow[]) {
  const map: Record<string, number> = {};
  for (const r of refunds) {
    if (!r.reservation_payment_id) continue;
    map[r.reservation_payment_id] = (map[r.reservation_payment_id] ?? 0) + Number(r.monto || 0);
  }
  return map;
}

export function paymentRefundState(p: PaymentLite, refunded: number): "devuelto" | "parcial" | null {
  if (!(refunded > 0)) return null;
  return refunded + 0.01 >= Number(p.amount || 0) ? "devuelto" : "parcial";
}

export function reservationNet(payments: PaymentLite[], refunds: RefundRow[], opts: { status?: string | null; balanceDue: number }) {
  const recibidos = payments
    .filter((p) => p.status === "validado")
    .reduce((s, p) => s + Number(p.equivalent_amount_event_currency ?? p.amount ?? 0), 0);
  const devoluciones = refunds.reduce((s, r) => s + Number(r.monto || 0), 0);
  return {
    recibidos,
    devoluciones,
    neto: recibidos - devoluciones,
    deudaExigible: isReservaCancelada(opts.status) ? 0 : Math.max(0, opts.balanceDue),
  };
}
