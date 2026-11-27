import { supabase } from "@/integrations/supabase/client";
import { buildPreRegistrationRequest, SAN_LUIS_INTAKE_ENABLED } from "./sanLuisPreRegistration";

type Request = ReturnType<typeof buildPreRegistrationRequest>;
export type PreRegistrationTransport = (request: Request) => Promise<{ data: unknown; error: { message: string } | null }>;
const transport: PreRegistrationTransport = async (request) => supabase.rpc("submit_waitlist_entry", request);

/** No production writes while the events' existing intake gates remain closed. */
export async function submitSanLuisPreRegistration(input: unknown, options: { enabled?: boolean; transport?: PreRegistrationTransport } = {}) {
  const request = buildPreRegistrationRequest(input);
  if (!(options.enabled ?? SAN_LUIS_INTAKE_ENABLED)) throw new Error("La recepción de preinscripciones todavía no está habilitada. Esta es una vista previa; no se guardaron tus datos.");
  const { data, error } = await (options.transport ?? transport)(request);
  if (error) throw new Error("No pudimos guardar tu preinscripción. Intentá nuevamente más tarde.");
  if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true || !("id" in data) || typeof data.id !== "string") {
    throw new Error("No pudimos confirmar la recepción. No se confirmó ninguna reserva ni pago.");
  }
  return { id: data.id };
}