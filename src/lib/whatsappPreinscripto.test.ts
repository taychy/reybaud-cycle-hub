import { describe, it, expect } from "vitest";
import { normalizePhoneAr, buildWaLink, buildPreinscriptoWaMessage } from "./whatsappPreinscripto";

describe("normalizePhoneAr", () => {
  it("convierte celular local con 15 a internacional", () => {
    expect(normalizePhoneAr("11 15 1234 5678")).toBe("5491112345678");
  });
  it("convierte celular local sin 15", () => {
    expect(normalizePhoneAr("11-1234-5678")).toBe("5491112345678");
  });
  it("quita el 0 inicial", () => {
    expect(normalizePhoneAr("011 1234-5678")).toBe("5491112345678");
  });
  it("respeta +54 ya internacional", () => {
    expect(normalizePhoneAr("+54 9 11 1234 5678")).toBe("5491112345678");
  });
  it("respeta otro código de país con +", () => {
    expect(normalizePhoneAr("+1 555 123 4567")).toBe("15551234567");
  });
  it("agrega 9 a 54 sin prefijo internacional", () => {
    expect(normalizePhoneAr("54 11 1234 5678")).toBe("5491112345678");
  });
  it("rechaza vacío o inválido", () => {
    expect(normalizePhoneAr(null)).toBeNull();
    expect(normalizePhoneAr("")).toBeNull();
    expect(normalizePhoneAr("123")).toBeNull();
    expect(normalizePhoneAr("abc")).toBeNull();
  });
});

describe("buildWaLink", () => {
  it("arma wa.me con texto encodeado", () => {
    const link = buildWaLink("5491112345678", "Hola Ana");
    expect(link.startsWith("https://wa.me/5491112345678?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1])).toBe("Hola Ana");
  });
});

describe("buildPreinscriptoWaMessage", () => {
  it("usa el primer nombre y no incluye link si no hay", () => {
    const m = buildPreinscriptoWaMessage({ nombre: "María Pérez" });
    expect(m.startsWith("Hola María,")).toBe(true);
    expect(m).toContain("$153.000 o 2 cuotas de $82.500 hasta el 16/10");
    expect(m).toContain("KDT o Parque Sarmiento");
    expect(m).not.toContain("link personal");
  });
  it("agrega el link personal al final cuando existe", () => {
    const m = buildPreinscriptoWaMessage({ nombre: "Ana", linkPersonal: "https://reybaud-app.com/x?beneficio=tok" });
    expect(m.endsWith("Tu link personal es: https://reybaud-app.com/x?beneficio=tok")).toBe(true);
  });
});
