import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import SanLuisPreRegistrationForm from "./SanLuisPreRegistrationForm";
import { sanLuisPackages } from "@/lib/sanLuisPreRegistration";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const intake = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/sanLuisPreRegistration", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/sanLuisPreRegistration")>(),
  get SAN_LUIS_INTAKE_ENABLED() { return intake.enabled; },
}));
beforeEach(() => { intake.enabled = true; });
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
  it("recepción deshabilitada bloquea el botón y cualquier envío directo, aun con datos válidos", () => {
    intake.enabled = false;
    const submit = vi.fn();
    render(<SanLuisPreRegistrationForm camp="full" packageId={sanLuisPackages.full[1].id} onSelectionChange={vi.fn()} submit={submit} />);
    fill();
    const button = screen.getByRole("button", { name: "Quiero preinscribirme" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.submit(screen.getByRole("form", { name: "Quiero preinscribirme" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
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