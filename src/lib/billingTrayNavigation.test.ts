import { afterEach, describe, expect, it, vi } from "vitest";
import { billingStudentLink, listenForBillingReturn, readBillingNavigation, updateBillingNavigation } from "./billingTrayNavigation";

afterEach(() => vi.useRealTimers());

describe("billing navigation", () => {
  it.each(["todos", "escuela", "viajes", "tienda"])("restores origin %s and excluded search from the URL", (origin) => {
    const params = new URLSearchParams(`origen=${origin}&estado=excluida&q=Natalia&tab=historial`);
    expect(readBillingNavigation(params)).toEqual({ origen: origin, estado: "excluida", search: "Natalia", tab: "historial" });
    const next = updateBillingNavigation(params, "tab", "pendientes");
    expect(readBillingNavigation(new URLSearchParams(next.toString()))).toEqual({ origen: origin, estado: "excluida", search: "Natalia", tab: "pendientes" });
  });
  it("validates values and preserves unrelated deep-link parameters", () => {
    const params = new URLSearchParams("tab=other&origen=wrong&estado=emitida&from=dashboard");
    expect(readBillingNavigation(params)).toEqual({ tab: "pendientes", origen: "todos", estado: "pendiente", search: "" });
    expect(updateBillingNavigation(params, "q", "Ana & Luis").get("from")).toBe("dashboard");
    expect(updateBillingNavigation(params, "q", "").has("q")).toBe(false);
  });
  it("opens only the exact student in a separate safe tab", () => {
    expect(billingStudentLink("2f0a26ff-0e42-483d-8f38-eab211fb63d0")).toEqual({
      to: "/admin/alumnos?alumno=2f0a26ff-0e42-483d-8f38-eab211fb63d0", target: "_blank", rel: "noopener noreferrer",
    });
  });
  it("deduplicates focus/visibility, ignores hidden events and cleans up", () => {
    vi.useFakeTimers();
    let visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
    const refresh = vi.fn();
    const stop = listenForBillingReturn(refresh);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(150);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility = "visible";
    window.dispatchEvent(new Event("focus"));
    stop();
    vi.advanceTimersByTime(200);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});