/**
 * Reingreso: elegir explícitamente qué mensualidad se paga.
 *
 * Regla de negocio:
 *  - Alumno ACTIVO con continuidad de suscripciones → renovación automática
 *    normal (resolvePurchasePeriod decide el período, incluido el salto al mes
 *    siguiente cuando el mes en curso ya está cubierto o estamos a fin de mes).
 *  - Alumno INACTIVO / ex alumno / con un GAP de continuidad → NO se infiere el
 *    mes en silencio: antes de crear checkout o suscripción hay que preguntar
 *    qué mensualidad quiere pagar y guardar esa elección en el backend.
 *
 * La detección la hace el backend (`get_reingreso_checkout_context`), que mira
 * el estado del alumno Y la continuidad histórica de suscripciones. Acá sólo
 * normalizamos la respuesta y decidimos si hay que mostrar el paso.
 */

import { monthLabel } from "@/lib/subscriptionPeriod";

export interface ReingresoOption {
  fechaInicio: string;
  fechaFin: string;
  suscripcionId: string | null;
  suscripcionEstado: string | null;
  planId: string | null;
  monto: number | null;
  esDeudaExistente: boolean;
}

export interface ReingresoContext {
  esReingreso: boolean;
  motivo: string | null;
  estadoAlumno: string | null;
  continuidadMesAnterior: boolean;
  ultimaCobertura: string | null;
  opciones: ReingresoOption[];
}

/** Normaliza el jsonb de `get_reingreso_checkout_context`. */
export function parseReingresoContext(raw: any): ReingresoContext | null {
  if (!raw || raw.found === false) return null;
  const opciones: ReingresoOption[] = Array.isArray(raw.opciones)
    ? raw.opciones
        .filter((o: any) => o?.fecha_inicio && o?.fecha_fin)
        .map((o: any) => ({
          fechaInicio: String(o.fecha_inicio).substring(0, 10),
          fechaFin: String(o.fecha_fin).substring(0, 10),
          suscripcionId: o.suscripcion_id ?? null,
          suscripcionEstado: o.suscripcion_estado ?? null,
          planId: o.plan_id ?? null,
          monto: o.monto === null || o.monto === undefined ? null : Number(o.monto),
          esDeudaExistente: !!o.es_deuda_existente,
        }))
    : [];
  return {
    esReingreso: !!raw.es_reingreso,
    motivo: raw.motivo ?? null,
    estadoAlumno: raw.estado_alumno ?? null,
    continuidadMesAnterior: !!raw.continuidad_mes_anterior,
    ultimaCobertura: raw.ultima_cobertura ? String(raw.ultima_cobertura).substring(0, 10) : null,
    opciones,
  };
}

export interface NeedsChoiceInput {
  context: ReingresoContext | null;
  /** Período ya elegido explícitamente por el alumno en esta sesión de checkout. */
  chosen?: { fechaInicio: string; fechaFin: string } | null;
  /** Flujos que ya tienen período propio y no deben preguntar. */
  isUpgrade?: boolean;
  isPausa?: boolean;
  isEarlyRenewal?: boolean;
  scheduleAfterPausa?: boolean;
}

/** ¿Hay que mostrar el paso "¿Qué mensualidad querés pagar?" antes del checkout? */
export function needsPeriodChoice({
  context,
  chosen,
  isUpgrade,
  isPausa,
  isEarlyRenewal,
  scheduleAfterPausa,
}: NeedsChoiceInput): boolean {
  if (!context?.esReingreso) return false;
  if (chosen) return false;
  if (isUpgrade || isPausa || isEarlyRenewal || scheduleAfterPausa) return false;
  return context.opciones.length > 0;
}

/**
 * Período final de la obligación: la elección explícita del reingreso manda por
 * sobre cualquier inferencia. Si no hubo elección, se usa el período inferido.
 */
export function effectivePurchasePeriod<T extends { fechaInicio: string; fechaFin: string }>(
  fallback: T,
  chosen?: { fechaInicio: string; fechaFin: string } | null,
): { fechaInicio: string; fechaFin: string; explicit: boolean } {
  if (chosen?.fechaInicio && chosen?.fechaFin) {
    return { fechaInicio: chosen.fechaInicio, fechaFin: chosen.fechaFin, explicit: true };
  }
  return { fechaInicio: fallback.fechaInicio, fechaFin: fallback.fechaFin, explicit: false };
}

/** Suscripción existente que hay que reutilizar (nunca duplicar) para el período elegido. */
export function existingSubForPeriod(
  context: ReingresoContext | null,
  period: { fechaInicio: string } | null,
): ReingresoOption | null {
  if (!context || !period) return null;
  return (
    context.opciones.find(
      (o) => o.fechaInicio === period.fechaInicio && !!o.suscripcionId,
    ) ?? null
  );
}

/** Texto de la opción, p. ej. "Septiembre 2026 · 01/09 al 30/09". */
export function optionLabel(option: ReingresoOption): string {
  const d = (iso: string) => {
    const [, m, day] = iso.split("-");
    return `${day}/${m}`;
  };
  const label = monthLabel(option.fechaInicio);
  const nice = label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
  return `${nice} · ${d(option.fechaInicio)} al ${d(option.fechaFin)}`;
}
