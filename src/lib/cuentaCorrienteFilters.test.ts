import { describe, it, expect } from "vitest";
import { coincideFiltroOrigen, origenGrupoDe } from "./cuentaCorrienteFilters";

const rodrigo = [
  { tipo: "cargo_reserva", debe: 872600, haber: 0 },
  { tipo: "pago_reserva", debe: 0, haber: 346975 },
  { tipo: "pago_reserva", debe: 0, haber: 91875 },
  { tipo: "pago_reserva", debe: 0, haber: 91875 },
  { tipo: "pago_reserva", debe: 0, haber: 91875 },
  { tipo: "pago_reserva", debe: 0, haber: 250000 },
  { tipo: "ajuste_credito", debe: 0, haber: 395000, referencia_extra: { aplicado_a_fuente_tabla: null } },
  { tipo: "cargo_suscripcion", debe: 50000, haber: 0 },
];

describe("filtro Evento / Viaje", () => {
  it("incluye el cargo y todos los pagos de la reserva", () => {
    const rows = rodrigo.filter((m) => coincideFiltroOrigen(m, "grupo:evento"));
    expect(rows).toHaveLength(6);
    expect(rows.reduce((s, m) => s + m.haber, 0)).toBe(872600);
  });
  it("no mezcla créditos sin vincular ni suscripciones", () => {
    expect(origenGrupoDe(rodrigo[6])).toBe("ajuste");
    expect(origenGrupoDe(rodrigo[7])).toBe("suscripcion");
  });
  it("incluye créditos aplicados e imputaciones a la reserva", () => {
    expect(origenGrupoDe({ tipo: "ajuste_credito", referencia_extra: { aplicado_a_fuente_tabla: "event_reservations" } })).toBe("evento");
    expect(origenGrupoDe({ tipo: "pago_imputacion", referencia_extra: { obligacion_tipo: "reserva" } })).toBe("evento");
    expect(origenGrupoDe({ tipo: "devolucion", referencia_extra: { reservation_id: "x" } })).toBe("evento");
  });
  it("el filtro por tipo exacto sigue funcionando", () => {
    expect(rodrigo.filter((m) => coincideFiltroOrigen(m, "cargo_reserva"))).toHaveLength(1);
  });
});
