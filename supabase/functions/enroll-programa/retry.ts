// Decide si una inscripción a programa puede reintentar el pago y con qué suscripción.
// Regla: el beneficio de preinscripción solo se consume con un pago confirmado
// (trigger SQL al pasar la suscripción a 'activa'). Mientras tanto, el mismo enlace
// reutiliza SIEMPRE la misma suscripción (mismo precio y cuotas), y nunca se
// genera un cobro nuevo si ya hay un pago aprobado, en proceso o en verificación.

export interface RetrySub {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string | null;
  cancelada_at?: string | null;
  mp_status?: string | null;
  pagado: number;
}

export interface RetryInput {
  alumnoId: string;
  planId: string;
  benefit?: { used_at: string | null; suscripcion_id: string | null } | null;
  benefitSub?: RetrySub | null;
  existingSub?: RetrySub | null;
}

export type RetryDecision =
  | { action: "new" }
  | { action: "reuse"; suscripcionId: string }
  | { action: "reject"; code: string; error: string; suscripcionId?: string };

const ESTADOS_REUSABLES = new Set(["pendiente", "pendiente_pago", "cancelada", "vencida"]);

export function decideEnrollmentRetry(input: RetryInput): RetryDecision {
  const { alumnoId, planId, benefit, benefitSub, existingSub } = input;

  if (benefit?.used_at) {
    return { action: "reject", code: "BENEFICIO_USADO", error: "Este precio especial ya fue utilizado en una inscripción pagada." };
  }
  if (benefitSub && (benefitSub.alumno_id !== alumnoId || benefitSub.plan_id !== planId)) {
    return { action: "reject", code: "BENEFICIO_INVALIDO", error: "Tu enlace de precio especial no es válido o ya venció." };
  }

  const candidate = existingSub ?? (benefitSub && !benefitSub.cancelada_at ? benefitSub : null);
  if (!candidate) return { action: "new" };

  const mp = (candidate.mp_status ?? "").toLowerCase();
  if (candidate.estado === "activa" || mp === "approved" || candidate.pagado > 0) {
    return { action: "reject", code: "PAGO_YA_REGISTRADO", error: "Ya registramos un pago para esta inscripción. Escribinos si necesitás ayuda.", suscripcionId: candidate.id };
  }
  if (mp === "in_process" || mp === "pending" || mp === "authorized") {
    return { action: "reject", code: "PAGO_EN_PROCESO", error: "Tu pago está siendo procesado por Mercado Pago. Esperá la confirmación antes de reintentar.", suscripcionId: candidate.id };
  }
  if (candidate.estado === "pendiente_verificacion") {
    return { action: "reject", code: "PAGO_EN_VERIFICACION", error: "Estamos verificando tu comprobante. Te avisamos apenas lo confirmemos.", suscripcionId: candidate.id };
  }
  if (!ESTADOS_REUSABLES.has(String(candidate.estado))) {
    return { action: "reject", code: "ALREADY_ENROLLED", error: "Ya tenés una inscripción a este programa. Escribinos si necesitás ayuda.", suscripcionId: candidate.id };
  }
  return { action: "reuse", suscripcionId: candidate.id };
}
