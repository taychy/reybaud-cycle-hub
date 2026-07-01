import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  getEffectiveSubStatus,
  isSubPaid,
  isAdminPayableSubscription,
  SUB_STATUS_LABELS,
  type SubStatusInput,
} from "./subscriptionStatus";

/**
 * Fijamos "hoy" al 15/07/2026 para todos los casos:
 *  - período jun/26 (fin 30/06) está VENCIDO y fuera de gracia (>día 5).
 *  - período jul/26 (fin 31/07) sigue VIGENTE.
 *  - período ago/26 (fin 31/08) es FUTURO.
 */
const FIXED_TODAY = new Date(2026, 6, 15, 10, 0, 0); // month 6 = julio

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TODAY);
});

afterAll(() => {
  vi.useRealTimers();
});

const base: Partial<SubStatusInput> = {
  cancelada_at: null,
  mp_status: null,
  origen_registro: null,
};

const sub = (overrides: Partial<SubStatusInput>): SubStatusInput =>
  ({ estado: "activa", fecha_fin: null, ...base, ...overrides } as SubStatusInput);

describe("isSubPaid", () => {
  it("es true cuando mp_status = approved", () => {
    expect(isSubPaid(sub({ mp_status: "approved" }))).toBe(true);
  });
  it("es true cuando origen_registro = cargado_admin", () => {
    expect(isSubPaid(sub({ origen_registro: "cargado_admin" }))).toBe(true);
  });
  it("es true cuando origen_registro = automatico (renovación pagada)", () => {
    expect(isSubPaid(sub({ origen_registro: "automatico" }))).toBe(true);
  });
  it("es false sin flags de pago", () => {
    expect(isSubPaid(sub({}))).toBe(false);
    expect(isSubPaid(sub({ mp_status: "pending" }))).toBe(false);
    expect(isSubPaid(sub({ origen_registro: "registro_alumno" }))).toBe(false);
  });
});

describe("getEffectiveSubStatus — vencida paga vs impaga", () => {
  it("vencida + mp_status approved → finalizada (NO pago_pendiente)", () => {
    const s = sub({
      estado: "vencida",
      fecha_fin: "2026-06-30",
      mp_status: "approved",
    });
    expect(getEffectiveSubStatus(s)).toBe("finalizada");
    expect(SUB_STATUS_LABELS.finalizada).toBe("Finalizada");
  });

  it("vencida + origen cargado_admin → finalizada", () => {
    const s = sub({
      estado: "vencida",
      fecha_fin: "2026-06-30",
      origen_registro: "cargado_admin",
    });
    expect(getEffectiveSubStatus(s)).toBe("finalizada");
  });

  it("vencida + origen automatico (renovación cobrada) → finalizada", () => {
    const s = sub({
      estado: "vencida",
      fecha_fin: "2026-06-30",
      origen_registro: "automatico",
    });
    expect(getEffectiveSubStatus(s)).toBe("finalizada");
  });

  it("vencida SIN pago → sigue mostrando 'vencida'", () => {
    const s = sub({ estado: "vencida", fecha_fin: "2026-06-30" });
    expect(getEffectiveSubStatus(s)).toBe("vencida");
  });

  it("vencida impaga con mp_status pending → 'vencida'", () => {
    const s = sub({
      estado: "vencida",
      fecha_fin: "2026-06-30",
      mp_status: "pending",
    });
    expect(getEffectiveSubStatus(s)).toBe("vencida");
  });
});

describe("getEffectiveSubStatus — activa vencida en gracia (día 1-5)", () => {
  it("activa vencida, día 15 (fuera de gracia) → acceso_pausado si NO paga", () => {
    // hoy = 15/07/2026, fin = 30/06/2026 → next month, day 15 > 5
    const s = sub({ estado: "activa", fecha_fin: "2026-06-30" });
    expect(getEffectiveSubStatus(s)).toBe("acceso_pausado");
  });

  it("activa vencida, día 3 del mes siguiente → pago_pendiente (gracia)", () => {
    vi.setSystemTime(new Date(2026, 6, 3, 10, 0, 0));
    const s = sub({ estado: "activa", fecha_fin: "2026-06-30" });
    expect(getEffectiveSubStatus(s)).toBe("pago_pendiente");
    vi.setSystemTime(FIXED_TODAY);
  });

  it("activa con fecha_fin futura → activa", () => {
    const s = sub({ estado: "activa", fecha_fin: "2026-07-31" });
    expect(getEffectiveSubStatus(s)).toBe("activa");
  });
});

describe("getEffectiveSubStatus — cancelada respeta fecha_fin", () => {
  it("cancelada pero fecha_fin futura → activa (acceso hasta fin de período)", () => {
    const s = sub({
      estado: "cancelada",
      cancelada_at: "2026-07-01",
      fecha_fin: "2026-07-31",
    });
    expect(getEffectiveSubStatus(s)).toBe("activa");
  });

  it("cancelada + fecha_fin pasada → cancelada", () => {
    const s = sub({
      estado: "cancelada",
      cancelada_at: "2026-05-01",
      fecha_fin: "2026-06-30",
    });
    expect(getEffectiveSubStatus(s)).toBe("cancelada");
  });
});

describe("isAdminPayableSubscription", () => {
  it("vencida paga (finalizada) NO se cobra de nuevo", () => {
    const s = sub({
      estado: "vencida",
      fecha_fin: "2026-06-30",
      mp_status: "approved",
    });
    expect(isAdminPayableSubscription(s)).toBe(false);
  });

  it("vencida impaga SÍ es cobrable", () => {
    const s = sub({ estado: "vencida", fecha_fin: "2026-06-30" });
    expect(isAdminPayableSubscription(s)).toBe(true);
  });

  it("pendiente es cobrable", () => {
    expect(
      isAdminPayableSubscription(sub({ estado: "pendiente", fecha_fin: "2026-07-31" }))
    ).toBe(true);
  });

  it("activa (raw = pagada) NO es cobrable", () => {
    expect(
      isAdminPayableSubscription(sub({ estado: "activa", fecha_fin: "2026-07-31" }))
    ).toBe(false);
  });

  it("cancelada NO es cobrable", () => {
    expect(
      isAdminPayableSubscription(
        sub({ estado: "cancelada", cancelada_at: "2026-05-01", fecha_fin: "2026-06-30" })
      )
    ).toBe(false);
  });
});
