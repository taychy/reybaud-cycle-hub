import { describe, it, expect } from "vitest";
import {
  addablePackages,
  requiresPackage,
  packageOptionLabel,
  canSubmitAdd,
  type AddablePackage,
} from "./eventPackageAdd";
import type { PriceStage } from "./priceStages";

const pkg = (over: Partial<AddablePackage> = {}): AddablePackage => ({
  id: "p1",
  nombre: "Hab. doble con Pensión Completa",
  precio: 859000,
  currency: "ARS",
  activo: true,
  sort_order: 1,
  ...over,
});

const stage = (over: Partial<PriceStage> = {}): PriceStage => ({
  id: "s2",
  package_id: "p1",
  nombre: "Etapa 2",
  precio: 944900,
  currency: "ARS",
  vigente_desde: "2026-01-01T00:00:00Z",
  vigente_hasta: null,
  incremento_pct: null,
  sort_order: 2,
  activo: true,
  ...over,
});

describe("alta manual con paquetes", () => {
  it("no ofrece paquetes inactivos", () => {
    const list = addablePackages([pkg(), pkg({ id: "p2", activo: false })]);
    expect(list.map((p) => p.id)).toEqual(["p1"]);
  });

  it("exige paquete en eventos con paquetes activos", () => {
    expect(requiresPackage([pkg()])).toBe(true);
  });

  it("no exige paquete en eventos sin paquetes", () => {
    expect(requiresPackage([])).toBe(false);
  });

  it("no exige paquete si todos están inactivos", () => {
    expect(requiresPackage([pkg({ activo: false })])).toBe(false);
  });

  it("no exige paquete en eventos de sólo inscripción", () => {
    expect(requiresPackage([pkg()], "propio_solo_inscripcion")).toBe(false);
  });

  it("etiqueta con etapa vigente y precio", () => {
    const label = packageOptionLabel(pkg(), [stage()], new Date("2026-06-01T00:00:00Z"));
    expect(label).toContain("Hab. doble con Pensión Completa");
    expect(label).toContain("Etapa 2");
    expect(label).toContain("944.900");
  });

  it("etiqueta con precio base si no hay etapa vigente", () => {
    const label = packageOptionLabel(pkg(), [], new Date("2026-06-01T00:00:00Z"));
    expect(label).toContain("Precio base");
    expect(label).toContain("859.000");
  });

  it("bloquea el alta sin paquete cuando hay paquetes activos", () => {
    expect(canSubmitAdd({ packages: [pkg()], selectedPackageId: null })).toBe(false);
    expect(canSubmitAdd({ packages: [pkg()], selectedPackageId: "p1" })).toBe(true);
  });

  it("permite el alta en eventos sin paquetes", () => {
    expect(canSubmitAdd({ packages: [], selectedPackageId: null })).toBe(true);
  });
});
