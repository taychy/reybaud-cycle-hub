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

const PAYABLE_STATES = new Set([
  "pendiente",
  "pendiente_verificacion",
  "pago_pendiente",
  "acceso_pausado",
  "vencida",
]);

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
  estado: string;
  descuento_id?: string | null;
  precio_base?: number;
  precio_final?: number;
  metodo_pago?: string | null;
  origen_registro?: string | null;
  notas?: string | null;
}

/**
 * Si hay una sub a reutilizar válida para este alumno+plan, la actualiza con
 * los datos del nuevo intento de pago y devuelve su id. Si no, devuelve null
 * para que el caller siga con su INSERT normal.
 */
export async function tryReuseExistingSubscription(
  alumnoId: string,
  planId: string,
  update: ReuseUpdate,
): Promise<{ id: string } | null> {
  const existingId = getReuseSubId();
  if (!existingId) return null;

  const { data: existing, error } = await supabase
    .from("suscripciones")
    .select("id, alumno_id, plan_id, estado")
    .eq("id", existingId)
    .maybeSingle();

  if (error || !existing) return null;
  if (existing.alumno_id !== alumnoId) return null;
  if (existing.plan_id !== planId) return null;
  if (!PAYABLE_STATES.has(existing.estado as string)) return null;

  const { error: updErr } = await supabase
    .from("suscripciones")
    .update(update as any)
    .eq("id", existingId);

  if (updErr) return null;

  return { id: existingId };
}
