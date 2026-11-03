import { describe, it, expect } from "vitest";
import { canOfferGenericImputation, deriveMpConciliacionEstado, evaluarImputacionMp, unidadDeRuta } from "./mpConciliacion";

describe("deriveMpConciliacionEstado", () => {
  it("sin alumno → SIN IDENTIFICAR", () => {
    expect(deriveMpConciliacionEstado({})).toBe("sin_identificar");
  });

  it("alumno_id sin destino → IDENTIFICADO · FALTA IMPUTAR", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1" })).toBe("identificado_sin_imputar");
  });

  it("alumno_id + suscripcion_id → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", suscripcion_id: "s1" })).toBe("imputado");
  });

  it("alumno_id + reservation_payment_id → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", reservation_payment_id: "r1" })).toBe("imputado");
  });

  it("crédito aplicado a una deuda → IMPUTADO", () => {
    expect(deriveMpConciliacionEstado({ alumno_id: "a1", credito_aplicado: true })).toBe("imputado");
  });
  it("un crédito de 80030 no permite imputar otra vez el mismo cobro", () => {
    expect(canOfferGenericImputation({ alumno_id: "a1", credito_representado: 80030, monto_disponible: 0 })).toBe(false);
  });
  it("un crédito familiar parcial conserva su remanente sin ofrecer asignación del total", () => {
    const movement = { alumno_id: "a1", credito_representado: 600, monto_disponible: 400 };
    expect(canOfferGenericImputation(movement)).toBe(false);
    expect(deriveMpConciliacionEstado(movement)).toBe("identificado_sin_imputar");
  });
  it("un cobro sin representación y con remanente puede imputarse", () => {
    expect(canOfferGenericImputation({ alumno_id: "a1", credito_representado: 0, monto_disponible: 400 })).toBe(true);
  });
});

describe("controles de imputación por cuenta MP", () => {
  const base = { alumno_id: "a1", cuenta_unidades: ["viaje_camp"], ruteo_verificado: true };

  it("permite un ingreso nuevo de la cuenta Viajes solamente a una reserva", () => {
    expect(evaluarImputacionMp(base, "reservation")).toBeNull();
    expect(evaluarImputacionMp(base, "suscripcion")).toContain("no corresponde");
    expect(evaluarImputacionMp(base, "saldo")).toContain("crédito general");
  });

  it("impide pasar un cobro de Tienda a San Luis aunque esté identificado al alumno", () => {
    const m = { ...base, cuenta_unidades: ["tienda"] };
    expect(evaluarImputacionMp(m, "reservation")).toContain("no corresponde");
    expect(evaluarImputacionMp(m, "saldo")).toContain("crédito general");
  });

  it("rechaza una operación ya aplicada a la tienda, como la orden #74", () => {
    expect(evaluarImputacionMp({ ...base, tienda_existente: true }, "reservation")).toContain("Tienda");
    expect(evaluarImputacionMp({ ...base, external_reference: "store_order:74" }, "reservation")).toContain("Tienda");
  });

  it("no permite registrar dos veces una transferencia que ya tiene crédito", () => {
    expect(evaluarImputacionMp({ ...base, credito_representado: 184450 }, "reservation")).toContain("crédito existente");
  });

  it("no permite usar una operación que ya tiene pago de reserva", () => {
    expect(evaluarImputacionMp({ ...base, rp_existente: { id: "rp1" } }, "reservation")).toContain("registrado");
  });

  it("bloquea ante falta de rutas verificadas, sin asumir una cuenta por el pagador", () => {
    expect(evaluarImputacionMp({ ...base, ruteo_verificado: false }, "reservation")).toContain("verificar");
    expect(evaluarImputacionMp({ ...base, cuenta_unidades: [] }, "reservation")).toContain("ruta comercial");
  });

  it("acepta cuentas autorizadas para varias unidades y el ruteo alternativo", () => {
    expect(evaluarImputacionMp({ ...base, cuenta_unidades: ["tienda", "viaje_camp"] }, "reservation")).toBeNull();
    expect(evaluarImputacionMp({ ...base, cuenta_unidades: ["suscripcion_escuela"] }, "suscripcion")).toBeNull();
  });

  it("normaliza los nombres de ruta usados en los datos de Reybaud", () => {
    expect(unidadDeRuta("preventa")).toBe("tienda");
    expect(unidadDeRuta("evento")).toBe("viajes");
    expect(unidadDeRuta("turnera")).toBe("escuela");
    expect(unidadDeRuta("sin_configurar")).toBeNull();
  });
});
