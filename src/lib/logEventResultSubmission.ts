import { supabase } from "@/integrations/supabase/client";

interface LogEventResultParams {
  eventId: string;
  eventTitle?: string;
  alumnoId?: string | null;
  alumnoEmail?: string | null;
  participantId?: string | null;
  source: "event_detail" | "public_token";
  distanceKm: number | null;
  comment?: string | null;
  isEdit: boolean;
}

/**
 * Registra una submission/edición de resultado en audit_log.
 * No bloquea la operación principal si falla.
 */
export async function logEventResultSubmission(params: LogEventResultParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || params.alumnoEmail || "anonymous";

    await supabase.from("audit_log").insert({
      user_id: userId || "00000000-0000-0000-0000-000000000000",
      user_email: userEmail,
      user_role: userId ? "alumno" : "public",
      action: params.isEdit ? "event_result_updated" : "event_result_submitted",
      entity_type: "event_result_submission",
      entity_id: params.eventId,
      details: {
        event_id: params.eventId,
        event_title: params.eventTitle || null,
        alumno_id: params.alumnoId || null,
        participant_id: params.participantId || null,
        source: params.source,
        distance_km: params.distanceKm,
        comment: params.comment || null,
        submitted_at: new Date().toISOString(),
      },
    } as any);
  } catch {
    // Silent fail — auditoría no debe bloquear UI
  }
}
