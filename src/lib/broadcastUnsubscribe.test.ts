import { describe, it, expect } from "vitest";
import { isValidUnsubscribeToken } from "./broadcastUnsubscribe";

describe("isValidUnsubscribeToken", () => {
  it("acepta un token de 64 caracteres hexadecimales", () => {
    expect(isValidUnsubscribeToken("a".repeat(64))).toBe(true);
    expect(isValidUnsubscribeToken("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("rechaza tokens nulos, vacíos o ausentes", () => {
    expect(isValidUnsubscribeToken(null)).toBe(false);
    expect(isValidUnsubscribeToken(undefined)).toBe(false);
    expect(isValidUnsubscribeToken("")).toBe(false);
  });

  it("rechaza tokens con longitud incorrecta", () => {
    expect(isValidUnsubscribeToken("a".repeat(63))).toBe(false);
    expect(isValidUnsubscribeToken("a".repeat(65))).toBe(false);
  });

  it("rechaza caracteres no hexadecimales o mayúsculas", () => {
    expect(isValidUnsubscribeToken("g".repeat(64))).toBe(false);
    expect(isValidUnsubscribeToken("A".repeat(64))).toBe(false);
    expect(isValidUnsubscribeToken("a".repeat(32) + "!" + "a".repeat(31))).toBe(false);
  });
});
