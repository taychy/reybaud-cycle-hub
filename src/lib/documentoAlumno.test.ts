import { describe, it, expect } from "vitest";
import { checkDocumento, formatDocumento, normalizeTipoDocumento } from "./documentoAlumno";
import { resolveFiscalIdentity } from "./fiscalIdentity";

describe("checkDocumento", () => {
  it("DNI válido de 7 u 8 dígitos", () => {
    expect(checkDocumento("33.292.577", "dni")).toEqual({ value: "33292577", error: null, suggestTipo: null });
    expect(checkDocumento("1234567", "dni").error).toBeNull();
  });
  it("DNI con longitud inválida", () => {
    expect(checkDocumento("123456789", "dni").error).toMatch(/7 u 8/);
  });
  it("CUIT válido escrito con tipo DNI sugiere CUIT/CUIL", () => {
    const r = checkDocumento("20332925777", "dni");
    expect(r.suggestTipo).toBe("cuit");
    expect(r.error).not.toBeNull();
  });
  it("CUIT con checksum inválido no pasa", () => {
    expect(checkDocumento("20332925778", "cuit").error).toMatch(/verificador/);
  });
  it("CUIT válido pasa y no queda inconsistente en facturación", () => {
    const r = checkDocumento("20-33292577-7", "cuit");
    expect(r.error).toBeNull();
    expect(resolveFiscalIdentity(r.value, "cuit").inconsistente).toBe(false);
  });
  it("texto inválido", () => {
    expect(checkDocumento("abc", "dni").error).not.toBeNull();
  });
  it("vacío es válido (opcional)", () => {
    expect(checkDocumento("", "cuit").error).toBeNull();
  });
});

describe("formato", () => {
  it("formatea CUIT", () => {
    expect(formatDocumento("20332925777", "cuit")).toBe("CUIT/CUIL 20-33292577-7");
    expect(formatDocumento("33292577", "dni")).toBe("DNI 33292577");
    expect(normalizeTipoDocumento("cuil")).toBe("cuit");
  });
});
