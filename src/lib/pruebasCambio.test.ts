import { describe, it, expect } from "vitest";
import { itemsElegiblesParaCambio, preseleccionItemCambio, labelItemCambio } from "./pruebasCambio";

const items = [
  { id: "a", product_id: "p1", product_name: "Jersey", variant_selection: { Talle: "M" } },
  { id: "b", product_id: null, product_name: "Ítem libre" },
  { id: "c", product_id: "p2", product_name: "Calza" },
];

describe("pruebasCambio", () => {
  it("descarta ítems sin producto y la propia prueba", () => {
    expect(itemsElegiblesParaCambio(items).map((i) => i.id)).toEqual(["a", "c"]);
    expect(itemsElegiblesParaCambio(items, "c").map((i) => i.id)).toEqual(["a"]);
  });

  it("no preselecciona cuando hay más de un ítem elegible", () => {
    expect(preseleccionItemCambio(items)).toBe("");
  });

  it("preselecciona sólo si hay exactamente uno", () => {
    expect(preseleccionItemCambio(items, "c")).toBe("a");
    expect(preseleccionItemCambio([])).toBe("");
  });

  it("etiqueta producto + variante", () => {
    expect(labelItemCambio(items[0])).toBe("Jersey — Talle: M");
    expect(labelItemCambio(items[2])).toBe("Calza");
  });
});
