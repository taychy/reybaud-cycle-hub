import { describe, expect, it } from "vitest";
import { isFullPaymentAtBooking } from "./EventPaymentPlansPublic";
const plan = (regla: string, dates: string[]) => ({ regla_reserva_tardia: regla, installments: dates.map((f) => ({ fecha_vencimiento: f })) });
describe("isFullPaymentAtBooking", () => {
  it("is true when every installment expired and late bookings pay at booking", () => {
    expect(isFullPaymentAtBooking(plan("cobrar_al_reservar", ["2026-06-30", "2026-09-30"]), "2026-10-26")).toBe(true);
  });
  it("is false when an installment is still in the future", () => {
    expect(isFullPaymentAtBooking(plan("cobrar_al_reservar", ["2026-09-30", "2026-11-01"]), "2026-10-26")).toBe(false);
  });
  it("is false for other late-booking rules", () => {
    expect(isFullPaymentAtBooking(plan("reprogramar_a_hoy", ["2026-06-30"]), "2026-10-26")).toBe(false);
  });
});
