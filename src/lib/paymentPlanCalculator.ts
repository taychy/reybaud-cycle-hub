/**
 * Calculadora de planes de pago para paquetes de eventos.
 *
 * Reglas:
 * - El cálculo SIEMPRE se hace sobre el precio final congelado de la reserva.
 * - Seña: monto fijo o % del precio del paquete.
 * - Cuotas: monto fijo o % del saldo (precio - seña).
 * - La última cuota absorbe el redondeo si la flag está activa.
 * - Validación obligatoria: seña + Σ cuotas == precio (tolerancia 1 centavo).
 * - Una cuota nunca puede nacer vencida (salvo modo `mantener_fechas_fijas`).
 */

export type SenaTipo = "monto_fijo" | "porcentaje_paquete";
export type MontoTipo = "fijo" | "porcentaje_saldo";
export type ReglaReservaTardia =
  | "cobrar_al_reservar"
  | "reprogramar_a_hoy"
  | "mantener_fechas_fijas";

export type InstallmentTemplate = {
  numero: number;
  descripcion?: string | null;
  monto_tipo: MontoTipo;
  monto_valor: number;
  fecha_vencimiento: string | null; // YYYY-MM-DD
  reminders_config?: number[];
};

export type PlanTemplate = {
  id?: string;
  nombre: string;
  sena_tipo: SenaTipo;
  sena_valor: number;
  sena_vence_dias: number;
  cantidad_cuotas: number;
  last_installment_absorbs_rounding: boolean;
  regla_reserva_tardia: ReglaReservaTardia;
  installments: InstallmentTemplate[];
};

export type CalculatedInstallment = {
  numero: number; // 0 = seña, 1..N = cuotas
  installment_type: "sena" | "cuota";
  descripcion: string;
  monto: number;
  due_date: string; // YYYY-MM-DD
  due_date_original: string; // YYYY-MM-DD (la del template, antes de reprogramar)
  reprogramada: boolean;
  reminders_config: number[];
};

export type CalculationResult = {
  ok: boolean;
  total: number;
  sena_monto: number;
  cuotas_total: number;
  diff: number; // total - (sena + cuotas)
  installments: CalculatedInstallment[];
  errors: string[];
};

const TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const DEFAULT_REMINDERS_SENA = [0, 1, 3];
export const DEFAULT_REMINDERS_CUOTA = [-7, -2, 0, 3, 7];
export const DEFAULT_REMINDERS_ULTIMA = [-14, -7, -2, 0, 3, 7];

/**
 * Valida que un template defina cuotas que sumen el precio del paquete.
 * Útil para el editor admin (no requiere fecha de reserva).
 */
export function validateTemplate(
  template: PlanTemplate,
  precioPaquete: number,
): CalculationResult {
  return calculatePlan({
    template,
    precioFinal: precioPaquete,
    fechaReserva: todayISO(),
  });
}

/**
 * Calcula el plan de pagos materializado para una reserva concreta.
 */
export function calculatePlan(opts: {
  template: PlanTemplate;
  precioFinal: number;
  fechaReserva: string; // YYYY-MM-DD
}): CalculationResult {
  const { template, precioFinal, fechaReserva } = opts;
  const errors: string[] = [];

  if (precioFinal <= 0) {
    errors.push("El precio final debe ser mayor a 0");
  }

  // 1. Seña
  let senaMonto =
    template.sena_tipo === "monto_fijo"
      ? template.sena_valor
      : round2((precioFinal * template.sena_valor) / 100);
  senaMonto = round2(senaMonto);

  if (senaMonto < 0) errors.push("La seña no puede ser negativa");
  if (senaMonto > precioFinal)
    errors.push("La seña no puede ser mayor al precio del paquete");

  const saldo = round2(precioFinal - senaMonto);

  // 2. Cuotas
  const cuotas: CalculatedInstallment[] = [];
  const templateInstallments = [...template.installments].sort(
    (a, b) => a.numero - b.numero,
  );

  if (templateInstallments.length !== template.cantidad_cuotas) {
    errors.push(
      `cantidad_cuotas (${template.cantidad_cuotas}) no coincide con ${templateInstallments.length} cuotas definidas`,
    );
  }

  let cuotasAccum = 0;
  templateInstallments.forEach((inst, idx) => {
    const esUltima = idx === templateInstallments.length - 1;
    let monto =
      inst.monto_tipo === "fijo"
        ? inst.monto_valor
        : round2((saldo * inst.monto_valor) / 100);
    monto = round2(monto);

    if (
      esUltima &&
      template.last_installment_absorbs_rounding &&
      templateInstallments.length > 0
    ) {
      monto = round2(saldo - cuotasAccum);
    } else {
      cuotasAccum = round2(cuotasAccum + monto);
    }

    const isUltima = esUltima;
    const defaultReminders = isUltima
      ? DEFAULT_REMINDERS_ULTIMA
      : DEFAULT_REMINDERS_CUOTA;
    const reminders =
      inst.reminders_config && inst.reminders_config.length > 0
        ? inst.reminders_config
        : defaultReminders;

    const dueOriginal = inst.fecha_vencimiento ?? fechaReserva;
    cuotas.push({
      numero: inst.numero,
      installment_type: "cuota",
      descripcion: inst.descripcion ?? `Cuota ${inst.numero}`,
      monto,
      due_date: dueOriginal,
      due_date_original: dueOriginal,
      reprogramada: false,
      reminders_config: reminders,
    });
  });

  // Recalcular suma final de cuotas
  const cuotasTotal = round2(cuotas.reduce((s, c) => s + c.monto, 0));
  const diff = round2(precioFinal - senaMonto - cuotasTotal);

  if (Math.abs(diff) > TOLERANCE) {
    errors.push(
      `Seña + cuotas (${(senaMonto + cuotasTotal).toFixed(2)}) ≠ precio (${precioFinal.toFixed(
        2,
      )}). Diferencia: ${diff.toFixed(2)}`,
    );
  }

  // 3. Aplicar regla de reservas tardías
  const hoy = parseISO(fechaReserva);
  const cuotasFuturas: CalculatedInstallment[] = [];
  let cuotasVencidasMonto = 0;

  cuotas.forEach((c) => {
    const venc = parseISO(c.due_date);
    if (venc < hoy) {
      if (template.regla_reserva_tardia === "cobrar_al_reservar") {
        cuotasVencidasMonto = round2(cuotasVencidasMonto + c.monto);
        // se omite, va a la seña
      } else if (template.regla_reserva_tardia === "reprogramar_a_hoy") {
        cuotasFuturas.push({
          ...c,
          due_date: fechaReserva,
          reprogramada: true,
        });
      } else {
        cuotasFuturas.push(c); // nace vencida
      }
    } else {
      cuotasFuturas.push(c);
    }
  });

  // Seña final (incluye cuotas tardías consolidadas si aplica)
  const senaTotalMonto = round2(senaMonto + cuotasVencidasMonto);
  const senaDueDate = addDaysISO(fechaReserva, template.sena_vence_dias);

  const senaInstallment: CalculatedInstallment = {
    numero: 0,
    installment_type: "sena",
    descripcion: "Seña",
    monto: senaTotalMonto,
    due_date: senaDueDate,
    due_date_original: senaDueDate,
    reprogramada: false,
    reminders_config: DEFAULT_REMINDERS_SENA,
  };

  return {
    ok: errors.length === 0,
    total: precioFinal,
    sena_monto: senaTotalMonto,
    cuotas_total: round2(cuotasFuturas.reduce((s, c) => s + c.monto, 0)),
    diff,
    installments: [senaInstallment, ...cuotasFuturas],
    errors,
  };
}

/**
 * Genera N cuotas mensuales con vencimiento el día N de cada mes,
 * cada cuota como % igual del saldo (la última absorbe redondeo).
 */
export function generateMonthlyInstallments(opts: {
  cantidad: number;
  fechaPrimera: string; // YYYY-MM-DD
}): InstallmentTemplate[] {
  const { cantidad, fechaPrimera } = opts;
  if (cantidad <= 0) return [];
  const porcentaje = round2(100 / cantidad);
  const [y, m, d] = fechaPrimera.split("-").map(Number);
  const out: InstallmentTemplate[] = [];
  for (let i = 0; i < cantidad; i++) {
    const dt = new Date(y, m - 1 + i, d);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
      dt.getDate(),
    ).padStart(2, "0")}`;
    out.push({
      numero: i + 1,
      descripcion: `Cuota ${i + 1}`,
      monto_tipo: "porcentaje_saldo",
      monto_valor: porcentaje,
      fecha_vencimiento: iso,
      reminders_config:
        i === cantidad - 1 ? DEFAULT_REMINDERS_ULTIMA : DEFAULT_REMINDERS_CUOTA,
    });
  }
  return out;
}
