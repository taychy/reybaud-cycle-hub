import { describe, expect, it } from "vitest";
import { resolveActivePrice, type PriceStage } from "./priceStages";

const stage = (over: Partial<PriceStage> = {}): PriceStage => ({
  id: "s1",
  package_id: "p1",
  nombre: "Etapa 1",
  precio: 100,
  currency: "ARS",
  vigente_desde: "2026-01-01T00:00:00Z",
  vigente_hasta: "2026-02-01T00:00:00Z",
  incremento_pct: null,
  sort_order: 1,
  activo: true,
  ...over,
});

describe("resolveActivePrice", () => {
  it("usa la etapa cuya ventana contiene now", () => {
    const result = resolveActivePrice(
      75,
      "ARS",
      [stage({ precio: 100 })],
      new Date("2026-01-15T00:00:00Z"),
    );
    expect(result.precio).toBe(100);
    expect(result.activeStage?.id).toBe("s1");
  });

  it("mantiene la última etapa iniciada cuando ya venció", () => {
    const result = resolveActivePrice(
      75,
      "ARS",
      [stage({ precio: 100 })],
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result.precio).toBe(100);
    expect(result.activeStage?.id).toBe("s1");
  });

  it("mantiene la etapa anterior durante un hueco antes de la próxima", () => {
    const stages = [
      stage({ id: "s1", precio: 100, vigente_hasta: "2026-02-01T00:00:00Z" }),
      stage({
        id: "s2",
        nombre: "Etapa 2",
        precio: 120,
        vigente_desde: "2026-03-01T00:00:00Z",
        vigente_hasta: null,
        sort_order: 2,
      }),
    ];
    const result = resolveActivePrice(
      75,
      "ARS",
      stages,
      new Date("2026-02-15T00:00:00Z"),
    );
    expect(result.precio).toBe(100);
    expect(result.activeStage?.id).toBe("s1");
    expect(result.nextStage?.id).toBe("s2");
  });

  it("usa el precio base si todavía no empezó ninguna etapa", () => {
    const result = resolveActivePrice(
      75,
      "ARS",
      [stage({ vigente_desde: "2026-04-01T00:00:00Z", vigente_hasta: null })],
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result.precio).toBe(75);
    expect(result.activeStage).toBeNull();
  });

  it("usa el precio base cuando el paquete no tiene etapas", () => {
    const result = resolveActivePrice(75, "ARS", [], new Date("2026-03-01T00:00:00Z"));
    expect(result.precio).toBe(75);
    expect(result.activeStage).toBeNull();
  });
});
