import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Register from "./Register";

const mock = vi.hoisted(() => ({
  navigate: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mock.navigate }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: mock.getUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: mock.rpc,
    from: mock.from,
    functions: { invoke: mock.invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/registro");
  window.sessionStorage.clear();
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mock.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => cleanup());

describe("Alta segura", () => {
  it("no ofrece crear la ficha antes de verificar el correo", async () => {
    render(<Register />);
    await screen.findByRole("button", { name: "Verificar mi email" });
    expect(screen.queryByLabelText("Nombre *")).toBeNull();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("bloquea el alta cuando encuentra un documento existente", async () => {
    mock.getUser.mockResolvedValue({
      data: { user: { email: "persona@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });
    mock.rpc.mockImplementation((name: string) => {
      if (name === "lookup_alumno_by_email") {
        return { maybeSingle: async () => ({ data: null, error: null }) };
      }
      return Promise.resolve({
        data: name === "lookup_alumno_duplicate" ? [{ motivo: "documento" }] : null,
        error: null,
      });
    });
    render(<Register />);
    await screen.findByLabelText("Nombre *");
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Apellido *"), { target: { value: "Sol" } });
    fireEvent.change(screen.getByLabelText(/Número de documento/), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Parece que ya tenés una ficha en Reybaud");
    const button = screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(mock.rpc).not.toHaveBeenCalledWith("register_verified_alumno", expect.anything());
    expect(mock.from).not.toHaveBeenCalled();
  });
});
