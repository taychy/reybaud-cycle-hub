/**
 * Política "pago total" por evento: `events.metadata.full_payment_required === true`.
 * Las reservas NUEVAS pagan el 100% del paquete (sin seña ni cuotas).
 * No altera reservas existentes ni sus cuotas ya materializadas.
 * Espejo servidor: supabase/functions/create-guest-reservation/chargeNow.ts (fullPaymentOnly).
 */
export function isFullPaymentRequired(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).full_payment_required === true;
}

/** Importe a cobrar al reservar: total si la política aplica; si no, la seña (o total si no hay seña). */
export function amountDueAtBooking(total: number, sena: number | null, fullPayment: boolean): number {
  const t = Math.max(0, Number(total) || 0);
  if (fullPayment) return t;
  return sena != null && sena > 0 ? Math.min(sena, t) : t;
}

export const FULL_PAYMENT_NOTICE =
  "Por la cercanía del viaje, las reservas nuevas se abonan en un solo pago del 100% del paquete, sin seña ni cuotas. Tu lugar queda confirmado cuando se acredita el pago. Las reservas anteriores mantienen su plan de pagos.";
