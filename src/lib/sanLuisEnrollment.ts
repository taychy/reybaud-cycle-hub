import { z } from "zod";
import { CampKey, sanLuisCamps, sanLuisPackages } from "./sanLuisPreRegistration";

export const ENROLLMENT_STATUSES = ["recibida", "en_revision", "aprobada_cotizacion", "pendiente_pago", "confirmada", "rechazada"] as const;
export type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];
export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  recibida: "Recibida",
  en_revision: "En revisión",
  aprobada_cotizacion: "Aprobada para cotización",
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
};

const attendeeSchema = z.object({
  firstName: z.string().trim().min(2, "Revisá el nombre de cada persona").max(50),
  lastName: z.string().trim().min(2, "Revisá el apellido de cada persona").max(50),
});

export const enrollmentSchema = z.object({
  email: z.string().trim().email("Revisá tu email").max(150),
  phone: z.string().trim().max(30).refine(v => /^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15, "Revisá tu WhatsApp, con código de área"),
  camp: z.enum(["full", "mini"]),
  packageId: z.string().uuid(),
  peopleCount: z.number().int().min(1).max(6),
  attendees: z.array(attendeeSchema).min(1).max(6),
  extraNight: z.boolean(),
  comment: z.string().trim().max(600),
  contactConsent: z.literal(true, { errorMap: () => ({ message: "Aceptá la política de privacidad y el contacto sobre esta solicitud" }) }),
  finalConditionsAccepted: z.literal(true, { errorMap: () => ({ message: "Confirmá que entendés que no es una reserva ni un pago" }) }),
  website: z.string().max(0),
}).superRefine((v, ctx) => {
  if (!sanLuisPackages[v.camp].some(p => p.id === v.packageId)) ctx.addIssue({ code: "custom", path: ["packageId"], message: "Elegí un alojamiento de este camp" });
  if (v.camp === "mini" && v.extraNight) ctx.addIssue({ code: "custom", path: ["extraNight"], message: "La noche del 17/01 corresponde solo al camp completo" });
  if (v.attendees.length !== v.peopleCount) ctx.addIssue({ code: "custom", path: ["attendees"], message: "Identificá a todas las personas de la solicitud" });
});

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
export type EnrollmentAttendee = z.infer<typeof attendeeSchema>;

export function buildEnrollmentRequest(input: unknown) {
  const v = enrollmentSchema.parse(input);
  const attendees = v.attendees.map(a => ({ firstName: a.firstName.trim(), lastName: a.lastName.trim() }));
  return {
    p_event_id: sanLuisCamps[v.camp].id,
    p_package_id: v.packageId,
    p_attendees: attendees,
    p_email: v.email.toLowerCase(),
    p_phone: v.phone,
    p_people_count: v.peopleCount,
    p_extra_night: v.camp === "full" && v.extraNight,
    p_comment: v.comment,
    p_contact_consent: true as const,
    p_final_conditions_accepted: true as const,
    p_website: v.website,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  };
}

export function enrollmentEstimatedTotal(camp: CampKey, packageId: string, peopleCount: number) {
  const selected = sanLuisPackages[camp].find(p => p.id === packageId);
  return selected ? selected.price * peopleCount : 0;
}

export const ENROLLMENT_PAYMENT_BLOCKER = "Inventario y retenciones compartidos disponibles. La preparación nativa requiere condiciones finales validadas; cada participante acepta personalmente antes de pagar. Cobro y confirmación siguen bloqueados hasta verificar instrucciones de pago, seña y cuenta corriente de principio a fin.";
