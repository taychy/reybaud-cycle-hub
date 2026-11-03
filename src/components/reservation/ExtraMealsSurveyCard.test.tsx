import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { initialChoices, referenceTotal, requestedFromChoices, allAnswered, type ExtraMealInfo } from "@/lib/extraMealSurvey";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));
import ExtraMealsSurveyCard from "./ExtraMealsSurveyCard";

const base: ExtraMealInfo = {
  blocked: null, price: 35000, currency: "ARS", pc: false, package: "Cabaña Triple", answer: null,
  slots: [
    { tipo: "cena", fecha: "2026-11-04", motivo: "noche_extra_antes", status: "ofrecible" },
    { tipo: "almuerzo", fecha: "2026-11-04", motivo: "llegada", status: "ofrecible" },
    { tipo: "almuerzo", fecha: "2026-11-08", motivo: "salida", status: "contratada" },
  ],
};

describe("extraMealSurvey helpers", () => {
  it("total de referencia = cantidad × 35.000", () => expect(referenceTotal(2, 35000)).toBe(70000));
  it("solo envía comidas ofrecibles marcadas Sí", () => {
    expect(requestedFromChoices(base.slots, { "cena|2026-11-04": "si", "almuerzo|2026-11-04": "no", "almuerzo|2026-11-08": "si" } as any))
      .toEqual([{ tipo: "cena", fecha: "2026-11-04" }]);
  });
  it("reapertura: lo no pedido queda en No", () => {
    const c = initialChoices({ ...base, answer: { version: 1, requested: [{ tipo: "cena", fecha: "2026-11-04", motivo: "noche_extra_antes" }] } });
    expect(c).toEqual({ "cena|2026-11-04": "si", "almuerzo|2026-11-04": "no" });
    expect(allAnswered(base.slots, c)).toBe(true);
  });
});

describe("ExtraMealsSurveyCard", () => {
  beforeEach(() => rpc.mockReset());

  it("muestra Ya contratada sin opción y guarda ninguna con el token propio", async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === "get_extra_meal_survey" ? { data: base } : { data: { ok: true } }));
    render(<ExtraMealsSurveyCard reservationId="r1" token="tok" />);
    expect(await screen.findByText("Ya contratada")).toBeTruthy();
    expect(screen.getByText(/No genera compra ni cobro/)).toBeTruthy();
    fireEvent.click(screen.getByText("No quiero ninguna comida adicional"));
    fireEvent.click(screen.getByText("Guardar mi respuesta"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_extra_meal_survey", { p_reservation_id: "r1", p_token: "tok", p_requested: [] }));
  });

  it("selección suma total y edita respuesta previa", async () => {
    const answered = { ...base, answer: { version: 1 as const, requested: [] } };
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === "get_extra_meal_survey" ? { data: answered } : { data: { ok: true } }));
    render(<ExtraMealsSurveyCard reservationId="r1" />);
    const yes = await screen.findAllByText("Sí, la quiero");
    fireEvent.click(yes[0]); fireEvent.click(yes[1]);
    expect(screen.getByText(/70\.000/)).toBeTruthy();
    fireEvent.click(screen.getByText("Actualizar mi respuesta"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_extra_meal_survey", expect.objectContaining({ p_token: null, p_requested: [{ tipo: "cena", fecha: "2026-11-04" }, { tipo: "almuerzo", fecha: "2026-11-04" }] })));
  });

  it("fechas sin validar bloquean el guardado", async () => {
    rpc.mockResolvedValue({ data: { ...base, blocked: "fechas_no_validadas", slots: [] } });
    render(<ExtraMealsSurveyCard reservationId="r1" token="tok" />);
    expect(await screen.findByText(/fechas todavía no están confirmadas/)).toBeTruthy();
    expect(screen.queryByText("Guardar mi respuesta")).toBeNull();
  });

  it("evento sin encuesta habilitada no muestra nada", async () => {
    rpc.mockResolvedValue({ data: { blocked: "no_habilitada", slots: [] } });
    const { container } = render(<ExtraMealsSurveyCard reservationId="r1" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
