import { describe, it, expect } from "vitest";
import { suggestRefund, refundEstado } from "./cancellationRefund";

const rules = { sena_monto: 100000, tramos: [{ dias_minimos: 30, porcentaje: 100, base: "excedente_sena" }, { dias_minimos: 15, porcentaje: 50, base: "excedente_sena" }] };

describe("cancellationRefund", () => {
  it("A: sin pagos → no_corresponde $0", () => {
    const s = suggestRefund({ bruto: 0, eventDate: "2026-12-01", cancelDate: "2026-10-05", snapshot: null, eventMetadata: {} });
    expect(s.estado).toBe("no_corresponde");
    expect(s.sugerido).toBe(0);
  });
  it("B: regla inequívoca del snapshot → pendiente con monto", () => {
    const s = suggestRefund({ bruto: 400000, eventDate: "2026-11-10", cancelDate: "2026-10-05", snapshot: { cancellation_rules: rules }, eventMetadata: {} });
    expect(s.estado).toBe("pendiente");
    expect(s.sugerido).toBe(300000);
    expect(s.retenido).toBe(100000);
    expect(s.fuente).toBe("snapshot");
  });
  it("B2: tramo intermedio y snapshot gana sobre evento", () => {
    const s = suggestRefund({ bruto: 400000, eventDate: "2026-10-25", cancelDate: "2026-10-05", snapshot: { cancellation_rules: rules }, eventMetadata: { cancellation_rules: { tramos: [{ dias_minimos: 0, porcentaje: 100, base: "total" }] } } });
    expect(s.sugerido).toBe(150000);
  });
  it("C/D: parcial y completada según lo devuelto", () => {
    expect(refundEstado(300000, 100000, "pendiente")).toBe("parcial");
    expect(refundEstado(300000, 300000, "parcial")).toBe("completada");
    expect(refundEstado(300000, 0, "pendiente")).toBe("pendiente");
  });
  it("E: política solo en texto → revision_manual con el texto", () => {
    const s = suggestRefund({ bruto: 250000, eventDate: "2026-10-22", cancelDate: "2026-10-05", snapshot: { politica_cancelacion: "Se evaluará según proveedores." }, eventMetadata: {} });
    expect(s.estado).toBe("revision_manual");
    expect(s.politicaTexto).toContain("proveedores");
    expect(refundEstado(0, 0, "revision_manual")).toBe("revision_manual");
  });
});
