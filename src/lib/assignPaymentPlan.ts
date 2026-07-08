import { supabase } from "@/integrations/supabase/client";
import {
  calculatePlan,
  type InstallmentTemplate,
  type PlanTemplate,
} from "./paymentPlanCalculator";

/**
 * Asigna un plan de pagos a una reserva existente que no lo tenía
 * (o lo reemplaza si no hay cuotas materializadas todavía).
 *
 * Flujo:
 *  1. Trae el plan + installments del template.
 *  2. Calcula el detalle con calculatePlan usando el precio final actual.
 *  3. Escribe payment_plan_id + snapshot en la reserva.
 *  4. Llama a materialize_reservation_installments (RPC).
 *  5. Llama a impute_validated_payments_to_installments para imputar
 *     los pagos huérfanos en orden (Seña → Cuota 1 → …).
 */
export async function assignPaymentPlanToReservation(opts: {
  reservationId: string;
  paymentPlanId: string;
  precioFinal: number;
}): Promise<{ ok: true; installments: number } | { ok: false; error: string }> {
  const { reservationId, paymentPlanId, precioFinal } = opts;

  // 1. Plan
  const { data: plan, error: planErr } = await supabase
    .from("event_package_payment_plans" as any)
    .select("*")
    .eq("id", paymentPlanId)
    .maybeSingle();
  if (planErr || !plan) {
    return { ok: false, error: planErr?.message || "Plan no encontrado" };
  }
  const p = plan as any;

  // 2. Installments template
  const { data: insts, error: instErr } = await supabase
    .from("event_package_payment_plan_installments" as any)
    .select("*")
    .eq("plan_id", p.id)
    .order("numero", { ascending: true });
  if (instErr) return { ok: false, error: instErr.message };

  const templateInstallments: InstallmentTemplate[] = ((insts as any[]) || []).map((i) => ({
    numero: i.numero,
    descripcion: i.descripcion,
    monto_tipo: i.monto_tipo,
    monto_valor: Number(i.monto_valor),
    fecha_vencimiento: i.fecha_vencimiento,
    reminders_config: Array.isArray(i.reminders_config) ? i.reminders_config : [],
  }));

  const template: PlanTemplate = {
    id: p.id,
    nombre: p.nombre,
    sena_tipo: p.sena_tipo,
    sena_valor: Number(p.sena_valor),
    sena_vence_dias: p.sena_vence_dias ?? 0,
    cantidad_cuotas: p.cantidad_cuotas,
    last_installment_absorbs_rounding: !!p.last_installment_absorbs_rounding,
    regla_reserva_tardia: p.regla_reserva_tardia,
    installments: templateInstallments,
  };

  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const result = calculatePlan({ template, precioFinal, fechaReserva: todayISO });
  if (!result.ok) {
    return { ok: false, error: `Plan inválido: ${result.errors.join(", ")}` };
  }

  // 3. Snapshot en la reserva
  const { error: upErr } = await supabase
    .from("event_reservations" as any)
    .update({
      payment_plan_id: p.id,
      payment_plan_name_snapshot: p.nombre,
      payment_plan_snapshot: {
        version: p.version,
        template,
        calculated: result,
        precio_final: precioFinal,
        fecha_reserva: todayISO,
      },
    })
    .eq("id", reservationId);
  if (upErr) return { ok: false, error: upErr.message };

  // 4. Materializar
  const { error: matErr } = await supabase.rpc(
    "materialize_reservation_installments" as any,
    { p_reservation_id: reservationId },
  );
  if (matErr) return { ok: false, error: matErr.message };

  // 5. Imputar pagos huérfanos
  const { error: impErr } = await supabase.rpc(
    "impute_validated_payments_to_installments" as any,
    { p_reservation_id: reservationId },
  );
  if (impErr) {
    // No es fatal: las cuotas están creadas, sólo no se imputaron.
    console.warn("[assignPaymentPlan] Imputación no realizada:", impErr);
  }

  return { ok: true, installments: result.installments.length };
}
