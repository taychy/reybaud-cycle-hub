import { describe, it, expect } from "vitest";
import { elegirEmisorSugerido } from "./invoiceEmisor";

const A = ["scarlett", "claudio", "josilene"];

describe("elegirEmisorSugerido", () => {
  it("override del cobro gana", () => {
    expect(elegirEmisorSugerido({ emisor_override_id: "josilene", emisor_resuelto_id: "claudio" }, null, A))
      .toEqual({ emisorId: "josilene", origen: "override" });
  });
  it("viajes: usa emisor resuelto del cobro", () => {
    expect(elegirEmisorSugerido({ emisor_resuelto_id: "scarlett" }, null, A))
      .toEqual({ emisorId: "scarlett", origen: "cobro" });
  });
  it("escuela sin cola: usa la regla central", () => {
    expect(elegirEmisorSugerido(null, { emisor_id: "claudio" }, A))
      .toEqual({ emisorId: "claudio", origen: "regla" });
  });
  it("sin datos: sin determinar, nunca el primero activo", () => {
    const r = elegirEmisorSugerido(null, { emisor_id: null, motivo: "requiere_revision_emisor: x" }, A);
    expect(r.emisorId).toBeNull();
  });
  it("ignora emisores inactivos", () => {
    expect(elegirEmisorSugerido({ emisor_resuelto_id: "viejo" }, null, A).emisorId).toBeNull();
  });
});
