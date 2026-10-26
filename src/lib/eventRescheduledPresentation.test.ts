import { describe, expect, it } from "vitest";
import { eventRescheduledPresentation } from "./eventRescheduledPresentation";
const id = "67b4e85d-b00b-4b74-9644-99458d948c65";
describe("rescheduling presentation isolation", () => {
  it("uses the verified November 5–9 window without changing stored October dates", () => {
    const stored = { id, date: "2026-10-22", end_date: "2026-10-25" };
    expect(eventRescheduledPresentation(stored.id)?.start).toBe("2026-11-05");
    expect(eventRescheduledPresentation(stored.id)?.end).toBe("2026-11-09");
    expect(stored.date).toBe("2026-10-22");
    expect(stored.end_date).toBe("2026-10-25");
  });
  it("opens sale of approved released places", () => {
    expect(eventRescheduledPresentation(id)?.newPlacesApproved).toBe(true);
  });
  it("leaves other events untouched", () => {
    expect(eventRescheduledPresentation("other")).toBeNull();
    expect(eventRescheduledPresentation(undefined)).toBeNull();
  });
});