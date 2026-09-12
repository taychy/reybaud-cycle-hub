import { describe, it, expect } from "vitest";
import {
  resolveFiscalIdentity,
  isCuitValido,
  fiscalDocDigits,
  puedeEmitirFactura,
  fiscalWarningLabel,
  fiscalDisplayName,
} from "./fiscalIdentity";

describe("fiscalDocDigits", () => {
  it("acepta números con separadores", () => {
    expect(fiscalDocDigits("20-25966471-4")).toBe("20259664714");
    expect(fiscalDocDigits(" 12.345.678 ")).toBe("12345678");
  });
  it("rechaza texto, URLs y paréntesis", () => {
    expect(fiscalDocDigits("https://x.com/12345678")).toBeNull();
    expect(fiscalDocDigits("12345678 (papá)")).toBeNull();
    expect(fiscalDocDigits("DNI 12345678")).toBeNull();
    expect(fiscalDocDigits("")).toBeNull();
    expect(fiscalDocDigits(null)).toBeNull();
  });
});

describe("isCuitValido", () => {
  it("valida dígito verificador", () => {
    expect(isCuitValido("20259664714")).toBe(true);
    expect(isCuitValido("27180587662")).toBe(true);
    expect(isCuitValido("20259664715")).toBe(false);
    expect(isCuitValido("2725419116")).toBe(false); // 10 dígitos
  });
});

describe("resolveFiscalIdentity", () => {
  it("CUIT válido => DocTipo 80", () => {
    const r = resolveFiscalIdentity("20-36170782-7", "cuit");
    expect(r).toMatchObject({ clase: "ok", docTipo: 80, docNro: "20361707827", inconsistente: false });
  });

  it("DNI de 7 u 8 dígitos => DocTipo 96", () => {
    expect(resolveFiscalIdentity("1234567", "dni")).toMatchObject({ clase: "ok", docTipo: 96 });
    expect(resolveFiscalIdentity("30123456", "dni")).toMatchObject({ clase: "ok", docTipo: 96 });
  });

  it("tipo_documento=dni con CUIT válido: marca inconsistencia pero emite como CUIT", () => {
    const r = resolveFiscalIdentity("20259664714", "dni");
    expect(r.clase).toBe("ok");
    expect(r.docTipo).toBe(80);
    expect(r.inconsistente).toBe(true);
    expect(puedeEmitirFactura(r)).toBe(true);
  });

  it("documento vacío o nulo bloquea (caso Laura Palermo)", () => {
    for (const v of [null, undefined, "", "   "]) {
      const r = resolveFiscalIdentity(v as any, "dni");
      expect(r.clase).toBe("documento_faltante");
      expect(puedeEmitirFactura(r)).toBe(false);
      expect(fiscalWarningLabel(r)).toBe("⚠ Datos fiscales incompletos");
    }
  });

  it("10 dígitos bloquea (caso María Cecilia Pauttazzo)", () => {
    const r = resolveFiscalIdentity("2725419116", "dni");
    expect(r.clase).toBe("documento_invalido");
    expect(puedeEmitirFactura(r)).toBe(false);
    expect(r.mensaje).toContain("10 dígitos");
  });

  it("9 dígitos bloquea", () => {
    expect(resolveFiscalIdentity("123456789").clase).toBe("documento_invalido");
  });

  it("URL o texto con número embebido bloquea (no se extrae)", () => {
    expect(resolveFiscalIdentity("http://foo/20259664714").clase).toBe("documento_invalido");
    expect(resolveFiscalIdentity("20259664714 (papá)").clase).toBe("documento_invalido");
  });

  it("CUIT de 11 dígitos con DV inválido bloquea", () => {
    const r = resolveFiscalIdentity("20259664715");
    expect(r.clase).toBe("documento_invalido");
    expect(r.mensaje).toContain("dígito verificador");
  });

  it("casos que deben seguir funcionando", () => {
    expect(resolveFiscalIdentity("20361707827", "dni").docTipo).toBe(80); // Nicolás Iglesini
    expect(resolveFiscalIdentity("27180587662", "dni").docTipo).toBe(80); // Ingrid Epp
    expect(resolveFiscalIdentity("20259664714", "dni").docTipo).toBe(80); // Emiliano Grosso
  });
});

describe("fiscalDisplayName", () => {
  it("prefiere nombre fiscal", () => {
    expect(fiscalDisplayName({ nombre_fiscal: "Reybaud SRL", nombre: "Ana", apellido: "Paz" })).toBe("Reybaud SRL");
    expect(fiscalDisplayName({ nombre: "Ana", apellido: "Paz" })).toBe("Ana Paz");
    expect(fiscalDisplayName({})).toBeNull();
  });
});
