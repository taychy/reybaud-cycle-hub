/**
 * Helpers para reutilizar una suscripción existente al pagar desde "Mis pagos"
 * en vez de generar una sub nueva (que termina creando un período fantasma,
 * como el caso Natalia: pagó junio pendiente → se generó un mes de julio).
 *
 * Flujo:
 *   - StudentPayments.goToCheckout guarda en localStorage el id de la sub
 *     del período actual que el alumno quiere regularizar.
 *   - Los checkouts (MP, manual, tarjeta) leen ese id; si coincide alumno+plan
 *     y la sub está en un estado pagable y todavía corresponde al período
 *     actual, hacen UPDATE en lugar de INSERT.
 */

import { supabase } from "@/integrations/supabase/client";

export const REUSE_SUB_KEY = "alumno_pay_existing_sub_id";

/**
 * Marca como "vencida" cualquier sub del alumno con estado='activa' pero
 * fecha_fin ya pasada (caso típico: el cron aún no corrió). Se llama antes
 * de crear una sub nueva para evitar que el trigger de duplicado bloquee.
 * Nunca lanza; si falla, deja seguir el flujo — el error real lo verá el INSERT.
 */
export async function expireStaleSubs(alumnoId: string, planId?: string): Promise<void> {
  try {
    await supabase.rpc("expire_stale_subscriptions_for_alumno" as any, {
      p_alumno_id: alumnoId,
      p_plan_id: planId ?? null,
    });
  } catch (e) {
    console.warn("[expireStaleSubs] failed (non-fatal)", e);
  }
}




export function getReuseSubId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(REUSE_SUB_KEY);
}

export function setReuseSubId(id: string) {
  localStorage.setItem(REUSE_SUB_KEY, id);
}

export function clearReuseSubId() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(REUSE_SUB_KEY);
  }
}

interface ReuseUpdate {
  estado: "pendiente" | "pendiente_verificacion";
  descuento_id?: string | null;
  precio_base?: number;
  precio_final?: number;
  metodo_pago?: string | null;
  origen_registro?: string | null;
  notas?: string | null;
}

/**
 * Si hay una sub a reutilizar válida para este alumno+plan, la actualiza vía RPC
 * `reuse_pending_subscription` (SECURITY DEFINER que valida ownership y estado
 * pagable) y devuelve su id. Si no, devuelve null para que el caller siga con
 * su INSERT normal.
 */
export async function tryReuseExistingSubscription(
  alumnoId: string,
  planId: string,
  update: ReuseUpdate,
): Promise<{ id: string } | null> {
  let existingId = getReuseSubId();

  // Fallback: si no hay id en localStorage (el alumno entró a /planes desde un
  // enlace genérico y no desde "Pagar este plan"), buscar automáticamente una
  // sub pendiente del mismo alumno+plan cuyo período siga vigente para evitar
  // que el trigger `DUPLICATE_GRUPAL_CATEGORY` bloquee un INSERT redundante.
  if (!existingId) {
    const today = new Date().toISOString().split("T")[0];
    const { data: candidate } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", alumnoId)
      .eq("plan_id", planId)
      .in("estado", ["pendiente", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"])
      .is("cancelada_at", null)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (candidate?.id) {
      existingId = candidate.id;
    }
  }

  if (!existingId) return null;

  const { data, error } = await supabase.rpc("reuse_pending_subscription" as any, {
    p_sub_id: existingId,
    p_alumno_id: alumnoId,
    p_plan_id: planId,
    p_estado: update.estado,
    p_descuento_id: update.descuento_id ?? null,
    p_precio_base: update.precio_base ?? null,
    p_precio_final: update.precio_final ?? null,
    p_metodo_pago: update.metodo_pago ?? null,
    p_origen_registro: update.origen_registro ?? null,
    p_notas: update.notas ?? null,
  });

  if (error || !data) return null;
  return { id: existingId };
}

/**
 * Tras un pago exitoso de un plan, cierra las subs "pendientes" huérfanas del
 * mismo alumno cuyo plan_id sea DISTINTO al recién pagado y cuyo período aún
 * esté vigente (fecha_fin >= hoy o null). Evita el patrón "sub fantasma": si el
 * cron generó pendiente del Plan A pero el alumno pagó el Plan B desde /planes,
 * la pendiente de A quedaba viva ensuciando cuenta corriente.
 *
 * Nunca lanza — el pago ya se aplicó, esto es best-effort.
 */
export async function closeOrphanPendingSubs(
  alumnoId: string,
  paidPlanId: string,
  paidSubId?: string,
): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: orphans } = await supabase
      .from("suscripciones")
      .select("id, plan_id, planes:plan_id(nombre)")
      .eq("alumno_id", alumnoId)
      .eq("estado", "pendiente")
      .neq("plan_id", paidPlanId)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`);

    if (!orphans || orphans.length === 0) return;

    for (const o of orphans as any[]) {
      if (paidSubId && o.id === paidSubId) continue;
      await supabase
        .from("suscripciones")
        .update({
          estado: "cancelada",
          cancelada_at: new Date().toISOString(),
          cancelada_motivo: `Reemplazada por pago de otro plan`,
          auto_renovacion: false,
        } as any)
        .eq("id", o.id);
    }
    clearReuseSubId();
  } catch (e) {
    console.warn("[closeOrphanPendingSubs] failed (non-fatal)", e);
  }
}

