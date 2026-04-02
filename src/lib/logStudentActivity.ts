import { supabase } from "@/integrations/supabase/client";

interface LogActivityParams {
  alumnoId: string;
  eventType: string;
  title: string;
  description?: string;
  actorRole?: string;
  referenceType?: string;
  referenceId?: string;
  referenceLabel?: string;
}

export async function logStudentActivity({
  alumnoId,
  eventType,
  title,
  description,
  actorRole,
  referenceType,
  referenceId,
  referenceLabel,
}: LogActivityParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("student_activity_log").insert({
      alumno_id: alumnoId,
      event_type: eventType,
      title,
      description: description || null,
      actor_id: session?.user?.id || null,
      actor_email: session?.user?.email || null,
      actor_role: actorRole || "admin",
      reference_type: referenceType || null,
      reference_id: referenceId || null,
      reference_label: referenceLabel || null,
    } as any);
  } catch {
    // Silent fail — activity log should not block operations
  }
}
