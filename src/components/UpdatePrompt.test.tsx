import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpdatePrompt from "./UpdatePrompt";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reload: vi.fn(), attempt: vi.fn(), clear: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/appUpdate", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/appUpdate")>(), CLIENT_BUILD_ID: "client",
  fetchDeployedBuildId: mocks.fetch, forceAppHardReload: mocks.reload, recordAttempt: mocks.attempt,
  clearAttempts: mocks.clear, readAttempt: mocks.read, isServiceWorkerAllowed: () => false,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function AppContent() {
  const navigate = useNavigate();
  return <button onClick={() => { history.replaceState(null, "", "/viaje/encuesta-gastronomica?evento=e"); navigate("/viaje/encuesta-gastronomica?evento=e"); }}>open</button>;
}
function start(path = "/viaje/encuesta-gastronomica?evento=e") {
  history.replaceState(null, "", path);
  render(<MemoryRouter initialEntries={[path]}><UpdatePrompt><p>form-ready</p><AppContent /></UpdatePrompt></MemoryRouter>);
}
describe("comprobación global antes de abrir encuesta", () => {
  it("no monta el formulario mientras consulta y lo abre al confirmar misma versión", async () => {
    let resolve: ((v: string) => void) | undefined;
    mocks.fetch.mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
    start();
    expect(screen.queryByText("form-ready")).toBeNull();
    await act(async () => { resolve?.("client"); });
    expect(await screen.findByText("form-ready")).toBeDefined();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
  it("nueva versión usa una sola recarga global sin abrir formulario viejo", async () => {
    mocks.fetch.mockResolvedValue("server"); mocks.read.mockReturnValue(null); mocks.reload.mockResolvedValue(undefined);
    start();
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(mocks.attempt).toHaveBeenCalledWith("server");
    expect(screen.queryByText("form-ready")).toBeNull();
  });
  it("tras dos intentos no vuelve a recargar automáticamente", async () => {
    mocks.fetch.mockResolvedValue("server"); mocks.read.mockReturnValue({ target: "server", count: 2 });
    start();
    await screen.findByRole("alertdialog", { name: "Actualización requerida" });
    expect(mocks.reload).not.toHaveBeenCalled();
  });
  it("offline permite abrir sin bloqueo ni recarga", async () => {
    mocks.fetch.mockResolvedValue(null);
    start("/viaje/mi-reserva?token=fixture&step=gastronomia");
    await screen.findByText("form-ready");
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});