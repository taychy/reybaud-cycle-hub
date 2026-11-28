import { describe, expect, it, vi } from "vitest";
import { submitSanLuisEnrollment } from "./sanLuisEnrollmentService";
import { sanLuisPackages } from "./sanLuisPreRegistration";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const input = {
  email: "qa@example.invalid", phone: "+54 9 11 1234 5678", camp: "mini", packageId: sanLuisPackages.mini[0].id,
  peopleCount: 1, attendees: [{ firstName: "Prueba", lastName: "Sintética" }], extraNight: false, comment: "",
  contactConsent: true, finalConditionsAccepted: true, website: "",
};

describe("Recepción de solicitud sin cobro", () => {
  it("devuelve la referencia solo después de una respuesta real del servidor", async () => {
    const transport = vi.fn().mockResolvedValue({ data: { ok: true, duplicate: false, reference: "SL27-PRUEBA01", status: "recibida" }, error: null });
    await expect(submitSanLuisEnrollment(input, { transport })).resolves.toMatchObject({ reference: "SL27-PRUEBA01", duplicate: false, status: "recibida" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("un reintento duplicado no inventa una segunda referencia", async () => {
    const transport = vi.fn().mockResolvedValue({ data: { ok: true, duplicate: true, status: "recibida" }, error: null });
    await expect(submitSanLuisEnrollment(input, { transport })).resolves.toEqual({ reference: null, duplicate: true, status: "recibida" });
  });
  it("no muestra éxito si el servidor no confirma", async () => {
    const transport = vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(submitSanLuisEnrollment(input, { transport })).rejects.toThrow(/datos siguen cargados/);
  });
});
