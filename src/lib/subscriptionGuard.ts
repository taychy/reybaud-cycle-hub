import { supabase } from "@/integrations/supabase/client";

/**
 * Checks if a student already has an active subscription for the same plan and period.
 * Returns the existing subscription id if found, null otherwise.
 */
export async function checkDuplicateActiveSub(
  alumnoId: string,
  planId: string,
  fechaFin: string
): Promise<{ duplicateId: string; planNombre: string } | null> {
  const { data } = await supabase
    .from("suscripciones")
    .select("id, planes(nombre)")
    .eq("alumno_id", alumnoId)
    .eq("plan_id", planId)
    .eq("fecha_fin", fechaFin)
    .eq("estado", "activa")
    .is("cancelada_at", null)
    .limit(1);

  if (data && data.length > 0) {
    const sub = data[0] as any;
    return {
      duplicateId: sub.id,
      planNombre: sub.planes?.nombre || "Sin nombre",
    };
  }
  return null;
}

/**
 * Detects duplicate active subs for a student (same plan + same fecha_fin).
 * Used for UI alerts.
 */
export async function detectDuplicateActiveSubs(alumnoId: string): Promise<
  { plan_id: string; plan_nombre: string; fecha_fin: string; count: number; ids: string[] }[]
> {
  const { data } = await supabase
    .from("suscripciones")
    .select("id, plan_id, fecha_fin, estado, cancelada_at, planes(nombre)")
    .eq("alumno_id", alumnoId)
    .eq("estado", "activa")
    .is("cancelada_at", null);

  if (!data || data.length === 0) return [];

  const groups: Record<string, { plan_id: string; plan_nombre: string; fecha_fin: string; ids: string[] }> = {};
  for (const sub of data as any[]) {
    const key = `${sub.plan_id}|${sub.fecha_fin}`;
    if (!groups[key]) {
      groups[key] = { plan_id: sub.plan_id, plan_nombre: sub.planes?.nombre || "—", fecha_fin: sub.fecha_fin, ids: [] };
    }
    groups[key].ids.push(sub.id);
  }

  return Object.values(groups)
    .filter(g => g.ids.length > 1)
    .map(g => ({ ...g, count: g.ids.length }));
}

/**
 * Handles the DUPLICATE_ACTIVE_SUB error from the DB trigger.
 * Returns true if the error was a duplicate, false otherwise.
 */
export function isDuplicateSubError(error: any): boolean {
  return error?.message?.includes("DUPLICATE_ACTIVE_SUB") || false;
}

export const DUPLICATE_SUB_MSG = "Este alumno ya tiene este plan activo para este período. No se creó una suscripción duplicada.";
