import { describe, expect, it } from "vitest";
import {
  buildVariantKey,
  calcularDiferencia,
  esSustitucionFaltaStock,
  stockDeSeleccion,
  variantesDisponibles,
} from "./faltaStock";

describe("calcularDiferencia", () => {
  it("reemplazo más caro ofrece cobrar o absorber", () => {
    const r = calcularDiferencia(100000, 1, 120000);
    expect(r.diferencia).toBe(20000);
    expect(r.opciones).toEqual(["cobrar_diferencia", "absorbe_reybaud"]);
  });

  it("reemplazo más barato ofrece saldo a favor o devolución", () => {
    const r = calcularDiferencia(168064.9, 1, 150000);
    expect(r.original).toBe(168064.9);
    expect(r.diferencia).toBe(-18064.9);
    expect(r.opciones).toEqual(["saldo_a_favor", "devolucion"]);
  });

  it("mismo precio no requiere ajuste y multiplica por cantidad", () => {
    const r = calcularDiferencia(1000, 3, 1000);
    expect(r.original).toBe(3000);
    expect(r.reemplazo).toBe(3000);
    expect(r.opciones).toEqual(["sin_ajuste"]);
  });
});

describe("buildVariantKey", () => {
  it("usa el orden declarado del producto", () => {
    const key = buildVariantKey(
      [{ name: "Talle" }, { name: "Color" }],
      { Color: "Negro", Talle: "L" },
    );
    expect(key).toBe("Talle:L|Color:Negro");
  });

  it("sin variantes declaradas ordena alfabéticamente", () => {
    expect(buildVariantKey(null, { Color: "Negro", Talle: "L" })).toBe("Color:Negro|Talle:L");
  });

  it("sin selección devuelve null", () => {
    expect(buildVariantKey([{ name: "Talle" }], {})).toBeNull();
  });
});

describe("stock disponible", () => {
  const prod = {
    variants: [{ name: "Talle" }],
    variant_stock: { "Talle:L": -1, "Talle:M": 2, "Talle:S": 0 },
  };

  it("sólo lista variantes con stock real positivo", () => {
    expect(variantesDisponibles(prod)).toEqual([{ key: "Talle:M", stock: 2 }]);
  });

  it("devuelve el stock exacto de la selección, incluso negativo", () => {
    expect(stockDeSeleccion(prod, { Talle: "L" })).toBe(-1);
    expect(stockDeSeleccion(prod, { Talle: "M" })).toBe(2);
  });
});

describe("esSustitucionFaltaStock", () => {
  it("distingue la sustitución del resto de los cambios", () => {
    expect(esSustitucionFaltaStock({ tipo: "sustitucion_falta_stock" })).toBe(true);
    expect(esSustitucionFaltaStock({ tipo: "prueba" })).toBe(false);
    expect(esSustitucionFaltaStock(null)).toBe(false);
  });
});
