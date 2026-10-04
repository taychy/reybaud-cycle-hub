/**
 * Estado de un preinscripto de programa, derivado SIEMPRE de datos reales:
 * - suscripción al MISMO plan (vinculada por identidad canónica vía RPC
 *   `get_program_preinscriptos`, nunca por nombre),
 * - estado manual "No continúa" = waitlist_template_entries.estado 'descartado'.
 * Un pago/inscripción real prevalece sobre "No continúa".
 */
export type PreinscriptoStatus = "preinscripto" | "pendiente_pago" | "inscripto" | "no_continua";

export interface PreinscriptoSub {
  id: string;
  estado: string;
  mp_status?: string | null;
}

/** Suscripción pagada según la semántica actual: activa o finalizada (paga y vencida). */
export const PAID_SUB_STATES = ["activa", "finalizada"];
/** Bajas: no cuentan como avance. */
export const IGNORED_SUB_STATES = ["cancelada", "baja"];

export const NO_CONTINUA_ENTRY_STATE = "descartado";

export function resolvePreinscriptoStatus(entryEstado: string | null | undefined, subs: PreinscriptoSub[]): PreinscriptoStatus {
  const live = (subs || []).filter((s) => !IGNORED_SUB_STATES.includes(s.estado));
  if (live.some((s) => PAID_SUB_STATES.includes(s.estado))) return "inscripto";
  if (live.length > 0) return "pendiente_pago";
  if (entryEstado === NO_CONTINUA_ENTRY_STATE) return "no_continua";
  return "preinscripto";
}

export const PREINSCRIPTO_STATUS_LABEL: Record<PreinscriptoStatus, string> = {
  preinscripto: "Preinscripto",
  pendiente_pago: "Pendiente de pago",
  inscripto: "Inscripto",
  no_continua: "No continúa",
};

/** Busca la respuesta de la pregunta de sede (por id o etiqueta que contenga "sede"). */
export function findSedeAnswer(preguntas: any, respuestas: any): string | null {
  const qs = Array.isArray(preguntas) ? preguntas : [];
  const q = qs.find((x: any) => /sede/i.test(String(x?.label || "")) || /sede/i.test(String(x?.id || "")));
  if (!q || !respuestas) return null;
  const v = respuestas[q.id];
  if (v == null || v === "") return null;
  return Array.isArray(v) ? v.join(", ") : String(v);
}
