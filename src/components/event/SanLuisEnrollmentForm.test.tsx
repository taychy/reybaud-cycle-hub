import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SanLuisEnrollmentForm from "./SanLuisEnrollmentForm";
import { sanLuisPackages } from "@/lib/sanLuisPreRegistration";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());

function fillContact() {
  fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Prueba" } });
  fireEvent.change(screen.getByLabelText("Apellido *"), { target: { value: "Sintética" } });
  fireEvent.change(screen.getByLabelText("Email de contacto *"), { target: { value: "qa@example.invalid" } });
  fireEvent.change(screen.getByLabelText("WhatsApp de contacto *"), { target: { value: "+54 9 11 1234 5678" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /política de privacidad/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /solo una solicitud/ }));
}
function renderForm(submit: ReturnType<typeof vi.fn>) {
  return render(<MemoryRouter><SanLuisEnrollmentForm camp="full" packageId={sanLuisPackages.full[0].id} onSelectionChange={vi.fn()} submit={submit} /></MemoryRouter>);
}

describe("Formulario público de inscripción", () => {
  it("un doble clic dispara una sola llamada y la referencia aparece al confirmar", async () => {
    let resolve!: (value: unknown) => void;
    const submit = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; }));
    renderForm(submit); fillContact();
    const button = screen.getByRole("button", { name: "Solicitar inscripción" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    resolve({ reference: "SL27-DOBLECLIC", duplicate: false });
    expect(await screen.findByText("SL27-DOBLECLIC")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/no confirma una reserva/i);
  });
  it("una solicitud grupal identifica a todas las personas sin duplicar formularios", async () => {
    const submit = vi.fn().mockResolvedValue({ reference: "SL27-GRUPO001", duplicate: false });
    renderForm(submit);
    fireEvent.change(screen.getByLabelText("Cantidad de personas *"), { target: { value: "2" } });
    fillContact();
    fireEvent.change(screen.getByLabelText("Nombre de la persona 2 *"), { target: { value: "Luis" } });
    fireEvent.change(screen.getByLabelText("Apellido de la persona 2 *"), { target: { value: "Sintético" } });
    fireEvent.click(screen.getByRole("button", { name: "Solicitar inscripción" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0]).toMatchObject({ peopleCount: 2, attendees: [{ firstName: "Prueba" }, { firstName: "Luis" }] });
    expect(screen.getByRole("status").textContent).toMatch(/3\.900\.000/);
  });
  it("ante un error conserva los datos y no anuncia recepción", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("Revisión pendiente"));
    renderForm(submit); fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar inscripción" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("Email de contacto *") as HTMLInputElement).value).toBe("qa@example.invalid");
  });
});
