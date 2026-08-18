import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  setEarlyRenewal,
  getEarlyRenewal,
  clearEarlyRenewal,
  revalidateEarlyRenewalSource,
  EARLY_RENEWAL_TTL_MS,
} from "./earlyRenewal";
import { startOfCalendarMonth } from "./subscriptionPeriod";

const KEYS = [
  "alumno_early_renewal",
  "alumno_early_renewal_sub_id",
  "alumno_early_renewal_plan_id",
  "alumno_early_renewal_fecha_inicio",
  "alumno_early_renewal_fecha_fin",
  "alumno_early_renewal_auto_renov",
  "alumno_early_renewal_ts",
];

const nothingStored = () => KEYS.every((k) => localStorage.getItem(k) === null);

/** fecha_fin del mes en curso → el contexto apunta al mes siguiente (válido). */
const currentMonthEnd = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
};

describe("earlyRenewal context", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve un contexto válido recién guardado, apuntando a un mes futuro", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: true });
    const ctx = getEarlyRenewal();
    expect(ctx).not.toBeNull();
    expect(ctx!.subId).toBe("sub-1");
    expect(ctx!.autoRenovacion).toBe(true);
    expect(ctx!.fechaInicio > startOfCalendarMonth()).toBe(true);
    expect(typeof ctx!.createdAt).toBe("number");
  });

  it("descarta y limpia el contexto cuando venció el TTL", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: false });
    const past = Date.now() - EARLY_RENEWAL_TTL_MS - 1000;
    localStorage.setItem("alumno_early_renewal_ts", String(past));

    expect(getEarlyRenewal()).toBeNull();
    expect(nothingStored()).toBe(true);
  });

  it("descarta contextos legacy sin timestamp", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: false });
    localStorage.removeItem("alumno_early_renewal_ts");

    expect(getEarlyRenewal()).toBeNull();
    expect(nothingStored()).toBe(true);
  });

  it("descarta y limpia si la fecha de inicio es de un mes pasado (caso Federico Miño)", () => {
    // Contexto guardado hace poco (TTL ok) pero apuntando a julio cuando ya es agosto.
    localStorage.setItem("alumno_early_renewal", "1");
    localStorage.setItem("alumno_early_renewal_sub_id", "sub-vieja");
    localStorage.setItem("alumno_early_renewal_plan_id", "plan-1");
    localStorage.setItem("alumno_early_renewal_fecha_inicio", "2020-07-01");
    localStorage.setItem("alumno_early_renewal_fecha_fin", "2020-07-31");
    localStorage.setItem("alumno_early_renewal_ts", String(Date.now()));

    expect(getEarlyRenewal()).toBeNull();
    expect(nothingStored()).toBe(true);
  });

  it("descarta contextos incompletos", () => {
    localStorage.setItem("alumno_early_renewal", "1");
    localStorage.setItem("alumno_early_renewal_sub_id", "sub-1");
    expect(getEarlyRenewal()).toBeNull();
    expect(nothingStored()).toBe(true);
  });

  it("clearEarlyRenewal borra todas las claves", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: true });
    clearEarlyRenewal();
    expect(nothingStored()).toBe(true);
  });
});

describe("revalidateEarlyRenewalSource", () => {
  beforeEach(() => localStorage.clear());

  it("mantiene el contexto si la sub de origen sigue vigente", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: false });
    const ctx = getEarlyRenewal()!;
    expect(revalidateEarlyRenewalSource(ctx, ["otra", "sub-1"])).toEqual(ctx);
    expect(nothingStored()).toBe(false);
  });

  it("descarta y limpia si la sub de origen ya no existe entre las vigentes", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: false });
    const ctx = getEarlyRenewal()!;
    expect(revalidateEarlyRenewalSource(ctx, ["otra"])).toBeNull();
    expect(nothingStored()).toBe(true);
  });

  it("no toca nada si no pudimos consultar las subs vigentes", () => {
    setEarlyRenewal({ subId: "sub-1", planId: "plan-1", fechaFin: currentMonthEnd(), autoRenovacion: false });
    const ctx = getEarlyRenewal()!;
    expect(revalidateEarlyRenewalSource(ctx, null)).toEqual(ctx);
    expect(nothingStored()).toBe(false);
  });

  it("devuelve null cuando no hay contexto", () => {
    expect(revalidateEarlyRenewalSource(null, ["sub-1"])).toBeNull();
  });
});
