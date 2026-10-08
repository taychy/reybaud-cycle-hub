import { describe, it, expect } from "vitest";
import { isEventDateTbd } from "./eventDates";

describe("isEventDateTbd", () => {
  it("solo con dates_tbd === true", () => {
    expect(isEventDateTbd({ dates_tbd: true })).toBe(true);
    expect(isEventDateTbd({ dates_tbd: "true" })).toBe(false);
    expect(isEventDateTbd({})).toBe(false);
    expect(isEventDateTbd(null)).toBe(false);
    expect(isEventDateTbd(undefined)).toBe(false);
  });
});
