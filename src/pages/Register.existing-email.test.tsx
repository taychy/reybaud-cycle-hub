import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Register from "./Register";

const mock = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  sendOtp: vi.fn(),
  invoke: vi.fn(),
  accountStatus: "activo",
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mock.navigate }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mock.rpc,
    from: mock.from,
    auth: { signInWithOtp: mock.sendOtp },
    functions: { invoke: mock.invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mock.accountStatus = "activo";
  mock.sendOtp.mockResolvedValue({ data: null, error: null });
  mock.rpc.mockImplementation((name: string) => {
    if (name === "lookup_alumno_by_email") {
      return { maybeSingle: async () => ({
        data: { id: "existing-student", estado: mock.accountStatus },
        error: null,
      }) };
    }
    return Promise.resolve({ data: null, error: null });
  });
});
afterEach(() => cleanup());

async function submitEmail() {
  render(<Register />);
  fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Persona" } });
  fireEvent.change(screen.getByLabelText("Apellido *"), { target: { value: "Prueba" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "existente@example.test" } });
  fireEvent.submit(document.querySelector("form")!);
  return screen.findByRole("button", { name: /Enviarme enlace de acceso/i });
}

describe("UX de registro con email existente", () => {
  it.each(["activo", "inactivo", "pendiente"])(
    "si el alumno está %s se ofrece enviar acceso, nunca se duplica ni va directo a planes",
    async (estado) => {
      mock.accountStatus = estado;
      const button = await submitEmail();
      expect(screen.getByText("Ya tenés una cuenta en Reybaud")).toBeTruthy();
      expect(mock.from).not.toHaveBeenCalled();
      expect(mock.navigate).not.toHaveBeenCalledWith("/planes");
      fireEvent.click(button);
      await waitFor(() => expect(mock.sendOtp).toHaveBeenCalledWith({
        email: "existente@example.test",
        options: { emailRedirectTo: "https://reybaud-app.com/auth/callback" },
      }));
      await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith("/", { replace: true }));
      const stored = JSON.parse(window.localStorage.getItem("reybaud_pending_otp") || "null");
      expect(stored).toMatchObject({ email: "existente@example.test", context: "main" });
    }
  );

  it("si falla el correo muestra un mensaje recuperable y no navega", async () => {
    mock.sendOtp.mockResolvedValue({ data: null, error: { status: 429, code: "over_email_send_rate_limit" } });
    const button = await submitEmail();
    fireEvent.click(button);
    expect(await screen.findByText("No pudimos enviar el acceso. Intentá nuevamente en unos minutos.")).toBeTruthy();
    expect(mock.navigate).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
});
