import { describe, it, expect } from "vitest";
import {
  fxBuyFromReference,
  fxSellFromReference,
  FX_DEFAULT_BUY_ADJUST,
  FX_DEFAULT_SELL_MARGIN,
} from "./fx";

describe("Cotización Reybaud", () => {
  it("compra con ajuste positivo suma sobre la referencia", () => {
    expect(fxBuyFromReference(1000, 0.5)).toBe(1005);
    expect(fxBuyFromReference(1000, 4)).toBe(1040);
  });

  it("compra con ajuste negativo resta sobre la referencia", () => {
    expect(fxBuyFromReference(1000, -0.5)).toBe(995);
    expect(fxBuyFromReference(200, -10)).toBe(180);
  });

  it("compra con ajuste cero devuelve la referencia", () => {
    expect(fxBuyFromReference(1234.5, 0)).toBe(1234.5);
  });

  it("venta aplica recargo positivo", () => {
    expect(fxSellFromReference(1000, 3.5)).toBe(1035);
    expect(fxSellFromReference(1000, 11)).toBe(1110);
  });

  it("usa los valores operativos por defecto", () => {
    expect(FX_DEFAULT_BUY_ADJUST).toEqual({ USD: 0.5, EUR: 4, BRL: -0.5 });
    expect(FX_DEFAULT_SELL_MARGIN).toEqual({ USD: 3.5, EUR: 11, BRL: 11 });
    expect(fxBuyFromReference(1500, FX_DEFAULT_BUY_ADJUST.BRL)).toBe(1492.5);
    expect(fxSellFromReference(1500, FX_DEFAULT_SELL_MARGIN.USD)).toBe(1552.5);
  });
});
