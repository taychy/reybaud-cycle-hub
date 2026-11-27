import { describe, expect, it } from "vitest";
import { allowedManualStatus, buildDiners, evaluateCoverage, nameKey, validateGuestEdit, validatePaymentDraft, verifyExistingBlocker, type LunchPayment } from "./fondazoLunch";
import { paymentOf, restaurantReport, type AdminRow } from "./fondazoAdmin";

const prices = { adult_price: 40000, child_4_9_price: 20000, under_4_price: 0, prices_confirmed_at: "2026-11-16T00:00:00Z" };
const carlos = {
  recipient_name: "Carlos Rodolfo Simone", recipient_email: "c@example.com", participant_first_name: null, participant_last_name: null,
  non_cyclist_guests: [{ name: "Marcela Cendali", category: "adult" as const }], cyclist_guests: [], lunch_status: "instrucciones_enviadas",
};
const diners = buildDiners(carlos);
const keys = diners.map((d) => d.key);
const pay = (k: string[], amount: number, extra: Partial<LunchPayment> = {}): LunchPayment => ({
  id: "p1", invite_id: "i", amount_ars: amount, bank_reference: "OP 123", expected_for_covered: 0, comment: "ok", created_at: "2026-11-26T12:00:00Z",
  voided_at: null, void_reason: null, covered: diners.filter((d) => k.includes(d.key)), ...extra,
});
const draft = (k: string[], amount: number, markVerified: boolean) => ({ keys: k, amount, reference: "OP 123", comment: "Cotejado", markVerified });

describe("comensales y cobertura", () => {
  it("titular + 1 acompañante con ARS 80.000 cubre todo y permite verificar", () => {
    expect(diners.map((d) => d.name)).toEqual(["Carlos Rodolfo Simone", "Marcela Cendali"]);
    expect(evaluateCoverage(diners, [], prices, { keys, amount: 80000 }).canVerify).toBe(true);
    expect(validatePaymentDraft(diners, [], prices, draft(keys, 80000, true))).toBeNull();
  });
  it("importe distinto a la tarifa no verifica", () => {
    expect(evaluateCoverage(diners, [], prices, { keys, amount: 70000 }).status).toBe("monto_no_coincide");
    expect(validatePaymentDraft(diners, [], prices, draft(keys, 70000, true))).toMatch(/No se puede verificar/);
  });
  it("pago parcial queda registrado sin verificación total", () => {
    const c = evaluateCoverage(diners, [], prices, { keys: [keys[0]], amount: 40000 });
    expect(c.status).toBe("parcial");
    expect(validatePaymentDraft(diners, [], prices, draft([keys[0]], 40000, false))).toBeNull();
    expect(validatePaymentDraft(diners, [], prices, draft([keys[0]], 40000, true))).not.toBeNull();
  });
  it("dos comprobantes parciales que suman y cubren a todos permiten verificar", () => {
    expect(validatePaymentDraft(diners, [pay([keys[0]], 40000)], prices, draft([keys[1]], 40000, true))).toBeNull();
  });
  it("no cubre dos veces a la misma persona", () => {
    expect(validatePaymentDraft(diners, [pay([keys[0]], 40000)], prices, draft(keys, 80000, false))).toMatch(/ya está cubierta/);
    expect(validatePaymentDraft(diners, [], prices, draft([keys[0], keys[0]], 80000, false))).toMatch(/repetidas/);
  });
  it("comprobante anulado no cuenta", () => {
    const c = evaluateCoverage(diners, [pay(keys, 80000, { voided_at: "x" })], prices);
    expect(c.status).toBe("sin_comprobante");
  });
  it("tarifa no confirmada bloquea y queda sin conciliar", () => {
    const p = { ...prices, prices_confirmed_at: null };
    expect(evaluateCoverage(diners, [], p, { keys, amount: 80000 }).status).toBe("sin_conciliar");
    expect(validatePaymentDraft(diners, [], p, draft(keys, 80000, false))).toMatch(/tarifas/);
  });
  it("normaliza acentos, mayúsculas y espacios en la clave", () => {
    expect(nameKey("  Marcéla   CENDALI ")).toBe(nameKey("marcela cendali"));
  });
});

describe("corrección de acompañantes", () => {
  it("rechaza duplicados con el titular u otro acompañante", () => {
    expect(validateGuestEdit(carlos, [{ name: "carlos rodolfo simone", category: "adult" }], "corrección", false)).toMatch(/duplicado/);
    expect(validateGuestEdit(carlos, [{ name: "Ana", category: "adult" }, { name: "ANA", category: "adult" }], "corrección", false)).toMatch(/duplicado/);
  });
  it("exige motivo", () => {
    expect(validateGuestEdit(carlos, carlos.non_cyclist_guests, "", false)).toMatch(/motivo/);
  });
  it("con comprobante registrado bloquea toda edición, incluso solo nombres", () => {
    expect(validateGuestEdit(carlos, [{ name: "Marcela Cendali Pérez", category: "adult" }], "nombre completo", true)).toMatch(/anulalos/);
    expect(validateGuestEdit(carlos, [...carlos.non_cyclist_guests, { name: "Juan", category: "child_4_9" }], "suma", true)).toMatch(/anulalos/);
    expect(validateGuestEdit({ ...carlos, lunch_status: "comprobante_informado" }, [{ name: "Marcela C.", category: "adult" }], "nombre", false)).toBeNull();
    expect(validateGuestEdit({ ...carlos, lunch_status: "comprobante_informado" }, [], "quita", false)).toMatch(/comprobante/);
  });
  it("pago verificado bloquea la edición", () => {
    expect(validateGuestEdit({ ...carlos, lunch_status: "pago_verificado" }, carlos.non_cyclist_guests, "x y z", false)).toMatch(/verificado/);
  });
});

describe("compatibilidad y reporte para restaurante", () => {
  const row: AdminRow = {
    id: "d12cd527-a788", recipient_name: "Carlos Rodolfo Simone", recipient_email: "c@example.com", alumno_id: "a", participant_whatsapp: "+5491100000000",
    response: "voy", participation_mode: "solo_almuerzo", lunch_status: "comprobante_informado", receipt_reference: "OP 123", lunch_status_changed_at: null,
    cyclist_guests: [], non_cyclist_guests: [{ name: "Marcela Cendali", category: "adult" }], lunch_payments: [pay(keys, 80000)],
  };
  it("comprobante registrado no se presenta como pagado", () => {
    const csv = restaurantReport([row], prices);
    expect(csv).toContain("Carlos Rodolfo Simone; Marcela Cendali");
    expect(csv).toContain("Pendiente · comprobante a verificar");
    expect(csv).not.toContain("Pagado (verificado)");
    expect(csv).not.toContain("c@example.com");
    expect(csv).not.toContain("5491100000000");
  });
  it("pagos antiguos sin registro de cobertura siguen funcionando", () => {
    const legacy = { ...row, lunch_payments: undefined, lunch_status: "pago_verificado" as const };
    expect(paymentOf(legacy)).toBe("pago_verificado");
    expect(restaurantReport([legacy], prices)).toContain("Pagado (verificado)");
  });
});

describe("verificación diferida y estados", () => {
  const informed = "comprobante_informado";
  it("comprobante completo registrado sin verificar puede verificarse después", () => {
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 80000)], prices)).toBeNull();
  });
  it("no verifica parcial, monto distinto, anulados, sin referencia ni otro estado", () => {
    expect(verifyExistingBlocker(informed, diners, [pay([keys[0]], 40000)], prices)).toMatch(/Faltan/);
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 70000)], prices)).toMatch(/no suman/);
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 80000, { voided_at: "x" })], prices)).toMatch(/No hay/);
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 80000, { bank_reference: "" })], prices)).toMatch(/referencia/);
    expect(verifyExistingBlocker("instrucciones_enviadas", diners, [pay(keys, 80000)], prices)).toMatch(/Solo se verifican/);
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 80000)], { ...prices, prices_confirmed_at: null })).toMatch(/tarifas/);
  });
  it("detecta persona cubierta dos veces", () => {
    expect(verifyExistingBlocker(informed, diners, [pay(keys, 40000), pay([keys[0]], 40000, { id: "p2" })], prices)).toMatch(/más de un/);
  });
  it("con comprobantes vigentes el estado manual no baja de comprobante recibido", () => {
    expect(allowedManualStatus("instrucciones_enviadas", true)).toBe(false);
    expect(allowedManualStatus("comprobante_informado", true)).toBe(true);
    expect(allowedManualStatus("instrucciones_enviadas", false)).toBe(true);
    expect(allowedManualStatus("pago_verificado", false)).toBe(false);
  });
});
