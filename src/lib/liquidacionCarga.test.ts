import { describe, it, expect } from "vitest";
import { derivarTipo, itemTotal, itemValido, nuevoItem, toPayload, VIATICO_DEFAULT } from "./liquidacionCarga";

const hon = [{ id: "h1", nombre: "Planillas", categoria: "otro", valor: 27500 }];

describe("liquidacionCarga", () => {
  it("deriva tipos desde el nombre del honorario", () => {
    expect(derivarTipo("Planillas")).toBe("planilla");
    expect(derivarTipo("Reunión de staff 1h")).toBe("reunion_staff");
    expect(derivarTipo("Pista 2hs")).toBe("grupal_2h");
    expect(derivarTipo("Grupal 1h30 Maximales/Barrancas")).toBe("grupal_1h30");
    expect(derivarTipo("Extensión fondo +30 min")).toBe("extension_fondo");
    expect(derivarTipo(null)).toBe("reintegro");
  });

  it("viático por defecto editable y total = honorario + reintegros", () => {
    const it0 = { ...nuevoItem("2026-10"), honorario_id: "h1", estacionamiento: "1500" };
    expect(it0.viaticos).toBe(String(VIATICO_DEFAULT));
    expect(itemTotal(it0, hon)).toBe(27500 + 6000 + 1500);
  });

  it("valida mes y filas vacías", () => {
    const base = { ...nuevoItem("2026-10"), fecha: "2026-09-30" };
    expect(itemValido(base, "2026-10")).toMatch(/mes/);
    expect(itemValido({ ...base, fecha: "2026-10-03", viaticos: "" }, "2026-10")).toMatch(/concepto/);
    expect(itemValido({ ...base, fecha: "2026-10-03", entrada: "-1" }, "2026-10")).toMatch(/negativos/);
  });

  it("el payload nunca envía el valor del honorario", () => {
    const p = toPayload([{ ...nuevoItem("2026-10"), honorario_id: "h1" }], hon)[0] as Record<string, unknown>;
    expect(p.valor_base).toBeUndefined();
    expect(p.tipo_actividad).toBe("planilla");
  });
});
