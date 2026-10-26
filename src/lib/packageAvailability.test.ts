import { describe, expect, it } from "vitest";
import { normalizeRoomGender } from "./packageAvailability";
describe("normalizeRoomGender", () => {
  it("maps lodging labels to booking genders", () => {
    expect(normalizeRoomGender("mujeres")).toBe("femenina");
    expect(normalizeRoomGender("varones")).toBe("masculina");
    expect(normalizeRoomGender("mixto")).toBe("mixta");
    expect(normalizeRoomGender(null)).toBe("mixta");
  });
});
