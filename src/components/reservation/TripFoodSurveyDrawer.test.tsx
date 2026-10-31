import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TripFoodSurveyDrawer from "./TripFoodSurveyDrawer";

const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/tripTokenApi", () => ({ tripTokenGet: mock.get, tripTokenSaveStep: mock.save }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: any) => <div>{children}</div>,
  DrawerContent: ({ children }: any) => <div>{children}</div>,
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: any) => <p>{children}</p>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function openSurvey(included: boolean, withProgram = true) {
  mock.get.mockResolvedValue({
    checklist: [], package: { id: "p", nombre: "Paquete de prueba", incluye_gastronomia: included },
    event: { metadata: { food_survey: withProgram ? { meal_program: {
      almuerzo_addon_id: "a", cena_addon_id: "c", meals: [
        { fecha: "2026-11-05", tipo: "cena" },
        { fecha: "2026-11-06", tipo: "almuerzo" },
        { fecha: "2026-11-06", tipo: "cena" },
        { fecha: "2026-11-06", tipo: "desayuno" },
      ],
    } } : {} } },
  });
  mock.invoke.mockResolvedValue({ data: {
    addons: [
      { id: "a", precio: 35000, currency: "ARS", activo: true },
      { id: "c", precio: 35000, currency: "ARS", activo: true },
    ],
    contracted: [{ addon_id: "c", notas: "2026-11-05" }],
  } });
  render(<TripFoodSurveyDrawer open onOpenChange={vi.fn()} reservationId="fixture" alumnoId={null} token="fixture-token" onSaved={vi.fn()} />);
  await screen.findByText("Paquete de prueba");
}

describe("solicitudes gastronómicas sin operaciones reales", () => {
  it("un clic solicita solo dos servicios reales no comprados, sin desayuno ni compra automática", async () => {
    await openSurvey(false);
    fireEvent.click(screen.getByRole("button", { name: /Agregar todos los almuerzos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));
    fireEvent.click(screen.getByRole("button", { name: /^No$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar respuestas" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    const data = mock.save.mock.calls[0][0].data;
    expect(data.comidas_solicitadas).toEqual([
      { fecha: "2026-11-06", tipo: "almuerzo" }, { fecha: "2026-11-06", tipo: "cena" },
    ]);
    expect(data.pension_interes).toBe(false);
    expect(mock.invoke.mock.calls.map(([arg]) => arg)).toEqual(["manage-trip-extras-by-token"]);
    expect(mock.invoke.mock.calls[0][1].body.action).toBe("get");
  });

  it("sin programa no solicita servicios aunque se guarden preferencias alimentarias", async () => {
    await openSurvey(false, false);
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));
    fireEvent.click(screen.getByRole("button", { name: /^No$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar respuestas" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].data.comidas_solicitadas).toEqual([]);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it("pensión incluida guarda preferencias sin duplicar solicitud de almuerzos/cenas", async () => {
    await openSurvey(true);
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));
    fireEvent.click(screen.getByRole("button", { name: /^No$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar respuestas" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].data.comidas_solicitadas).toEqual([]);
  });
});