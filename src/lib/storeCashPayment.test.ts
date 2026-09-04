import { describe, it, expect } from "vitest";
import {
  buildCashPaymentPatch,
  canConfirmCashPayment,
  cashConfirmBlockReason,
  isCashPending,
  isOrderPaid,
} from "./storeCashPayment";

const base = { id: "o1", status: "pendiente_pago_efectivo", metodo_pago: "efectivo", pagado_at: null, total: 1000, notes: null };

describe("storeCashPayment", () => {
  it("pedido nuevo en efectivo queda pendiente y sin pago", () => {
    expect(isCashPending(base)).toBe(true);
    expect(isOrderPaid(base)).toBe(false);
    expect(canConfirmCashPayment(base)).toBe(true);
  });

  it("confirmar efectivo genera el pago una sola vez", () => {
    const patch = buildCashPaymentPatch(base, { actor: "depósito", nowIso: "2026-09-04T12:00:00.000Z" });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe("pagado");
    expect(patch!.metodo_pago).toBe("efectivo");
    expect(patch!.pagado_at).toBe("2026-09-04T12:00:00.000Z");
  });

  it("reintentar sobre un pedido ya cobrado no genera otro pago", () => {
    const pagado = { ...base, status: "pagado", pagado_at: "2026-09-04T12:00:00.000Z" };
    expect(buildCashPaymentPatch(pagado, { actor: "depósito" })).toBeNull();
    expect(cashConfirmBlockReason(pagado)).toBe("ya_pagado");
  });

  it("pedido ya pagado por Mercado Pago no se puede pasar a efectivo", () => {
    const mp = { ...base, status: "pagado", metodo_pago: "mp", pagado_at: "2026-09-01T10:00:00.000Z" };
    expect(canConfirmCashPayment(mp)).toBe(false);
    expect(cashConfirmBlockReason(mp)).toBe("ya_pagado");
  });

  it("pedido cancelado antes de cobrar no genera pago", () => {
    const cancelado = { ...base, status: "cancelado" };
    expect(buildCashPaymentPatch(cancelado, { actor: "admin" })).toBeNull();
    expect(cashConfirmBlockReason(cancelado)).toBe("cancelado");
  });

  it("pedido de Mercado Pago pendiente no se cobra como efectivo", () => {
    const mpPend = { ...base, status: "pendiente_pago", metodo_pago: "mp" };
    expect(cashConfirmBlockReason(mpPend)).toBe("no_es_efectivo");
  });
});
