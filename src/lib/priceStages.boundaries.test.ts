import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { resolveActivePrice, type PriceStage } from "./priceStages";

// Etapas con cortes al fin del día en hora Argentina (UTC-3), como se cargan en viajes.
const mk = (nombre: string, precio: number, desde: string, hasta: string, i: number): PriceStage => ({
  id: nombre, package_id: "p", nombre, precio, currency: "EUR", vigente_desde: desde, vigente_hasta: hasta,
  incremento_pct: null, sort_order: i, activo: true,
});
const doble = [
  mk("Lanzamiento", 3890, "2000-01-01T00:00:00Z", "2026-12-01T02:59:59Z", 1),
  mk("Etapa 2", 4279, "2026-12-01T03:00:00Z", "2027-02-01T02:59:59Z", 2),
  mk("Etapa 3", 4706.9, "2027-02-01T03:00:00Z", "2099-12-31T23:59:59Z", 3),
];
const at = (iso: string) => vi.setSystemTime(new Date(iso));
afterEach(() => vi.useRealTimers());

describe("cambio de etapa por fecha Argentina", () => {
  it.each([
    ["2026-11-30T23:59:00-03:00", 3890],
    ["2026-12-01T00:00:30-03:00", 4279],
    ["2027-01-31T23:59:00-03:00", 4279],
    ["2027-02-01T00:00:30-03:00", 4706.9],
  ])("%s → %s", (iso, precio) => {
    vi.useFakeTimers(); at(iso);
    const r = resolveActivePrice(3890, "EUR", doble);
    expect(r.precio).toBe(precio);
    expect(r.currency).toBe("EUR");
  });
  it("individual mantiene +600 en cada etapa", () => {
    const ind = doble.map((s) => ({ ...s, precio: Math.round((s.precio + 600) * 100) / 100 }));
    for (const [iso, p] of [["2026-11-15T12:00:00-03:00", 4490], ["2026-12-15T12:00:00-03:00", 4879], ["2027-03-01T12:00:00-03:00", 5306.9]] as const) {
      vi.useFakeTimers(); at(iso);
      expect(resolveActivePrice(4490, "EUR", ind).precio).toBe(p);
    }
  });
});
