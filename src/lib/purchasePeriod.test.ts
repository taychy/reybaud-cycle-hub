import { describe, it, expect } from "vitest";
import { resolvePurchasePeriod, monthLabel, calendarMonthPeriod } from "@/lib/subscriptionPeriod";

// Caso Laura Palermo: pago real el 31/08/2026 destinado a septiembre.
const AUG_31 = new Date(2026, 7, 31, 21, 48);
const SEP_10 = new Date(2026, 8, 10, 10, 0);
const DEC_31 = new Date(2026, 11, 31, 18, 0);

describe("resolvePurchasePeriod", () => {
  it("un pago el último día del mes compra el MES SIGUIENTE", () => {
    const p = resolvePurchasePeriod({ today: AUG_31 });
    expect(p.fechaInicio).toBe("2026-09-01");
    expect(p.fechaFin).toBe("2026-09-30");
    expect(p.reason).toBe("late_month");
  });

  it("cruza el año correctamente", () => {
    const p = resolvePurchasePeriod({ today: DEC_31 });
    expect(p.fechaInicio).toBe("2027-01-01");
    expect(p.fechaFin).toBe("2027-01-31");
  });

  it("un pago a mitad de mes compra el mes en curso", () => {
    const p = resolvePurchasePeriod({ today: SEP_10 });
    expect(p).toMatchObject({ fechaInicio: "2026-09-01", fechaFin: "2026-09-30", reason: "current_month" });
  });

  it("si el mes en curso ya está cubierto, compra el siguiente", () => {
    const p = resolvePurchasePeriod({ today: SEP_10, coveredUntil: "2026-09-30" });
    expect(p).toMatchObject({ fechaInicio: "2026-10-01", fechaFin: "2026-10-31", reason: "covered_current_month" });
  });

  it("la renovación anticipada explícita gana sobre todo lo demás", () => {
    const p = resolvePurchasePeriod({
      today: SEP_10,
      earlyRenewalPeriod: { fechaInicio: "2026-10-01", fechaFin: "2026-10-31" },
    });
    expect(p.reason).toBe("early_renewal");
    expect(p.fechaInicio).toBe("2026-10-01");
  });

  it("ignora un contexto de renovación que apunta al mes en curso o al pasado", () => {
    const p = resolvePurchasePeriod({
      today: SEP_10,
      earlyRenewalPeriod: { fechaInicio: "2026-08-01", fechaFin: "2026-08-31" },
    });
    expect(p.reason).toBe("current_month");
    expect(p.fechaInicio).toBe("2026-09-01");
  });

  it("es idempotente: dos llamadas seguidas dan el mismo período", () => {
    expect(resolvePurchasePeriod({ today: AUG_31 })).toEqual(resolvePurchasePeriod({ today: AUG_31 }));
  });

  it("nunca devuelve un período anterior al mes en curso", () => {
    const p = resolvePurchasePeriod({ today: SEP_10, earlyRenewalPeriod: { fechaInicio: "2026-01-01", fechaFin: "2026-01-31" } });
    expect(p.fechaInicio >= calendarMonthPeriod(SEP_10).fechaInicio).toBe(true);
  });
});

describe("monthLabel", () => {
  it("nombra el mes en español", () => {
    expect(monthLabel("2026-09-01")).toBe("septiembre 2026");
    expect(monthLabel("2027-01-01")).toBe("enero 2027");
  });
});
