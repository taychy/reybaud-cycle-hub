import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { controlledPoolAvailability, fetchPackagesAvailability, normalizeRoomGender } from "./packageAvailability";
import type { BookingOpening } from "./eventBookingOpening";
describe("normalizeRoomGender", () => {
  it("maps lodging labels to booking genders", () => {
    expect(normalizeRoomGender("mujeres")).toBe("femenina");
    expect(normalizeRoomGender("varones")).toBe("masculina");
    expect(normalizeRoomGender("mixto")).toBe("mixta");
    expect(normalizeRoomGender(null)).toBe("mixta");
  });
});

describe("shared controlled booking pool", () => {
  const opening: BookingOpening = { controlled: true, enabled: true, ready: true, capacity: 20, available: 15, deposit: 500, installments: 8, blockers: [] };
  const ids = ["bike", "own-bike", "alps-bike", "alps-own-bike"];
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: ids.map(id => ({ id, event_id: "event" })), error: null }) }) });
  });
  it("uses one 20-person pool with five pending reservations across all four modalities, without rooms", async () => {
    mocks.rpc.mockResolvedValue({ data: opening, error: null });
    const availability = await fetchPackagesAvailability(ids);
    for (const id of ids) expect(availability[id]).toEqual([{ tipo: "pool", genero: "mixta", capacity: 20, taken: 5, available: 15 }]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("event_booking_opening_status", { p_event_id: "event" });
  });
  it("reduces every modality after one further reservation regardless of assignment", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...opening, available: 14 }, error: null });
    const availability = await fetchPackagesAvailability(ids);
    for (const id of ids) expect(availability[id][0].available).toBe(14);
  });
  it("does not require a gender or partner for the shared commercial pool", () => {
    expect(controlledPoolAvailability(opening)[0].genero).toBe("mixta");
    expect(controlledPoolAvailability(opening)[0].tipo).toBe("pool");
  });
  it.each([{ enabled: false }, { ready: false }, { available: 0 }])("blocks closed, unready or full pools: %j", flags => {
    expect(controlledPoolAvailability({ ...opening, ...flags })[0].available).toBe(0);
  });
  it("fails closed on opening errors rather than offering physical room capacity", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    const availability = await fetchPackagesAvailability(ids);
    expect(availability.bike).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves room availability for an ordinary event", async () => {
    mocks.rpc.mockImplementation(async name => name === "event_booking_opening_status"
      ? { data: { controlled: false }, error: null }
      : { data: [{ tipo: "triple", genero: "mujeres", capacity: 3, taken: 2, available: 1 }], error: null });
    const availability = await fetchPackagesAvailability(["bike"]);
    expect(availability.bike).toEqual([{ tipo: "triple", genero: "femenina", capacity: 3, taken: 2, available: 1 }]);
  });
});
