import { describe, expect, it } from "vitest";
import { premiumDateSummary } from "./premiumEventSummary";

describe("premium date summary", () => {
  const event = { date: "2027-06-21", end_date: "2027-06-28", duration_days: 8, metadata: {} };
  it("shows a confirmed complete range", () => expect(premiumDateSummary(event)).toEqual({ label: "21 de junio de 2027 — 28 de junio de 2027", conflict: false }));
  it("does not invent an end date from duration", () => expect(premiumDateSummary({ ...event, end_date: "2027-06-21" })).toEqual({ label: "Fechas a confirmar", conflict: true }));
  it("respects the explicit unconfirmed flag", () => expect(premiumDateSummary({ ...event, metadata: { dates_tbd: true } }).label).toBe("Fechas a confirmar"));
  it("rejects invalid and reversed dates", () => {
    expect(premiumDateSummary({ ...event, date: "2027-02-30" }).conflict).toBe(true);
    expect(premiumDateSummary({ ...event, end_date: "2027-06-20" }).conflict).toBe(true);
  });
});