import { z } from "zod";

export const SCOTT_JORNADA_SLUG = "scott-28-noviembre";
export const SCOTT_JORNADA_URL = "https://reybaud-app.com/scott-28-noviembre";
export function normalizeJornadaPhone(raw: string): string {
  if (raw.length > 40 || !/^\+?[0-9 ().-]+$/.test(raw)) return "";
  let phone = raw.replace(/\D/g, "").replace(/^00/, "");
  if (phone.length === 10) phone = `549${phone}`;
  if (phone.length === 12 && phone.startsWith("54")) phone = `549${phone.slice(2)}`;
  return phone;
}
export const jornadaFormSchema = z.object({
  first_name: z.string().trim().min(1, "Completá tu nombre").max(100),
  last_name: z.string().trim().min(1, "Completá tu apellido").max(100),
  phone: z.string().transform(normalizeJornadaPhone).pipe(z.string().regex(/^[1-9][0-9]{7,14}$/, "Ingresá un WhatsApp válido con código de país")),
  response: z.enum(["voy", "no_voy"]),
});
export type JornadaOwn = z.infer<typeof jornadaFormSchema>;
export type JornadaStatus = { title: string; date: string; capacity: number; confirmed: number; is_open: boolean; own: JornadaOwn | null };
export function createJornadaToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
export function jornadaError(message: string) {
  for (const known of ["Cupos completos", "Inscripción cerrada", "Ese WhatsApp ya está registrado.", "Enlace de otra persona", "WhatsApp inválido"]) {
    if (message.includes(known)) return known === "Ese WhatsApp ya está registrado." ? "Ese WhatsApp ya está registrado. Reabrí tu enlace personal o consultá a la organización." : known;
  }
  return "No pudimos guardar tu respuesta. Revisá los datos e intentá de nuevo.";
}