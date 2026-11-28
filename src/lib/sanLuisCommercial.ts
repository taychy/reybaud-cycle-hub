export const SAN_LUIS_SHARED_INVENTORY = {
  total: 39,
  hotel_individual: { rooms: 10, places: 10 },
  hotel_doble: { rooms: 10, places: 20 },
  cabana_3_plazas: { rooms: 3, places: 9 },
} as const;

export const SAN_LUIS_PAYMENT_PLAN = [
  { label: 'Seña', percent: 30, dueDate: null },
  { label: 'Primera cuota', percent: 35, dueDate: '2026-12-15' },
  { label: 'Segunda cuota', percent: 35, dueDate: '2027-01-10' },
] as const;

/** Proposal only: not a payable instruction, native installment, or ledger movement. */
export function sanLuisPaymentPreview(price: number, bookingDate: string) {
  if (!Number.isSafeInteger(price) || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) throw new Error('Precio o fecha inválidos');
  const deposit = Math.round(price * 0.3);
  const first = Math.round(price * 0.35);
  const amounts = [deposit, first, price - deposit - first];
  const installments = SAN_LUIS_PAYMENT_PLAN.map((p, i) => ({ ...p, amount: amounts[i], dueNow: p.dueDate === null || p.dueDate <= bookingDate }));
  return { installments, dueNow: installments.filter(p => p.dueNow).reduce((s, p) => s + p.amount, 0), total: price };
}
