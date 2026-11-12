import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingOtpState, loadPendingOtpState, savePendingOtpState } from "./pendingOtp";

describe("Contexto de registro por email", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mantiene separado el registro del acceso principal", () => {
    savePendingOtpState({ email: "persona@example.test", returnTo: "/registro", context: "registration" });
    expect(loadPendingOtpState("registration")?.email).toBe("persona@example.test");
    expect(loadPendingOtpState("main")).toBeNull();
    expect(loadPendingOtpState("staff")).toBeNull();
  });

  it("permite descartar el código pendiente", () => {
    savePendingOtpState({ email: "persona@example.test", returnTo: "/registro", context: "registration" });
    clearPendingOtpState();
    expect(loadPendingOtpState()).toBeNull();
  });
});
