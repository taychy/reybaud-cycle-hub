import { describe, expect, it } from "vitest";
import { buildEnrollmentRequest, enrollmentEstimatedTotal, enrollmentSchema } from "./sanLuisEnrollment";
import { sanLuisCamps, sanLuisPackages } from "./sanLuisPreRegistration";

const input = {
  email: "Ciclista@Example.invalid",
  phone: "+54 9 11 1234 5678",
  camp: "full" as const,
  packageId: sanLuisPackages.full[2].id,
  peopleCount: 2,
  attendees: [{ firstName: "Ana", lastName: "Prueba" }, { firstName: "Luis", lastName: "Sintético" }],
  extraNight: true,
  comment: "Cabaña compartida",
  contactConsent: true as const,
  finalConditionsAccepted: true as const,
  website: "",
};

describe("Solicitud de inscripción San Luis", () => {
  it("identifica a cada persona y nunca envía precios decididos por el cliente", () => {
    const request = buildEnrollmentRequest(input);
    expect(request.p_event_id).toBe(sanLuisCamps.full.id);
    expect(request.p_attendees).toHaveLength(2);
    expect(request.p_email).toBe("ciclista@example.invalid");
    expect(request).not.toHaveProperty("p_price");
    expect(request).not.toHaveProperty("p_alumno_id");
    expect(request).not.toHaveProperty("p_reservation_id");
  });
  it("calcula el estimado por cantidad sin convertirlo en cargo", () => {
    expect(enrollmentEstimatedTotal("full", sanLuisPackages.full[2].id, 3)).toBe(5850000);
    expect(enrollmentEstimatedTotal("mini", sanLuisPackages.mini[3].id, 2)).toBe(1660000);
  });
  it("exige una persona identificada por cupo solicitado", () => {
    expect(enrollmentSchema.safeParse({ ...input, peopleCount: 1 }).success).toBe(false);
    expect(enrollmentSchema.safeParse({ ...input, attendees: input.attendees.slice(0, 1) }).success).toBe(false);
  });
  it("exige privacidad y aceptación expresa de que no hay reserva", () => {
    expect(enrollmentSchema.safeParse({ ...input, contactConsent: false }).success).toBe(false);
    expect(enrollmentSchema.safeParse({ ...input, finalConditionsAccepted: false }).success).toBe(false);
  });
  it("las dos tarifas de cabaña conservan el mismo grupo físico", () => {
    expect(sanLuisPackages.full[2].lodgingGroup).toBe("cabana_3_plazas");
    expect(sanLuisPackages.full[3].lodgingGroup).toBe(sanLuisPackages.full[2].lodgingGroup);
    expect(sanLuisPackages.mini[2].lodgingGroup).toBe(sanLuisPackages.mini[3].lodgingGroup);
  });
});
