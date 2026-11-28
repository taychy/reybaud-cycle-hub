import { supabase } from "@/integrations/supabase/client";
import { buildEnrollmentRequest } from "./sanLuisEnrollment";
import { SAN_LUIS_INTAKE_ENABLED } from "./sanLuisPreRegistration";

type Request = ReturnType<typeof buildEnrollmentRequest>;
export type EnrollmentTransport = (request: Request) => Promise<{ data: unknown; error: { message: string } | null }>;
const transport: EnrollmentTransport = async (request) => supabase.rpc("submit_event_enrollment_request", request);

export interface EnrollmentReceipt {
  reference: string | null;
  duplicate: boolean;
  status?: string;
  packageName?: string;
  peopleCount?: number;
  estimatedTotal?: number;
  currency?: string;
}

/** Creates an interest request only: never a reservation, a charge or a confirmed place. */
export async function submitSanLuisEnrollment(input: unknown, options: { enabled?: boolean; transport?: EnrollmentTransport } = {}): Promise<EnrollmentReceipt> {
  const request = buildEnrollmentRequest(input);
  if (!(options.enabled ?? SAN_LUIS_INTAKE_ENABLED)) throw new Error("La recepción de solicitudes todavía no está habilitada. No se guardaron tus datos.");
  const { data, error } = await (options.transport ?? transport)(request);
  if (error) throw new Error("No pudimos guardar tu solicitud. Intentá nuevamente; tus datos siguen cargados.");
  const r = data as { ok?: unknown; duplicate?: unknown; error?: unknown; reference?: unknown; status?: unknown; package_name?: unknown; people_count?: unknown; estimated_total?: unknown; currency?: unknown } | null;
  if (r?.ok === false && typeof r.error === "string") throw new Error(`${r.error}. Tus datos siguen cargados para reintentar.`);
  if (!r || r.ok !== true) throw new Error("No pudimos confirmar la recepción. No se creó ninguna reserva ni pago.");
  if (r.duplicate === true) return { reference: null, duplicate: true, status: typeof r.status === "string" ? r.status : undefined };
  if (typeof r.reference !== "string") throw new Error("No pudimos confirmar la recepción. No se creó ninguna reserva ni pago.");
  return {
    reference: r.reference,
    duplicate: false,
    status: typeof r.status === "string" ? r.status : undefined,
    packageName: typeof r.package_name === "string" ? r.package_name : undefined,
    peopleCount: typeof r.people_count === "number" ? r.people_count : undefined,
    estimatedTotal: typeof r.estimated_total === "number" ? r.estimated_total : undefined,
    currency: typeof r.currency === "string" ? r.currency : undefined,
  };
}
