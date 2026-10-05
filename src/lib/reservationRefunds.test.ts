import { describe, it, expect } from "vitest";
import { reservationNet, paymentRefundState, refundByPayment } from "./reservationRefunds";

const pays = [
  { id: "a", status: "validado", amount: 250000 },
  { id: "b", status: "validado", amount: 100000 },
  { id: "c", status: "anulado", amount: 999 },
];

describe("reservationRefunds", () => {
  it("neto = recibidos - devoluciones", () => {
    const r = reservationNet(pays, [{ reservation_payment_id: "a", monto: 250000 }], { status: "confirmada", balanceDue: 50000 });
    expect(r).toEqual({ recibidos: 350000, devoluciones: 250000, neto: 100000, deudaExigible: 50000 });
  });
  it("cancelada => deuda exigible 0", () => {
    expect(reservationNet(pays, [], { status: "cancelada", balanceDue: 800000 }).deudaExigible).toBe(0);
  });
  it("estado de pago devuelto / parcial", () => {
    const m = refundByPayment([{ reservation_payment_id: "a", monto: 100 }, { reservation_payment_id: "a", monto: 50 }]);
    expect(paymentRefundState(pays[0], m.a)).toBe("parcial");
    expect(paymentRefundState(pays[0], 250000)).toBe("devuelto");
    expect(paymentRefundState(pays[0], 0)).toBeNull();
  });
});
