import { describe, expect, it } from "vitest";
import { returnIdentityDiffers, validateReturnReceipt } from "./storeReturnReceipt";

describe("physical return identity", () => {
  const original = { productId: "original", variante: { Talle: "L", Color: "Blanco" } };
  it("accepts the ORIGINAL and original variant, not the replacement", () => {
    expect(validateReturnReceipt(original, "original", original.variante)).toBeNull();
    expect(returnIdentityDiffers({ productId: "replacement", variante: { Talle: "XL" } }, "original", original.variante)).toBe(true);
  });
  it("requires a discrepancy reason for a different physical product", () => {
    expect(validateReturnReceipt({ ...original, productId: "other" }, "original", original.variante)).not.toBeNull();
    expect(validateReturnReceipt({ ...original, productId: "other" }, "original", original.variante, "Prenda distinta recibida")).toBeNull();
  });
  it("requires a reason for a different physical variant", () => {
    expect(validateReturnReceipt({ ...original, variante: { Talle: "XL" } }, "original", original.variante)).not.toBeNull();
  });
  it("blocks correction of an existing stock entry even with a reason", () => {
    expect(validateReturnReceipt({ ...original, productId: "other" }, "original", original.variante, "Discrepancia", true)).not.toBeNull();
    expect(validateReturnReceipt(original, "original", original.variante, "", true)).toBeNull();
  });
  it("does not invent a missing original variant", () => {
    expect(validateReturnReceipt(original, "original", {})).toBeNull();
    expect(validateReturnReceipt(null, "original", {})).not.toBeNull();
  });
});