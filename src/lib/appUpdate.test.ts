import { describe, it, expect, vi, afterEach } from "vitest";
import { decideUpdateAction, getAppLaunchDestination, routeAppLaunchDestination, SURVEY_LAUNCH_EVENT, requiresSurveyUpdateCheck, wantsFoodSurvey, getCacheBustedUrl, stripCacheBustParam, fetchDeployedBuildId, recordAttempt, readAttempt, clearAttempts } from "./appUpdate";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearAttempts(); });

describe("enlaces de encuesta y PWA instalada", () => {
  const origin = "https://reybaud-app.com";
  it.each(["/viaje/encuesta-gastronomica?evento=event", "/viaje/mi-reserva?token=fixture-private&encuesta=gastronomia#form", "/formacion-inicial?cohort=c", "/preinscripcion/plan?beneficio=b", "/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39?opcion=voy", "/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39?opcion=no_voy"])("abre exactamente el destino permitido %s", (path) => {
    expect(getAppLaunchDestination(origin + path, origin)).toBe(path);
  });
  it.each(["https://other.example/viaje/mi-reserva?token=fixture", "https://other.example/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39?opcion=voy", origin + "/confirmar-asistencia/not-a-token?opcion=voy", origin + "/viaje/mi-reserva-otra", origin + "/admin/eventos", "not-a-url"])("rechaza destino no autorizado %s", (url) => {
    expect(getAppLaunchDestination(url, origin)).toBeNull();
  });
  it("la PWA abierta navega a NO VOY sin recargar un documento viejo", () => {
    const prior = location.pathname + location.search + location.hash;
    history.replaceState(null, "", "/");
    const navigation = vi.fn();
    const onLaunch = vi.fn();
    window.addEventListener("popstate", navigation);
    window.addEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
    try {
      const target = origin + "/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39?opcion=no_voy";
      expect(routeAppLaunchDestination(target, origin)).toBe(true);
      expect(location.pathname).toBe("/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39");
      expect(new URLSearchParams(location.search).get("opcion")).toBe("no_voy");
      expect(navigation).toHaveBeenCalledTimes(1);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      // Un relanzamiento de la misma ruta chequea actualización igualmente.
      expect(routeAppLaunchDestination(target, origin)).toBe(true);
      expect(navigation).toHaveBeenCalledTimes(1);
      expect(onLaunch).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener("popstate", navigation);
      window.removeEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
      history.replaceState(null, "", prior);
    }
  });

  it("rechaza enlaces ajenos y malformados sin mover la app", () => {
    const old = location.href;
    const onLaunch = vi.fn();
    window.addEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
    try {
      expect(routeAppLaunchDestination("https://malicioso.example/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39", origin)).toBe(false);
      expect(routeAppLaunchDestination(origin + "/confirmar-asistencia/no-token", origin)).toBe(false);
      expect(location.href).toBe(old);
      expect(onLaunch).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SURVEY_LAUNCH_EVENT, onLaunch);
    }
  });

  it("chequea encuesta general y personal inmediatamente, no otras rutas", () => {
    expect(requiresSurveyUpdateCheck("/viaje/encuesta-gastronomica", "?evento=e")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture&encuesta=gastronomia")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture&step=gastronomia")).toBe(true);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", "?token=fixture")).toBe(false);
    expect(requiresSurveyUpdateCheck("/confirmar-asistencia/e5f33f3c-a1e5-4ba4-a84f-fbe00d440f39", "?opcion=voy")).toBe(true);
    expect(requiresSurveyUpdateCheck("/confirmar-asistencia/no-es-uuid", "?opcion=voy")).toBe(false);
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
  it("conserva exactamente query codificada, duplicados y retorno de login", () => {
    const query = "?token=fixture%2F%2b&x=a%20b&x=c&returnTo=%2Fviaje%2Fencuesta-gastronomica%3Fevento%3De";
    const href = origin + "/viaje/mi-reserva" + query + "#form";
    const updated = getCacheBustedUrl(href);
    expect(updated.replace(/&_v=\d+/, "")).toBe(href);
    expect(getAppLaunchDestination(href, origin)).toBe("/viaje/mi-reserva" + query + "#form");
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

import { shouldRecoverRsvpNotFound } from "./appUpdate";
describe("RSVP 404 recovery", () => {
  const ev = "/eventos/08fc7e07-10df-4ace-b3ed-a0d581b6f7c9/confirmar";
  const tk = "/confirmar-asistencia/08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";
  it("recovers once for RSVP deep links", () => {
    expect(shouldRecoverRsvpNotFound(ev, null)).toBe(true);
    expect(shouldRecoverRsvpNotFound(tk, null)).toBe(true);
    expect(shouldRecoverRsvpNotFound(ev, ev)).toBe(false);
  });
  it("never for other paths", () => {
    expect(shouldRecoverRsvpNotFound("/foo", null)).toBe(false);
  });
});
