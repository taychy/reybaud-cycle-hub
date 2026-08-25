import { describe, it, expect } from "vitest";
import { capacidadFisica, planRoomSync, capacityReductionError, type RoomLike } from "./lodgingCapacity";

const room = (id: string, cap: number, order: number): RoomLike => ({
  id, package_id: "p1", capacidad: cap, sort_order: order, tipo: "doble", nombre: `Doble ${order + 1}`,
});

describe("capacidadFisica", () => {
  it("multiplica habitaciones por personas", () => {
    expect(capacidadFisica(3, 2)).toBe(6);
  });
  it("nunca baja de 1 persona por habitación", () => {
    expect(capacidadFisica(4, 0)).toBe(4);
  });
  it("no admite habitaciones negativas", () => {
    expect(capacidadFisica(-2, 3)).toBe(0);
  });
});

describe("planRoomSync", () => {
  it("crea habitaciones faltantes", () => {
    const plan = planRoomSync({ existing: [room("a", 2, 0)], habitaciones: 3, personas: 2, label: "Doble" });
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.toDeleteIds).toHaveLength(0);
    expect(plan.capacidad).toBe(6);
  });

  it("elimina las sobrantes desde el final", () => {
    const plan = planRoomSync({
      existing: [room("a", 2, 0), room("b", 2, 1), room("c", 2, 2)],
      habitaciones: 1, personas: 2,
    });
    expect(plan.toDeleteIds).toEqual(["b", "c"]);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.capacidad).toBe(2);
  });

  it("actualiza capacidad de las que se conservan", () => {
    const plan = planRoomSync({ existing: [room("a", 2, 0), room("b", 2, 1)], habitaciones: 2, personas: 3 });
    expect(plan.toUpdate).toEqual([{ id: "a", capacidad: 3 }, { id: "b", capacidad: 3 }]);
    expect(plan.capacidad).toBe(6);
  });
});

describe("capacityReductionError", () => {
  it("bloquea si hay más reservas activas que plazas", () => {
    expect(capacityReductionError(2, 4)).toMatch(/2 plazas/);
  });
  it("permite si alcanza", () => {
    expect(capacityReductionError(4, 4)).toBeNull();
    expect(capacityReductionError(0, 0)).toBeNull();
  });
});
