import { describe, it, expect } from "vitest";
import { stageAtDate, matchTargetStage, resolveHistoricalPrice, recalcBalance, type StageLike } from "./lodgingChangeOnCancel";

const stage = (p: Partial<StageLike>): StageLike => ({
  id: p.id || "s", nombre: p.nombre || "Etapa", precio: p.precio ?? 100, currency: p.currency || "ARS",
  vigente_desde: p.vigente_desde ?? null, vigente_hasta: p.vigente_hasta ?? null,
});

const early = stage({ id: "o1", nombre: "Early Bird", precio: 1000, vigente_desde: "2026-01-01T00:00:00Z", vigente_hasta: "2026-03-01T00:00:00Z" });
const general = stage({ id: "o2", nombre: "General", precio: 1500, vigente_desde: "2026-03-01T00:00:00Z", vigente_hasta: null });

describe("stageAtDate", () => {
  it("devuelve la etapa vigente en la fecha de compra", () => {
    expect(stageAtDate([early, general], "2026-02-10T12:00:00Z")?.id).toBe("o1");
    expect(stageAtDate([early, general], "2026-06-10T12:00:00Z")?.id).toBe("o2");
  });
  it("devuelve null si no hay etapa para esa fecha", () => {
    expect(stageAtDate([early], "2025-01-01T00:00:00Z")).toBeNull();
    expect(stageAtDate([], "2026-02-01T00:00:00Z")).toBeNull();
  });
});

describe("matchTargetStage", () => {
  it("empareja por nombre normalizado", () => {
    const t = stage({ id: "t1", nombre: "early bird", precio: 1800 });
    expect(matchTargetStage(early, [t])?.id).toBe("t1");
  });
  it("empareja por misma fecha de inicio", () => {
    const t = stage({ id: "t2", nombre: "Promo lanzamiento", precio: 1800, vigente_desde: "2026-01-01T00:00:00Z" });
    expect(matchTargetStage(early, [t])?.id).toBe("t2");
  });
  it("devuelve null si no hay equivalencia", () => {
    expect(matchTargetStage(early, [stage({ id: "t3", nombre: "Última", vigente_desde: "2026-08-01T00:00:00Z" })])).toBeNull();
  });
});

describe("resolveHistoricalPrice", () => {
  const targetStages = [
    stage({ id: "t1", nombre: "Early Bird", precio: 1800, vigente_desde: "2026-01-01T00:00:00Z", vigente_hasta: "2026-03-01T00:00:00Z" }),
    stage({ id: "t2", nombre: "General", precio: 2400, vigente_desde: "2026-03-01T00:00:00Z" }),
  ];

  it("toma el precio de la etapa histórica, no el vigente", () => {
    const r = resolveHistoricalPrice({ purchaseDate: "2026-02-05T00:00:00Z", originStages: [early, general], targetStages });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.precio).toBe(1800); expect(r.stageNombre).toBe("Early Bird"); }
  });

  it("bloquea si el destino no tiene etapas", () => {
    const r = resolveHistoricalPrice({ purchaseDate: "2026-02-05T00:00:00Z", originStages: [early], targetStages: [] });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("sin_etapas_destino");
  });

  it("bloquea si no hay equivalencia de etapa en el destino", () => {
    const r = resolveHistoricalPrice({
      purchaseDate: "2026-02-05T00:00:00Z",
      originStages: [early],
      targetStages: [stage({ id: "x", nombre: "Última llamada", vigente_desde: "2026-09-01T00:00:00Z" })],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("sin_equivalencia");
  });

  it("bloquea si no se identifica la etapa de compra", () => {
    const r = resolveHistoricalPrice({ purchaseDate: "2020-01-01T00:00:00Z", originStages: [early], targetStages });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("sin_etapa_origen");
  });
});

describe("recalcBalance", () => {
  it("conserva lo abonado y recalcula saldo", () => {
    expect(recalcBalance(2400, 1000)).toEqual({ total: 2400, paid: 1000, balance: 1400 });
  });
  it("permite saldo a favor (negativo) si pagó de más", () => {
    expect(recalcBalance(1800, 2000).balance).toBe(-200);
  });
});
