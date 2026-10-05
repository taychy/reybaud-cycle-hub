import { describe, it, expect } from "vitest";
import { decideUpdateAction } from "./appUpdate";

describe("decideUpdateAction", () => {
  it("no hace nada si coincide o no hay dato", () => {
    expect(decideUpdateAction("a", "a", null)).toBe("none");
    expect(decideUpdateAction("a", null, null)).toBe("none");
  });
  it("recarga automáticamente ante versión nueva", () => {
    expect(decideUpdateAction("a", "b", null)).toBe("auto-reload");
    expect(decideUpdateAction("a", "b", { target: "b", count: 1 })).toBe("auto-reload");
  });
  it("bloquea tras agotar intentos para la misma versión (anti-loop)", () => {
    expect(decideUpdateAction("a", "b", { target: "b", count: 2 })).toBe("blocking");
  });
  it("reinicia intentos si la versión destino cambia", () => {
    expect(decideUpdateAction("a", "c", { target: "b", count: 5 })).toBe("auto-reload");
  });
});
