import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach, test, expect } from "vitest";
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args), auth: { getUser: () => Promise.resolve({ data: { user: null } }) } } }));
import PublicJornada from "../PublicJornada";
const own = { first_name: "Ana", last_name: "QA", phone: "5491160026623", response: "voy" };
const status = { title: "Scott", date: "2026-11-28", capacity: 20, confirmed: 0, is_open: true, own: null };
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const mount = () => render(<MemoryRouter><PublicJornada /></MemoryRouter>);
beforeEach(() => {
  rpc.mockReset(); localStorage.clear(); history.replaceState(null, "", "/scott-28-noviembre?opcion=voy");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const fill = () => {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "QA" } });
  fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "+54 9 11 60026623" } });
};
test("GET/query never saves; successful persistence replaces form", async () => {
  rpc.mockImplementationOnce(() => ok(status)).mockImplementationOnce(() => ok({ ...status, confirmed: 1, own }));
  mount(); const confirm = await screen.findByRole("button", { name: "Confirmar mi lugar" });
  expect(rpc.mock.calls.every(call => call[0] === "get_public_jornada")).toBe(true);
  fill(); fireEvent.click(confirm);
  await screen.findByRole("button", { name: "Modificar mi respuesta" });
  expect(screen.queryByLabelText("Nombre")).toBeNull();
  expect(rpc.mock.calls.filter(call => call[0] === "submit_public_jornada")).toHaveLength(1);
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_response: "voy", p_phone: "5491160026623" });
  expect(localStorage.getItem("jornada-access:scott-28-noviembre")).toMatch(/^[a-f0-9]{64}$/);
});
test("revisit/explicit edit does not save and refreshing count preserves edit", async () => {
  rpc.mockImplementation(() => ok({ ...status, confirmed: 1, own }));
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Modificar mi respuesta" }));
  fireEvent.click(screen.getByRole("radio", { name: "No voy" }));
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("radio", { name: "No voy" })).toHaveAttribute("aria-checked", "true");
  expect(rpc.mock.calls.every(call => call[0] === "get_public_jornada")).toBe(true);
});
test("backend refusal never displays saved state", async () => {
  rpc.mockImplementationOnce(() => ok(status)).mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: "Cupos completos" } }));
  mount(); const confirm = await screen.findByRole("button", { name: "Confirmar mi lugar" }); fill(); fireEvent.click(confirm);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Modificar mi respuesta" })).toBeNull();
  expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
});
test("full capacity blocks going, but no-voy can persist", async () => {
  rpc.mockImplementationOnce(() => ok({ ...status, confirmed: 20 })).mockImplementationOnce(() => ok({ ...status, confirmed: 20, own: { ...own, response: "no_voy" } }));
  mount(); expect(await screen.findByRole("button", { name: "Confirmar mi lugar" })).toBeDisabled();
  fill(); fireEvent.click(screen.getByRole("radio", { name: "No voy" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar que no voy" }));
  await screen.findByRole("button", { name: "Modificar mi respuesta" });
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_response: "no_voy" });
});