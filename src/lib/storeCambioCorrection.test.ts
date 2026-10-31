import { describe, it, expect } from "vitest";
import { correctionBaseline, correctionChanges, validateCorrection, correctionStage } from "./storeCambioCorrection";

describe("administrative exchange corrections", () => {
  const pending = { producto_id: "original", producto_reemplazo_id: "replacement", variante_origen: { Talle: "L" }, variante_destino: { Talle: "M" }, estado: "aprobado" };
  const before = correctionBaseline(pending);
  const after = { ...before, comentario: "Dato corregido" };
  it("keeps original and replacement distinct", () => {
    expect(before.producto_id).toBe("original"); expect(before.producto_reemplazo_id).toBe("replacement");
  });
  it("requires a nonempty reason", () => expect(validateCorrection(before, after, " ", true)).not.toBeNull());
  it("requires explicit confirmation", () => expect(validateCorrection(before, after, "Error de carga", false)).not.toBeNull());
  it("rejects unchanged corrections", () => expect(validateCorrection(before, before, "Error", true)).not.toBeNull());
  it("rejects pending receipt with a date", () => expect(validateCorrection(before, { ...after, recepcion_fecha: "2026-10-31T03:12:31Z" }, "Error", true)).not.toBeNull());
  it("requires a date for declared receipt", () => expect(validateCorrection(before, { ...after, recepcion_estado: "recibida" }, "Error", true)).not.toBeNull());
  it("accepts administrative changes without mutating operational identity", () => {
    const original = structuredClone(pending);
    expect(validateCorrection(before, after, "Error de carga", true)).toBeNull();
    expect(pending).toEqual(original); expect(correctionChanges(before, after)).toEqual({ comentario: "Dato corregido" });
  });
  it("closed Gustavo-like case keeps physical L and XL while overlay declares corrections", () => {
    const c = { ...pending, estado: "entregado", stock_devuelto_at: "2026-10-11", variante_destino: { Talle: "XL", Color: "Blanco" }, correccion_administrativa: { variante_destino: { Talle: "L", Color: "Blanco" } } };
    expect(correctionBaseline(c).variante_destino).toEqual({ Talle: "L", Color: "Blanco" });
    expect(c.variante_destino).toEqual({ Talle: "XL", Color: "Blanco" });
    expect(correctionStage(c)).toContain("Cerrado");
  });
  it("Marcelo-like empty original never inherits replacement M", () => {
    expect(correctionBaseline({ ...pending, variante_origen: {}, variante_destino: { Talle: "M" }, stock_devuelto_at: "2026-10-09" }).variante_origen).toEqual({});
  });
});