import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasswordLogin from "./PasswordLogin";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), clearOtp: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signInWithPassword: mocks.signIn } } }));
vi.mock("@/lib/pendingOtp", () => ({ clearPendingOtpState: mocks.clearOtp }));

function openAndFill() {
  render(<PasswordLogin />);
  fireEvent.click(screen.getByRole("button", { name: /Sign in with password/ }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Reviewer@Example.com" } });
  fireEvent.change(screen.getByLabelText("Contraseña / Password"), { target: { value: " test password " } });
}

describe("PasswordLogin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses real authentication and clears the pending OTP only after success", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: { user: { id: "reviewer" } } }, error: null });
    openAndFill();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar / Sign in" }));
    await waitFor(() => expect(mocks.clearOtp).toHaveBeenCalledOnce());
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "reviewer@example.com", password: " test password " });
    expect(screen.getByLabelText("Contraseña / Password")).toHaveValue("");
  });

  it("does not clear the existing OTP state on an invalid password", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { message: "Invalid credentials" } });
    openAndFill();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar / Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your email and password");
    expect(mocks.clearOtp).not.toHaveBeenCalled();
  });

  it("prevents duplicate requests while authentication is pending", async () => {
    let finish!: (value: unknown) => void;
    mocks.signIn.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    openAndFill();
    const form = screen.getByLabelText("Email").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.signIn).toHaveBeenCalledOnce();
    finish({ data: { session: null }, error: { message: "Invalid credentials" } });
    await screen.findByRole("alert");
  });
});
