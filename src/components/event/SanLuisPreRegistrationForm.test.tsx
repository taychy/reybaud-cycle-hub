import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SanLuisPreRegistrationForm from "./SanLuisPreRegistrationForm";
import { sanLuisPackages } from "@/lib/sanLuisPreRegistration";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());
function fill() {
  fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Prueba" } });
  fireEvent.change(screen.getByLabelText("Apellido *"), { target: { value: "Sintética" } });
  fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "qa@example.invalid" } });
  fireEvent.change(screen.getByLabelText("WhatsApp *"), { target: { value: "+54 9 11 1234 5678" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo a Reybaud/ }));
}
describe("Preinscripción · estados sin escrituras", () => {
  it("solo muestra éxito cuando el servicio confirma recepción", async () => {
    const submit = vi.fn().mockResolvedValue({ id: "synthetic-only" });
    render(<SanLuisPreRegistrationForm camp="full" packageId={sanLuisPackages.full[0].id} onSelectionChange={vi.fn()} submit={submit} />);
    fill(); fireEvent.click(screen.getByRole("button", { name: "Quiero preinscribirme" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(submit.mock.calls[0][0]).toMatchObject({ camp: "full", packageId: sanLuisPackages.full[0].id, consent: true });
  });
  it("error no muestra éxito y conserva datos para corregir", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("Recepción bloqueada"));
    render(<SanLuisPreRegistrationForm camp="mini" packageId={sanLuisPackages.mini[3].id} onSelectionChange={vi.fn()} submit={submit} />);
    fill(); fireEvent.click(screen.getByRole("button", { name: "Quiero preinscribirme" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("Email *") as HTMLInputElement).value).toBe("qa@example.invalid");
    expect(submit.mock.calls[0][0].extraNight).toBe(false);
  });
});