import { describe, it, expect } from "vitest";
import { checkTurneraPayment, isTurneraPaid, type TurneraReservaLike, isTurneraEventualPlanName, isSelectableTurneraMp } from "./turneraPayment";
import { canOfferDebtDistribution, canOfferGenericImputation, imputadoDestinoLabel, isTurneraMovement } from "./mpConciliacion";

const A = "alumno-1";
const R1 = "11111111-1111-1111-1111-111111111111";
const R2 = "22222222-2222-2222-2222-222222222222";
const res = (id: string, extra: Partial<TurneraReservaLike> = {}): TurneraReservaLike => ({
  id, alumno_id: A, estado_operativo: "confirmada", estado_economico: "pendiente", pago_estado: "pendiente",
  precio_snapshot: 25000, moneda_snapshot: "ARS", pago_mp_payment_id: null, ...extra,
});

/** Modelo del trigger sync_turnera_cuenta_corriente: 1 crédito por reserva pagada y no cancelada. */
const credits = (rs: TurneraReservaLike[]) =>
  rs.filter((r) => isTurneraPaid(r) && !String(r.estado_operativo).startsWith("cancelada")).length;

const pay = (r: TurneraReservaLike, mp?: string): TurneraReservaLike =>
  ({ ...r, pago_estado: "aprobado", estado_economico: "pagado", pago_mp_payment_id: mp ?? r.pago_mp_payment_id });

describe("turnera: cobro por reserva", () => {
  it("dos clases del mismo alumno en el mismo mes se cobran por separado", () => {
    let r1 = res(R1), r2 = res(R2);
    expect(checkTurneraPayment({ reserva: r1, alumnoId: A, monto: 25000, moneda: "ARS" })).toEqual({ ok: true, duplicate: false });
    r1 = pay(r1);
    expect(checkTurneraPayment({ reserva: r2, alumnoId: A, monto: 25000, moneda: "ARS" })).toEqual({ ok: true, duplicate: false });
    r2 = pay(r2);
    expect(credits([r1, r2])).toBe(2);
  });

  it("una sola operación por reserva: un segundo pago manual se rechaza", () => {
    const r = pay(res(R1));
    const c = checkTurneraPayment({ reserva: r, alumnoId: A, monto: 25000, moneda: "ARS" });
    expect(c.ok).toBe(false);
    expect(credits([r])).toBe(1);
  });

  it("reintento del mismo cobro MP es idempotente y no suma haber", () => {
    const r = pay(res(R1), "mp-1");
    const mp = { mp_payment_id: "mp-1", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    expect(checkTurneraPayment({ reserva: r, alumnoId: A, monto: 25000, moneda: "ARS", mp })).toEqual({ ok: true, duplicate: true });
    expect(credits([r])).toBe(1);
  });

  it("dos operaciones MP reales distintas para dos reservas son válidas", () => {
    const mp1 = { mp_payment_id: "mp-1", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    const mp2 = { mp_payment_id: "mp-2", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R2}` };
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "ARS", mp: mp1 }).ok).toBe(true);
    expect(checkTurneraPayment({ reserva: res(R2), alumnoId: A, monto: 25000, moneda: "ARS", mp: mp2 }).ok).toBe(true);
  });

  it("el mismo cobro MP no puede aplicarse a otra reserva", () => {
    const mp1 = { mp_payment_id: "mp-1", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    expect(checkTurneraPayment({ reserva: res(R2), alumnoId: A, monto: 25000, moneda: "ARS", mp: mp1 }).ok).toBe(false);
    const sinRef = { mp_payment_id: "mp-1", amount: 25000, currency: "ARS" };
    expect(checkTurneraPayment({ reserva: res(R2), alumnoId: A, monto: 25000, moneda: "ARS", mp: sinRef, otherReservasWithMp: [R1] }).ok).toBe(false);
  });

  it("reserva cancelada no acepta pago", () => {
    expect(checkTurneraPayment({ reserva: res(R1, { estado_operativo: "cancelada_alumno" }), alumnoId: A, monto: 25000, moneda: "ARS" }).ok).toBe(false);
  });

  it("valida alumno, moneda e importe", () => {
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: "otro", monto: 25000, moneda: "ARS" }).ok).toBe(false);
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "USD" }).ok).toBe(false);
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 20000, moneda: "ARS" }).ok).toBe(false);
  });

  it("cobro ya vinculado a mensualidad o con imputaciones falla sin tocar nada (no doble haber)", () => {
    const base = { mp_payment_id: "mp-9", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "ARS", mp: { ...base, suscripcion_id: "sub" } }).ok).toBe(false);
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "ARS", mp: { ...base, imputaciones_activas: 1 } }).ok).toBe(false);
  });
});

describe("conciliación MP de cobros turnera", () => {
  const mov = { alumno_id: A, external_reference: `turnera:${R1}`, monto_disponible: 25000 };
  it("no son elegibles como mensualidad ni para distribución genérica", () => {
    expect(isTurneraMovement(mov)).toBe(true);
    expect(canOfferGenericImputation(mov)).toBe(false);
    expect(canOfferDebtDistribution(mov)).toBe(false);
  });
  it("vínculo histórico a suscripción queda marcado para revisión", () => {
    expect(imputadoDestinoLabel({ ...mov, suscripcion_id: "sub" })).toContain("revisar");
  });

  it("MP pending/rejected/egreso/reintegro o sin referencia exacta no acreditan", () => {
    const base = { mp_payment_id: "mp-9", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    for (const bad of [{ status: "pending" }, { status: "rejected" }, { direccion: "egreso" }, { tipo: "refund" }, { external_reference: null }, { mp_payment_id: " " }]) {
      expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "ARS", mp: { ...base, ...bad } as any }).ok).toBe(false);
    }
  });

  it("cobro ya consumido no acredita; idempotencia no salta validaciones", () => {
    const mp = { mp_payment_id: "mp-9", amount: 25000, currency: "ARS", status: "approved", direccion: "ingreso", external_reference: `turnera:${R1}` };
    expect(checkTurneraPayment({ reserva: res(R1), alumnoId: A, monto: 25000, moneda: "ARS", mp: { ...mp, saldo_disponible: 0 } }).ok).toBe(false);
    const paid = { ...res(R1), estado_economico: "pagado", pago_mp_payment_id: "mp-9" };
    expect(checkTurneraPayment({ reserva: paid, alumnoId: A, monto: 25000, moneda: "ARS", mp: { ...mp, status: "rejected" } }).ok).toBe(false);
  });
});

describe("planes de clase eventual (no generan mensualidad)", () => {
  it("bloquea solo Clase Personalizada y Clase Personalizada CR", () => {
    expect(isTurneraEventualPlanName("Clase Personalizada")).toBe(true);
    expect(isTurneraEventualPlanName("  clase personalizada CR ")).toBe(true);
    expect(isTurneraEventualPlanName("Asesoría Personalizada")).toBe(false);
    expect(isTurneraEventualPlanName("Pack 4 Clases Personalizadas")).toBe(false);
  });
  it("solo ofrece cobros MP aprobados de ingreso de esa reserva", () => {
    const ok = { mp_payment_id: "1", status: "approved", direccion: "ingreso", tipo: "payment", external_reference: `turnera:${R1}` };
    expect(isSelectableTurneraMp(ok, R1)).toBe(true);
    expect(isSelectableTurneraMp({ ...ok, status: "pending" }, R1)).toBe(false);
    expect(isSelectableTurneraMp({ ...ok, direccion: "egreso" }, R1)).toBe(false);
    expect(isSelectableTurneraMp(ok, R2)).toBe(false);
  });
});
