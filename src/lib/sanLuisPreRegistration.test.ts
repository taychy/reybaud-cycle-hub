import { describe, expect, it, vi } from "vitest";
import { buildPreRegistrationRequest, preRegistrationSchema, sanLuisCamps, sanLuisPackages } from "./sanLuisPreRegistration";
import { submitSanLuisPreRegistration } from "./sanLuisPreRegistrationService";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const input = (camp: "full" | "mini" = "full", index = 0) => ({ firstName: "Prueba", lastName: "Sintética", email: "qa@example.invalid", phone: "+54 9 11 1234 5678", camp, packageId: sanLuisPackages[camp][index].id, extraNight: false, comment: "Consulta sintética", consent: true });

describe("San Luis enero · reglas comerciales", () => {
  it("completo: 7 días, 6 noches, máximo 30, checkout 24 enero", () => {
    expect(sanLuisCamps.full).toMatchObject({ days: 7, nights: 6, capacity: 30, dates: "Lunes 18 a domingo 24 de enero" });
  });
  it("mini: 4 días, 3 noches, máximo 15, checkout 24 enero", () => {
    expect(sanLuisCamps.mini).toMatchObject({ days: 4, nights: 3, capacity: 15, dates: "Jueves 21 a domingo 24 de enero" });
  });
  const cases = [["full", 0, 1950000], ["full", 1, 2480000], ["full", 2, 1950000], ["full", 3, 1420000], ["mini", 0, 1070000], ["mini", 1, 1340000], ["mini", 2, 1070000], ["mini", 3, 830000]] as const;
  it.each(cases)("%s paquete %i conserva tarifa estimada ARS %i por ciclista", (camp, index, price) => {
    const request = buildPreRegistrationRequest(input(camp, index));
    expect(request.p_event_id).toBe(sanLuisCamps[camp].id);
    expect(request.p_respuestas.package_id).toBe(sanLuisPackages[camp][index].id);
    expect(request.p_respuestas.estimated_unit_price).toBe(price);
    expect(request.p_respuestas.currency).toBe("ARS");
  });
  it.each(["full", "mini"] as const)("%s: ambas cabañas comparten inventario; sin triple convencional", camp => {
    expect(sanLuisPackages[camp].filter(p => p.occupancy === 3).map(p => p.lodgingGroup)).toEqual(["cabana_3_plazas", "cabana_3_plazas"]);
    expect(sanLuisPackages[camp].map(p => p.meals)).toEqual([true, true, true, false]);
  });
  it("noche extra solo completo, no cambia tarifa ni se materializa reserva", () => {
    const req = buildPreRegistrationRequest({ ...input(), extraNight: true });
    expect(req.p_respuestas.extra_night_interest).toBe(true);
    expect(req.p_respuestas.estimated_unit_price).toBe(1950000);
    expect(preRegistrationSchema.safeParse({ ...input("mini"), extraNight: true }).success).toBe(false);
  });
  it("rechaza un paquete de otro camp", () => {
    expect(preRegistrationSchema.safeParse({ ...input(), packageId: sanLuisPackages.mini[0].id }).success).toBe(false);
  });
  it("requiere consentimiento, email y WhatsApp válidos", () => {
    expect(preRegistrationSchema.safeParse({ ...input(), consent: false }).success).toBe(false);
    expect(preRegistrationSchema.safeParse({ ...input(), email: "no-email" }).success).toBe(false);
    expect(preRegistrationSchema.safeParse({ ...input(), phone: "1234" }).success).toBe(false);
  });
  it("normaliza email y deja la selección visible en consulta sin vincular alumno", () => {
    const req = buildPreRegistrationRequest({ ...input(), email: " QA@EXAMPLE.INVALID " });
    expect(req.p_email).toBe("qa@example.invalid");
    expect(req.p_alumno_id).toBeNull();
    expect(req.p_respuestas.mensaje).toContain("Habitación doble");
    expect(req.p_respuestas.tipo).toBe("consulta");
  });
});
describe("Recepción aislada sin datos reales", () => {
  it("borrador nunca invoca transporte ni simula éxito", async () => {
    const transport = vi.fn();
    await expect(submitSanLuisPreRegistration(input(), { transport })).rejects.toThrow("no está habilitada");
    expect(transport).not.toHaveBeenCalled();
  });
  it("éxito requiere confirmación e id del RPC; duplicado usa misma identidad de email+evento", async () => {
    const transport = vi.fn().mockResolvedValue({ data: { ok: true, id: "synthetic-only" }, error: null });
    expect(await submitSanLuisPreRegistration(input(), { enabled: true, transport })).toEqual({ id: "synthetic-only" });
    await submitSanLuisPreRegistration(input(), { enabled: true, transport });
    expect(transport.mock.calls[0][0].p_event_id).toBe(transport.mock.calls[1][0].p_event_id);
    expect(transport.mock.calls[0][0].p_email).toBe(transport.mock.calls[1][0].p_email);
  });
  it.each([{ data: { ok: false }, error: null }, { data: { ok: true }, error: null }, { data: null, error: { message: "Backend error" } }])("no confirma si recepción falla o falta id", async result => {
    await expect(submitSanLuisPreRegistration(input(), { enabled: true, transport: vi.fn().mockResolvedValue(result) })).rejects.toThrow();
  });
});