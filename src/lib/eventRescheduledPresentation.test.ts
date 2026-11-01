import { describe, expect, it } from "vitest";
import { eventRescheduledPresentation, externalTripRescheduledPresentation } from "./eventRescheduledPresentation";
import type { ReschedulingContext } from "./rescheduling";
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

describe("external trip current dates", () => {
  const context = (choice: string, review_status = "validada", reservation_id = "own"): ReschedulingContext => ({
    available: true,
    campaign: { event_id: id, proposed_start: "2026-11-05", proposed_end: "2026-11-09", options: [
      { value: "attend_5_8", start: "2026-11-05", end: "2026-11-08" },
      { value: "attend_6_9", start: "2026-11-06", end: "2026-11-09" },
      { value: "attend_5_9", start: "2026-11-05", end: "2026-11-09" },
    ] }, reservations: [{ reservation_id, request: { choice, review_status } }],
  } as ReschedulingContext);
  it("shows November 5–9 even while the secure context is unavailable", () => {
    expect(externalTripRescheduledPresentation(id, "own")?.start).toBe("2026-11-05");
    expect(externalTripRescheduledPresentation(id, "own")?.end).toBe("2026-11-09");
    expect(externalTripRescheduledPresentation(id, "own")?.participantDateLabel).toBeNull();
  });
  it.each([
    ["attend_5_8", "5 al 8 de noviembre de 2026"],
    ["attend_6_9", "6 al 9 de noviembre de 2026"],
    ["attend_5_9", "5 al 9 de noviembre de 2026"],
  ])("uses only the validated %s window", (choice, expected) => {
    expect(externalTripRescheduledPresentation(id, "own", context(choice))?.participantDateLabel).toBe(expected);
  });
  it("does not invent dates for pending requests, other participants or refunds", () => {
    expect(externalTripRescheduledPresentation(id, "own", context("attend_5_8", "pendiente"))?.participantDateLabel).toBeNull();
    expect(externalTripRescheduledPresentation(id, "own", context("attend_5_8", "validada", "other"))?.participantDateLabel).toBeNull();
    expect(externalTripRescheduledPresentation(id, "own", context("refund"))?.participantDateLabel).toBeNull();
  });
  it("rejects mismatched campaign windows without mutating context", () => {
    const ctx = context("attend_5_8");
    if (!ctx.campaign) throw new Error("Missing fixture campaign");
    ctx.campaign.proposed_start = "2026-10-22";
    const before = JSON.stringify(ctx);
    expect(externalTripRescheduledPresentation(id, "own", ctx)?.participantDateLabel).toBeNull();
    expect(JSON.stringify(ctx)).toBe(before);
    expect(externalTripRescheduledPresentation("other", "own", ctx)).toBeNull();
  });
});