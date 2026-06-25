import { supabase } from "@/integrations/supabase/client";

/**
 * Estados que consideramos "operativos" — bloquean duplicados.
 */
const OPERATIONAL_STATES = ["activa", "pendiente", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"];

/**
 * Regla de negocio (alineada con el trigger DB `check_duplicate_active_subscription`):
 *
 * - grupal (Ruta/Gravel): sólo UNA grupal vigente por período.
 * - pista (velódromo):    sólo UNA pista vigente por período.
 * - pausa (Plan reducido): NO puede convivir con NINGUNA otra suscripción vigente.
 * - asesoria: convive con todo (nunca bloquea).
 * - otro: regla original (mismo plan + misma fecha_fin).
 *
 * Devuelve datos del conflicto si existe, null en caso contrario.
 */
export async function checkDuplicateActiveSub(
  alumnoId: string,
  planId: string,
  fechaFin: string,
  fechaInicio?: string
): Promise<{ duplicateId: string; planNombre: string } | null> {
  const { data: planNuevo } = await supabase
    .from("planes")
    .select("categoria")
    .eq("id", planId)
    .maybeSingle();

  const categoria = (planNuevo as any)?.categoria;

  if (categoria === "asesoria") return null;

  const ini = fechaInicio || new Date().toISOString().split("T")[0];
  const fin = fechaFin;

  const overlaps = (sIni: string | null, sFin: string | null) => {
    const cond1 = !sIni || !fin || sIni <= fin;
    const cond2 = !sFin || !ini || ini <= sFin;
    return cond1 && cond2;
  };

  // pausa: no puede convivir con NADA vigente
  if (categoria === "pausa") {
    const { data } = await supabase
      .from("suscripciones")
      .select("id, fecha_inicio, fecha_fin, planes(nombre)")
      .eq("alumno_id", alumnoId)
      .in("estado", OPERATIONAL_STATES)
      .is("cancelada_at", null);
    const overlap = (data as any[] | null)?.find(s => overlaps(s.fecha_inicio, s.fecha_fin));
    if (overlap) return { duplicateId: overlap.id, planNombre: overlap.planes?.nombre || "Plan vigente" };
    return null;
  }

  // grupal o pista: no puede convivir con otra de la misma modalidad ni con pausa
  if (categoria === "grupal" || categoria === "pista") {
    const { data } = await supabase
      .from("suscripciones")
      .select("id, fecha_inicio, fecha_fin, planes!inner(nombre, categoria)")
      .eq("alumno_id", alumnoId)
      .in("estado", OPERATIONAL_STATES)
      .is("cancelada_at", null)
      .in("planes.categoria", [categoria, "pausa"]);
    const overlap = (data as any[] | null)?.find(s => overlaps(s.fecha_inicio, s.fecha_fin));
    if (overlap) return { duplicateId: overlap.id, planNombre: overlap.planes?.nombre || `Plan ${categoria}` };
    return null;
  }

  // otras categorías: mismo plan + misma fecha_fin
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
    return { duplicateId: sub.id, planNombre: sub.planes?.nombre || "Sin nombre" };
  }
  return null;
}

/**
 * Detecta conflictos reales entre suscripciones operativas de un alumno
 * para alertas de UI (mismas reglas que el trigger).
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
  const subs = data as any[];

  const overlap = (a: any, b: any) => {
    const c1 = !a.fecha_inicio || !b.fecha_fin || a.fecha_inicio <= b.fecha_fin;
    const c2 = !b.fecha_inicio || !a.fecha_fin || b.fecha_inicio <= a.fecha_fin;
    return c1 && c2;
  };

  // Conflicto: pausa + cualquier otra
  const pausas = subs.filter(s => s.planes?.categoria === "pausa");
  for (const p of pausas) {
    const others = subs.filter(o => o.id !== p.id && overlap(p, o));
    if (others.length > 0) {
      results.push({
        plan_id: "pausa",
        plan_nombre: `Plan reducido + ${others.map(o => o.planes?.nombre).join(", ")}`,
        fecha_fin: p.fecha_fin || "",
        count: 1 + others.length,
        ids: [p.id, ...others.map(o => o.id)],
      });
    }
  }

  // 2+ grupales o 2+ pistas que se solapen
  for (const mod of ["grupal", "pista"] as const) {
    const list = subs.filter(s => s.planes?.categoria === mod);
    if (list.length > 1) {
      // detectar al menos un par solapado
      let conflict: any[] = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (overlap(list[i], list[j])) {
            conflict = list;
            break;
          }
        }
        if (conflict.length) break;
      }
      if (conflict.length) {
        results.push({
          plan_id: mod,
          plan_nombre: `${mod === "grupal" ? "Grupales" : "Pista"} (${conflict.map(g => g.planes?.nombre).join(", ")})`,
          fecha_fin: conflict[0].fecha_fin || "",
          count: conflict.length,
          ids: conflict.map(g => g.id),
        });
      }
    }
  }

  // "otro": mismo plan_id + misma fecha_fin
  const otros = subs.filter(s => s.planes?.categoria !== "grupal" && s.planes?.categoria !== "pista" && s.planes?.categoria !== "pausa" && s.planes?.categoria !== "asesoria");
  const groups: Record<string, { plan_id: string; plan_nombre: string; fecha_fin: string; ids: string[] }> = {};
  for (const sub of otros) {
    const key = `${sub.plan_id}|${sub.fecha_fin}`;
    if (!groups[key]) {
      groups[key] = { plan_id: sub.plan_id, plan_nombre: sub.planes?.nombre || "—", fecha_fin: sub.fecha_fin, ids: [] };
    }
    groups[key].ids.push(sub.id);
  }
  Object.values(groups)
    .filter(g => g.ids.length > 1)
    .forEach(g => results.push({ ...g, count: g.ids.length }));

  return results;
}

/**
 * Handles the DUPLICATE_ACTIVE_SUB error from the DB trigger.
 */
export function isDuplicateSubError(error: any): boolean {
  return error?.message?.includes("DUPLICATE_ACTIVE_SUB") || false;
}

export const DUPLICATE_SUB_MSG =
  "Este alumno ya tiene una suscripción incompatible activa para este período. Reglas: una sola Grupal (Ruta/Gravel), una sola Pista, y el Plan Reducido (pausa) no convive con ningún otro plan. Asesoría Personalizada puede convivir con todos.";
