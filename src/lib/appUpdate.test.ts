import { describe, it, expect, vi, afterEach } from "vitest";
import { decideUpdateAction, getAppLaunchDestination, requiresSurveyUpdateCheck, wantsFoodSurvey, getCacheBustedUrl, stripCacheBustParam, fetchDeployedBuildId, recordAttempt, readAttempt, clearAttempts } from "./appUpdate";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearAttempts(); });

describe("enlaces de encuesta y PWA instalada", () => {
  const origin = "https://reybaud-app.com";
  it.each(["/viaje/encuesta-gastronomica?evento=event", "/viaje/mi-reserva?token=fixture-private&encuesta=gastronomia#form", "/formacion-inicial?cohort=c", "/preinscripcion/plan?beneficio=b"])("abre exactamente el destino permitido %s", (path) => {
    expect(getAppLaunchDestination(origin + path, origin)).toBe(path);
  });
  it.each(["https://other.example/viaje/mi-reserva?token=fixture", origin + "/viaje/mi-reserva-otra", origin + "/admin/eventos", "not-a-url"])("rechaza destino no autorizado %s", (url) => {
    expect(getAppLaunchDestination(url, origin)).toBeNull();
  });
  it("chequea encuesta general y personal inmediatamente, no otras rutas", () => {
    expect(requiresSurveyUpdateCheck("/viaje/encuesta-gastronomica", "?evento=e")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture&encuesta=gastronomia")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture&step=gastronomia")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture")).toBe(false);
    expect(wantsFoodSurvey("?step=pagos")).toBe(false);
  });
  it("recarga mantiene token, query y hash; limpieza técnica mantiene sesión", () => {
    const path = "/viaje/mi-reserva?token=fixture-private&encuesta=gastronomia&otro=1#form";
    const busted = new URL(getCacheBustedUrl(origin + path));
    expect(busted.searchParams.get("token")).toBe("fixture-private");
    expect(busted.searchParams.get("encuesta")).toBe("gastronomia");
    expect(busted.hash).toBe("#form");
    localStorage.setItem("fixture-session", "preserved");
    history.replaceState(null, "", path.replace("#form", "&_v=123#form"));
    stripCacheBustParam();
    expect(location.pathname + location.search + location.hash).toBe(path);
    expect(localStorage.getItem("fixture-session")).toBe("preserved");
    localStorage.removeItem("fixture-session");
  });
  it("registro permite como máximo dos intentos automáticos por versión", () => {
    expect(recordAttempt("new")).toBe(1);
    expect(decideUpdateAction("old", "new", readAttempt())).toBe("auto-reload");
    expect(recordAttempt("new")).toBe(2);
    expect(decideUpdateAction("old", "new", readAttempt())).toBe("blocking");
    expect(decideUpdateAction("old", null, readAttempt())).toBe("none");
  });
  it("consulta versión sin caché ni URL privada", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildTime: "new" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchDeployedBuildId()).toBe("new");
    expect(fetcher.mock.calls[0][0]).toMatch(/^\/app-version.json\?t=\d+$/);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });
  it("offline no genera actualización", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchDeployedBuildId()).toBeNull();
  });
  it("una comprobación sin respuesta termina a los cinco segundos", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout"))))));
    const check = fetchDeployedBuildId();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await check).toBeNull();
  });
});

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
