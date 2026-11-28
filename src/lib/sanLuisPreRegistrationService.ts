import { supabase } from "@/integrations/supabase/client";
import { buildPreRegistrationRequest, SAN_LUIS_INTAKE_ENABLED } from "./sanLuisPreRegistration";

type Request = ReturnType<typeof buildPreRegistrationRequest>;
export type PreRegistrationTransport = (request: Request) => Promise<{ data: unknown; error: { message: string } | null }>;
const transport: PreRegistrationTransport = async (request) => supabase.rpc("submit_event_preregistration", request);

/** Interest-only intake: no reservation, seat or payment. Success only on a real server confirmation. */
export async function submitSanLuisPreRegistration(input: unknown, options: { enabled?: boolean; transport?: PreRegistrationTransport } = {}) {
  const request = buildPreRegistrationRequest(input);
  if (!(options.enabled ?? SAN_LUIS_INTAKE_ENABLED)) throw new Error("La recepción de preinscripciones todavía no está habilitada. Esta es una vista previa; no se guardaron tus datos.");
  const { data, error } = await (options.transport ?? transport)(request);
  if (error) throw new Error("No pudimos guardar tu preinscripción. Intentá nuevamente más tarde.");
  const r = data as { ok?: unknown; id?: unknown; duplicate?: unknown; error?: unknown } | null;
  if (r && r.ok === false && typeof r.error === "string") throw new Error(`${r.error}. Tus datos siguen cargados para reintentar.`);
  if (!r || r.ok !== true) throw new Error("No pudimos confirmar la recepción. No se confirmó ninguna reserva ni pago.");
  if (r.duplicate === true) return { id: null, duplicate: true as const };
  if (typeof r.id !== "string") throw new Error("No pudimos confirmar la recepción. No se confirmó ninguna reserva ni pago.");
  return { id: r.id, duplicate: false as const };
}