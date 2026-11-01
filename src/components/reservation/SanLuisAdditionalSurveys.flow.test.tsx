import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SanLuisAdditionalSurveys, { SAN_LUIS_EVENT_ID, SAN_LUIS_NIGHT_SURVEY_KEY } from "./SanLuisAdditionalSurveys";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/lib/tripTokenApi", () => ({
  tripTokenGet: vi.fn(),
  tripTokenSaveStep: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock("@/components/reservation/TripAdditionalDayQuestion", () => ({
  default: () => <div>Jornada extra de Training Camp</div>,
}));

const rpc = vi.mocked(supabase.rpc);
const getReservation = vi.mocked(tripTokenGet);
const save = vi.mocked(tripTokenSaveStep);

const sharedProps = {
  eventId: SAN_LUIS_EVENT_ID,
  reservationId: "reserva-prueba",
  token: "token-prueba",
  packageName: "Habitación doble",
  lodgingName: "Doble 1",
  stayLabel: "5 al 9 de noviembre",
};

const booking = (checklist: unknown[] = []) => ({
  ok: true,
  reservation: { id: sharedProps.reservationId },
  event: { id: sharedProps.eventId },
  checklist,
});

describe("encuestas en Mi Reserva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReservation.mockResolvedValue(booking() as any);
    save.mockResolvedValue({ ok: true } as any);
    rpc.mockImplementation((async (name: string) => {
      if (name === "manage_trip_extras_by_token") {
        return { data: { ok: true, event_id: SAN_LUIS_EVENT_ID, addons: [], contracted: [] }, error: null } as any;
      }
      if (name === "manage_extra_night_by_token") {
        return { data: { ok: true, actual: null }, error: null } as any;
      }
      return { data: { answer: null }, error: null } as any;
    });
  });

  it("guarda la noche extra como solicitud y sigue mostrando la reserva completa", async () => {
    render(<SanLuisAdditionalSurveys {...sharedProps} />);
    const choice = await screen.findByRole("button", { name: "Sí, una noche antes" });
    fireEvent.click(choice);

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      token: sharedProps.token,
      step_key: SAN_LUIS_NIGHT_SURVEY_KEY,
      needs_advice: true,
      data: expect.objectContaining({
        respuesta: "antes",
        estado: "pendiente_administracion",
        tipo: "solicitud_alojamiento",
      }),
    })));
    expect(await screen.findByText(/Solicitud guardada/)).toBeTruthy();
    expect(screen.getByText(/Habitación doble · 5 al 9 de noviembre · Doble 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver mi reserva completa/i })).toBeTruthy();
  });

  it("recupera una respuesta guardada después de volver a abrir la reserva", async () => {
    getReservation.mockResolvedValue(booking([{
      step_key: SAN_LUIS_NIGHT_SURVEY_KEY,
      data: { respuesta: "ambas", estado: "pendiente_administracion" },
    }]) as any);

    render(<SanLuisAdditionalSurveys {...sharedProps} />);
    const choice = await screen.findByRole("button", { name: "Sí, ambas noches" });
    await waitFor(() => expect(choice.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByText(/Sí, ambas noches · solicitud pendiente de Administración/)).toBeTruthy();
  });

  it("no vuelve a ofrecer noches ya contratadas", async () => {
    rpc.mockImplementation((async (name: string) => {
      if (name === "manage_trip_extras_by_token") {
        return { data: {
          ok: true, event_id: SAN_LUIS_EVENT_ID,
          addons: [{ id: "extra1", nombre: "Noche extra individual", currency: "ARS" }],
          contracted: [{ id: "contratada1", addon_id: "extra1", cantidad: 1,
            noche_timing: "antes", subtotal: 80000, currency: "ARS" }],
        }, error: null } as any;
      }
      return { data: { answer: null }, error: null } as any;
    });

    render(<SanLuisAdditionalSurveys {...sharedProps} />);
    expect(await screen.findByText(/Ya tenés noche extra registrada/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sí, una noche antes" })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("no mezcla las encuestas de San Luis con otros eventos", () => {
    const { container } = render(
      <SanLuisAdditionalSurveys {...sharedProps} eventId="otro-evento" />,
    );
    expect(container.textContent).toBe("");
    expect(getReservation).not.toHaveBeenCalled();
  });
});
