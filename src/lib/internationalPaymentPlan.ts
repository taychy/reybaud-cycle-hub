/**
 * Regla reusable de planes de pago para viajes/eventos internacionales.
 *
 * - Seña 30% del paquete, al reservar (sena_vence_dias = 0).
 * - 70% restante en cuotas mensuales iguales (% del saldo).
 * - Una cuota por cada mes completo entre el lanzamiento comercial y
 *   un mes antes del inicio del viaje. Ancla = día de inicio del viaje;
 *   si el día no existe en el mes, se usa el último día del mes.
 * - La última cuota vence exactamente un mes antes del inicio.
 * - Una cuota solo se incluye si vence al menos un mes completo después
 *   del lanzamiento. Los cupos comerciales no intervienen.
 */
import {
  type InstallmentTemplate,
  type PlanTemplate,
  DEFAULT_REMINDERS_CUOTA,
  DEFAULT_REMINDERS_ULTIMA,
} from "./paymentPlanCalculator";

export const INTL_SENA_PCT = 30;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Suma meses a una fecha ISO, anclando al día `anchorDay` (con clamp a fin de mes). */
export function addMonthsAnchored(iso: string, months: number, anchorDay?: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = anchorDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(day, lastDay))}`;
}

export type IntlScheduleResult =
  | { ok: true; dueDates: string[] }
  | { ok: false; error: string };

export function computeIntlInstallmentDates(opts: {
  fechaLanzamiento: string | null | undefined;
  fechaInicio: string | null | undefined;
}): IntlScheduleResult {
  const { fechaLanzamiento, fechaInicio } = opts;
  if (!fechaLanzamiento || !ISO.test(fechaLanzamiento))
    return { ok: false, error: "Falta la fecha de lanzamiento comercial" };
  if (!fechaInicio || !ISO.test(fechaInicio))
    return { ok: false, error: "Falta la fecha de inicio del viaje" };
  const anchorDay = Number(fechaInicio.split("-")[2]);
  const minDue = addMonthsAnchored(fechaLanzamiento, 1); // un mes completo tras el lanzamiento
  const dates: string[] = [];
  for (let k = 1; k <= 240; k++) {
    const due = addMonthsAnchored(fechaInicio, -k, anchorDay);
    if (due < minDue) break;
    dates.unshift(due);
  }
  if (dates.length === 0)
    return { ok: false, error: "No hay ningún mes completo entre el lanzamiento y un mes antes del viaje" };
  return { ok: true, dueDates: dates };
}

/** Cuotas iguales en % del saldo; la última absorbe el redondeo. */
export function buildIntlInstallments(dueDates: string[]): InstallmentTemplate[] {
  const n = dueDates.length;
  const pct = Math.round((100 / n) * 100) / 100;
  return dueDates.map((due, i) => ({
    numero: i + 1,
    descripcion: `Cuota ${i + 1}`,
    monto_tipo: "porcentaje_saldo",
    monto_valor: pct,
    fecha_vencimiento: due,
    reminders_config: i === n - 1 ? DEFAULT_REMINDERS_ULTIMA : DEFAULT_REMINDERS_CUOTA,
  }));
}

export function buildIntlPlanTemplate(opts: {
  nombre?: string;
  fechaLanzamiento: string | null | undefined;
  fechaInicio: string | null | undefined;
}): { ok: true; template: PlanTemplate } | { ok: false; error: string } {
  const sched = computeIntlInstallmentDates(opts);
  if (!sched.ok) return { ok: false, error: (sched as { error: string }).error };
  const installments = buildIntlInstallments(sched.dueDates);
  return {
    ok: true,
    template: {
      nombre: opts.nombre ?? `Seña ${INTL_SENA_PCT}% + ${installments.length} cuotas`,
      sena_tipo: "porcentaje_paquete",
      sena_valor: INTL_SENA_PCT,
      sena_vence_dias: 0,
      cantidad_cuotas: installments.length,
      last_installment_absorbs_rounding: true,
      regla_reserva_tardia: "cobrar_al_reservar",
      installments,
    },
  };
}
