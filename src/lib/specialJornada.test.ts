import { describe, expect, it } from "vitest";
import { getSpecialJornada } from "./specialJornada";

describe("getSpecialJornada", () => {
  it("returns the legacy Scott path", () => {
    expect(getSpecialJornada({ school_subtype: "jornada_especial", special_jornada: { slug: "scott-28-noviembre", path: "/scott-28-noviembre" } }))
      .toEqual({ slug: "scott-28-noviembre", path: "/scott-28-noviembre" });
  });
  it("defaults to /jornada/<slug> for future jornadas", () => {
    expect(getSpecialJornada({ school_subtype: "jornada_especial", special_jornada: { slug: "taller-frenos" } })?.path).toBe("/jornada/taller-frenos");
  });
  it("rejects external or checkout destinations", () => {
    expect(getSpecialJornada({ school_subtype: "jornada_especial", special_jornada: { slug: "x-y", path: "https://evil.com" } })?.path).toBe("/jornada/x-y");
    expect(getSpecialJornada({ school_subtype: "jornada_especial", special_jornada: { slug: "../checkout" } })).toBeNull();
  });
  it("ignores normal events", () => {
    expect(getSpecialJornada({ event_nature: "propio_con_reserva" })).toBeNull();
    expect(getSpecialJornada(null)).toBeNull();
  });
});
