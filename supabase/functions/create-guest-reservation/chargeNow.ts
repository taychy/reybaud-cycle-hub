// Resolución server-side del importe a cobrar ahora en una reserva de invitado.
// Prioridad: importe_a_pagar_ahora con cuota materializada > seña del plan de pagos
// del paquete (misma regla que paymentPlanCalculator) > seña del paquete > total.
export interface ChargeNowInput {
  amountTotal: number;
  rpc?: { amount?: number | null; installment_number?: number | null } | null;
  plan?: { sena_tipo?: string | null; sena_valor?: number | null } | null;
  packageSena?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function resolveChargeNow(i: ChargeNowInput): { amount: number; source: string } {
  const total = Math.max(0, Number(i.amountTotal) || 0);
  const cap = (n: number) => round2(Math.min(n, total));
  const rpcAmt = Number(i.rpc?.amount ?? 0);
  if (i.rpc?.installment_number != null && rpcAmt > 0) return { amount: cap(rpcAmt), source: "importe_a_pagar_ahora" };
  if (i.plan) {
    const v = Number(i.plan.sena_valor ?? 0);
    const sena = i.plan.sena_tipo === "porcentaje_paquete" ? round2((total * v) / 100) : round2(v);
    if (sena > 0) return { amount: cap(sena), source: "plan_sena" };
  }
  const ps = Number(i.packageSena ?? 0);
  if (ps > 0) return { amount: cap(ps), source: "package_sena" };
  return { amount: round2(total), source: "total" };
}
