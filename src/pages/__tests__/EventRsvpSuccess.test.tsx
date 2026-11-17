import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi, beforeEach, test, expect } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
import EventRsvp from "../EventRsvp";

const base = {
  event: { title: "Fondazo", date: "2026-11-29", location: "La Carreta del Gato" },
  name: "Ana", identity: { linked: true, first_name: "Ana", last_name: "Pérez", full_name: "Ana Pérez", email: "ana@x.com", whatsapp: "" },
  response: null, participation_mode: null, guests_count: 0, cyclist_guests: [], non_cyclist_guests: [],
  lunch: { adults_count: 1, children_4_9_count: 0, under_4_count: 0, status: "intencion", terms_version: null, terms_accepted_at: null, attendees: [] },
  prices: { adult: 40000, child_4_9: 20000, under_4: 0 },
};
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const renderAt = (q = "") => render(<MemoryRouter initialEntries={[`/rsvp/tok${q}`]}><Routes><Route path="/rsvp/:token" element={<EventRsvp />} /></Routes></MemoryRouter>);
const confirmBtn = () => screen.findByRole("button", { name: "Confirmar mi respuesta" });

beforeEach(() => invoke.mockReset());

test("VOY: éxito reemplaza el formulario y respeta el estado del correo", async () => {
  invoke.mockImplementationOnce(() => ok(base)).mockImplementationOnce(() => ok({ ...base, response: "voy", participation_mode: "fondo_y_almuerzo", notification: { participant: "failed" } }));
  renderAt();
  fireEvent.click(await confirmBtn());
  expect(await screen.findByText("¡Tu asistencia está confirmada!")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirmar mi respuesta" })).toBeNull();
  expect(screen.getByText(/no pudimos confirmar el envío del correo/)).toBeInTheDocument();
  expect(screen.queryByText("Te enviamos el correo de confirmación.")).toBeNull();
  expect(screen.getByText(/instrucciones de pago/)).toBeInTheDocument();
});

test("NO VOY: sin pagos ni invitados", async () => {
  invoke.mockImplementationOnce(() => ok(base)).mockImplementationOnce(() => ok({ ...base, response: "no_voy", notification: {} }));
  renderAt("?opcion=no_voy");
  fireEvent.click(await confirmBtn());
  expect(await screen.findByText("Registramos que no vas a asistir")).toBeInTheDocument();
  expect(screen.queryByText(/pago/)).toBeNull();
  expect(screen.queryByText(/Claudio/)).toBeNull();
});

test("error o respuesta no coincidente mantiene el formulario", async () => {
  invoke.mockImplementationOnce(() => ok(base)).mockImplementationOnce(() => ok({ ...base, response: null }));
  renderAt();
  fireEvent.click(await confirmBtn());
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByTestId("rsvp-success")).toBeNull();
  expect(screen.getByRole("button", { name: "Confirmar mi respuesta" })).toBeInTheDocument();
});

test("revisita con ?opcion no sobrescribe y editar reabre sin guardar", async () => {
  invoke.mockImplementationOnce(() => ok({ ...base, response: "voy", participation_mode: "solo_fondo", cyclist_guests: [{ name: "Juan Gómez", lunch: false, whatsapp: "+5491100000000" }] }));
  renderAt("?opcion=no_voy");
  expect(await screen.findByText("¡Tu asistencia está confirmada!")).toBeInTheDocument();
  expect(screen.getByText(/pendiente/)).toHaveTextContent("Claudio");
  expect(screen.queryByText(/instrucciones de pago/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Modificar mi respuesta" }));
  expect(await confirmBtn()).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /VOY/, pressed: true })).toHaveTextContent(/^VOY$/);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
});
