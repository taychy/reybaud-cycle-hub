import { describe, it, expect } from "vitest";
import { addMonthsAnchored, computeIntlInstallmentDates, buildIntlPlanTemplate } from "./internationalPaymentPlan";
import { calculatePlan } from "./paymentPlanCalculator";

describe("internationalPaymentPlan", () => {
  it("Rimini: lanzamiento 2026-10-01, inicio 2027-06-10 => 7 cuotas", () => {
    const r = computeIntlInstallmentDates({ fechaLanzamiento: "2026-10-01", fechaInicio: "2027-06-10" });
    expect(r.ok && r.dueDates).toEqual([
      "2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10", "2027-03-10", "2027-04-10", "2027-05-10",
    ]);
  });

  it("última cuota exactamente un mes antes y clamp a fin de mes", () => {
    expect(addMonthsAnchored("2027-03-31", -1)).toBe("2027-02-28");
    const r = computeIntlInstallmentDates({ fechaLanzamiento: "2026-11-15", fechaInicio: "2027-03-31" });
    expect(r.ok && r.dueDates).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("sin ventana suficiente devuelve error", () => {
    const r = computeIntlInstallmentDates({ fechaLanzamiento: "2027-05-20", fechaInicio: "2027-06-10" });
    expect(r.ok).toBe(false);
    expect(computeIntlInstallmentDates({ fechaLanzamiento: null, fechaInicio: "2027-06-10" }).ok).toBe(false);
  });

  it("plan suma exacto: 30% seña + 70% en cuotas iguales, redondeo en la última", () => {
    const t = buildIntlPlanTemplate({ fechaLanzamiento: "2026-10-01", fechaInicio: "2027-06-10" });
    if (!t.ok) throw new Error((t as any).error);
    expect(t.template.last_installment_absorbs_rounding).toBe(true);
    expect(t.template.regla_reserva_tardia).toBe("cobrar_al_reservar");
    const res = calculatePlan({ template: t.template, precioFinal: 2284, fechaReserva: "2026-10-01" });
    expect(res.ok).toBe(true);
    expect(res.sena_monto).toBe(685.2);
    expect(res.installments).toHaveLength(8);
    // reserva tardía: cuotas vencidas se cobran en la seña
    const late = calculatePlan({ template: t.template, precioFinal: 2284, fechaReserva: "2027-01-15" });
    expect(late.installments.filter((i) => i.installment_type === "cuota")).toHaveLength(4);
    expect(late.ok).toBe(true);
  });
});
