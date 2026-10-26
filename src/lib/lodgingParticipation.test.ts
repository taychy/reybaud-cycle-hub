import { describe, it, expect } from "vitest";
import { needsLodging, withdrawnSeatMap } from "./lodgingParticipation";

const releases = [
  { source_reservation_id: "baja", kind: "refund", state: "liberada" },
  { source_reservation_id: "ofrecida", kind: "credit_withdrawal", state: "ofrecida" },
  { source_reservation_id: "confirmada", kind: "refund", state: "renuncia_confirmada" },
  { source_reservation_id: "anulada", kind: "refund", state: "anulada" },
];
const w = withdrawnSeatMap(releases);

describe("alojamiento: bajas aprobadas", () => {
  it("una baja aprobada con plaza liberada no queda pendiente de alojar", () => {
    expect(needsLodging({ id: "baja", reservation_status: "reserva_confirmada" }, w)).toBe(false);
    expect(needsLodging({ id: "ofrecida", reservation_status: "reserva_confirmada" }, w)).toBe(false);
  });
  it("renuncia sin aprobar o anulada sigue ocupando plaza", () => {
    expect(needsLodging({ id: "confirmada", reservation_status: "reserva_confirmada" }, w)).toBe(true);
    expect(needsLodging({ id: "anulada", reservation_status: "reserva_confirmada" }, w)).toBe(true);
  });
  it("reservas canceladas no necesitan alojamiento", () => {
    expect(needsLodging({ id: "x", reservation_status: "cancelada" }, w)).toBe(false);
  });
});
