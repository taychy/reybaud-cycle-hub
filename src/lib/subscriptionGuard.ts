import { supabase } from "@/integrations/supabase/client";

/**
 * Estados que consideramos "operativos" — bloquean duplicados.
 */
const OPERATIONAL_STATES = ["activa", "pendiente", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"];

/**
 * Regla de negocio (alineada con el trigger DB `check_duplicate_active_subscription`):
 *
 * - Si el plan nuevo es categoría "grupal" (Pase Libre, Grupal 1x, Grupal 2x,
 *   Grupo de formación nivel inicial, Plan Grupal a Distancia → ruta/gravel):
 *   el alumno NO puede tener otra suscripción grupal cuyo período se solape.
 *   Sí puede coexistir con Pista y/o Asesoría Personalizada.
 *
 * - Para el resto de categorías: no se permite el mismo plan con la misma
 *   fecha_fin (regla original).
 *
 * Devuelve datos del conflicto si existe, null en caso contrario.
 */
export async function checkDuplicateActiveSub(
  alumnoId: string,
  planId: string,
  fechaFin: string,
  fechaInicio?: string
): Promise<{ duplicateId: string; planNombre: string } | null> {
  // 1) Obtener categoría del plan nuevo
  const { data: planNuevo } = await supabase
    .from("planes")
    .select("categoria")
    .eq("id", planId)
    .maybeSingle();

  const categoria = (planNuevo as any)?.categoria;

  if (categoria === "grupal") {
    // Buscar cualquier suscripción grupal vigente que se solape
    const { data } = await supabase
      .from("suscripciones")
      .select("id, fecha_inicio, fecha_fin, planes!inner(nombre, categoria)")
      .eq("alumno_id", alumnoId)
      .eq("planes.categoria", "grupal")
      .in("estado", OPERATIONAL_STATES)
      .is("cancelada_at", null);

    if (data && data.length > 0) {
      const ini = fechaInicio || new Date().toISOString().split("T")[0];
      const overlap = (data as any[]).find((s) => {
        const sIni = s.fecha_inicio;
        const sFin = s.fecha_fin;
        // Solape: a.inicio <= b.fin && b.inicio <= a.fin (NULL = abierto)
        const cond1 = !sIni || !fechaFin || sIni <= fechaFin;
        const cond2 = !sFin || !ini || ini <= sFin;
        return cond1 && cond2;
      });
      if (overlap) {
        return {
          duplicateId: overlap.id,
          planNombre: overlap.planes?.nombre || "Plan grupal",
        };
      }
    }
    return null;
  }

  // Otras categorías: regla original (mismo plan + misma fecha_fin)
  const { data } = await supabase
    .from("suscripciones")
    .select("id, planes(nombre)")
    .eq("alumno_id", alumnoId)
    .eq("plan_id", planId)
    .eq("fecha_fin", fechaFin)
    .in("estado", OPERATIONAL_STATES)
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
 * Detecta suscripciones operativas duplicadas para alertas de UI.
 * - Agrupa por categoría "grupal" (más de una vigente = conflicto).
 * - Para otras categorías: mismo plan_id + misma fecha_fin.
 */
export async function detectDuplicateActiveSubs(alumnoId: string): Promise<
  { plan_id: string; plan_nombre: string; fecha_fin: string; count: number; ids: string[] }[]
> {
  const { data } = await supabase
    .from("suscripciones")
    .select("id, plan_id, fecha_inicio, fecha_fin, estado, cancelada_at, planes(nombre, categoria)")
    .eq("alumno_id", alumnoId)
    .in("estado", OPERATIONAL_STATES)
    .is("cancelada_at", null);

  if (!data || data.length === 0) return [];

  const results: { plan_id: string; plan_nombre: string; fecha_fin: string; count: number; ids: string[] }[] = [];

  // Conflicto grupal: más de una sub grupal vigente
  const grupales = (data as any[]).filter((s) => s.planes?.categoria === "grupal");
  if (grupales.length > 1) {
    results.push({
      plan_id: "grupal",
      plan_nombre: `Grupales (${grupales.map((g) => g.planes?.nombre).join(", ")})`,
      fecha_fin: grupales[0].fecha_fin || "",
      count: grupales.length,
      ids: grupales.map((g) => g.id),
    });
  }

  // Otros: agrupar por plan_id + fecha_fin
  const noGrupales = (data as any[]).filter((s) => s.planes?.categoria !== "grupal");
  const groups: Record<string, { plan_id: string; plan_nombre: string; fecha_fin: string; ids: string[] }> = {};
  for (const sub of noGrupales) {
    const key = `${sub.plan_id}|${sub.fecha_fin}`;
    if (!groups[key]) {
      groups[key] = { plan_id: sub.plan_id, plan_nombre: sub.planes?.nombre || "—", fecha_fin: sub.fecha_fin, ids: [] };
    }
    groups[key].ids.push(sub.id);
  }
  Object.values(groups)
    .filter((g) => g.ids.length > 1)
    .forEach((g) => results.push({ ...g, count: g.ids.length }));

  return results;
}

/**
 * Handles the DUPLICATE_ACTIVE_SUB error from the DB trigger.
 */
export function isDuplicateSubError(error: any): boolean {
  return error?.message?.includes("DUPLICATE_ACTIVE_SUB") || false;
}

export const DUPLICATE_SUB_MSG =
  "Este alumno ya tiene una suscripción grupal (ruta/gravel) activa para este período. Sólo se permite una grupal por período (sí puede sumar Pista o Asesoría Personalizada).";
