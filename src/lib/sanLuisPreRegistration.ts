import { z } from "zod";

// Display snapshot checked against the eight inactive packages on 27/11/2026. The server
// (submit_event_preregistration) re-reads package and price from the database; this file never decides price.
// Maintenance switch: set to false to close the form; server gate is events.metadata.preregistration.enabled.
export const SAN_LUIS_INTAKE_ENABLED = true;
export type CampKey = "full" | "mini";
export const sanLuisCamps = {
  full: { id: "408a8eb8-fb62-4a50-ad6d-040bd5716797", label: "Camp completo", dates: "Lunes 18 a domingo 24 de enero", days: 7, nights: 6, capacity: 30 },
  mini: { id: "5380df24-6bbf-4d25-81cd-a1ab2b41bd94", label: "Mini Camp", dates: "Jueves 21 a domingo 24 de enero", days: 4, nights: 3, capacity: 15 },
} as const;
export const sanLuisPackages = {
  full: [
    { id: "f6f4bc69-e7cb-42b6-9d6e-063104bf215a", label: "Habitación doble", occupancy: 2, meals: true, price: 1950000, lodgingGroup: null },
    { id: "02ce40fb-9c74-4a97-a820-d1978db5cd26", label: "Habitación individual", occupancy: 1, meals: true, price: 2480000, lodgingGroup: null },
    { id: "19dc0e38-62f5-45cf-9bdb-7960e6d78c73", label: "Cabaña · pensión completa", occupancy: 3, meals: true, price: 1950000, lodgingGroup: "cabana_3_plazas" },
    { id: "2d4ac361-9f03-4504-8811-87c7c326ac5a", label: "Cabaña · sin almuerzo ni cena", occupancy: 3, meals: false, price: 1420000, lodgingGroup: "cabana_3_plazas" },
  ],
  mini: [
    { id: "4f79eb11-a90b-4deb-9786-eadf8474bc8c", label: "Habitación doble", occupancy: 2, meals: true, price: 1070000, lodgingGroup: null },
    { id: "4f36e4ea-0684-4112-af4b-c64fb2cfd821", label: "Habitación individual", occupancy: 1, meals: true, price: 1340000, lodgingGroup: null },
    { id: "35bd597d-5a8d-4e39-bf97-504976e71c90", label: "Cabaña · pensión completa", occupancy: 3, meals: true, price: 1070000, lodgingGroup: "cabana_3_plazas" },
    { id: "a2da8b8b-4b39-4a83-82b5-cbccfe1b51ee", label: "Cabaña · sin almuerzo ni cena", occupancy: 3, meals: false, price: 830000, lodgingGroup: "cabana_3_plazas" },
  ],
} as const;
export const preRegistrationSchema = z.object({
  firstName: z.string().trim().min(2, "Revisá tu nombre").max(50),
  lastName: z.string().trim().min(2, "Revisá tu apellido").max(50),
  email: z.string().trim().email("Revisá tu email").max(150),
  phone: z.string().trim().max(30).refine(v => /^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15, "Revisá tu WhatsApp, con código de área"),
  camp: z.enum(["full", "mini"]),
  packageId: z.string().uuid(),
  extraNight: z.boolean(),
  comment: z.string().trim().max(600),
  consent: z.literal(true, { errorMap: () => ({ message: "Necesitamos tu autorización para contactarte" }) }),
}).superRefine((v, ctx) => {
  if (!sanLuisPackages[v.camp].some(p => p.id === v.packageId)) ctx.addIssue({ code: "custom", path: ["packageId"], message: "Elegí un alojamiento de este camp" });
  if (v.camp === "mini" && v.extraNight) ctx.addIssue({ code: "custom", path: ["extraNight"], message: "La noche del 17/01 corresponde solo al camp completo" });
});
export type PreRegistrationInput = z.infer<typeof preRegistrationSchema>;
export const PRE_REGISTRATION_CONFIRMATION = "Recibimos tu preinscripción. Esto no confirma todavía una reserva ni requiere pago. Te vamos a contactar con disponibilidad y condiciones definitivas.";

export function buildPreRegistrationRequest(input: unknown) {
  const v = preRegistrationSchema.parse(input);
  return {
    p_event_id: sanLuisCamps[v.camp].id, p_package_id: v.packageId,
    p_first_name: v.firstName, p_last_name: v.lastName, p_email: v.email.toLowerCase(), p_phone: v.phone,
    p_extra_night: v.camp === "full" && v.extraNight, p_comment: v.comment, p_consent: true as const,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  };
}

export const SAN_LUIS_PUBLIC_PATH = "/san-luis-2027#preinscripcion";
export const isSanLuisEvent = (eventId: string | undefined) => !!eventId && Object.values(sanLuisCamps).some(c => c.id === eventId);
/** Admin-facing summary of a stored pre-registration (reads only the saved row). */
export function sanLuisPreRegistrationSummary(r: { package_id?: string; extra_night_interest?: boolean; comment?: string } | null | undefined) {
  const pkg = Object.values(sanLuisPackages).flat().find(p => p.id === r?.package_id);
  return {
    meals: pkg ? (pkg.meals ? "Desayuno, almuerzo y cena" : "Solo desayuno · sin almuerzo ni cena") : "Sin dato",
    extraNight: r?.extra_night_interest ? "Le interesa la noche extra del 17/01" : "Sin noche extra",
    comment: r?.comment?.trim() || "",
  };
}
