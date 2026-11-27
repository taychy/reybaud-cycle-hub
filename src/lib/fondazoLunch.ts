// Comensales, cobertura de comprobantes y correcciones del almuerzo del Fondazo.
// Espejo de SQL: _rsvp_name_key, _rsvp_lunch_diners, admin_register_event_rsvp_lunch_payment
// y admin_edit_event_rsvp_lunch_guests. El servidor es la autoridad; esto solo anticipa y muestra.
import type { GuestCategory, Prices } from "@/lib/fondazoAdmin";

export type DinerRole = "titular" | "no_ciclista" | "ciclista";
export type Diner = { key: string; name: string; category: GuestCategory; role: DinerRole };
export type LunchPayment = {
  id: string; invite_id: string; amount_ars: number; bank_reference: string; covered: Diner[];
  expected_for_covered: number; comment: string; created_at: string; voided_at: string | null; void_reason: string | null;
};
export type DinerSource = {
  recipient_name: string | null; recipient_email: string;
  participant_first_name: string | null; participant_last_name: string | null;
  non_cyclist_guests: { name: string; category: GuestCategory }[] | null;
  cyclist_guests: { name: string; lunch: boolean }[] | null;
};

export const CATEGORY_LABELS: Record<GuestCategory, string> = { adult: "Adulto", child_4_9: "4 a 9 años", under_4: "Menor de 4" };

const FROM = "ÁÉÍÓÚÜÑáéíóúüñ"; const TO = "AEIOUUNaeiouun";
export const nameKey = (name: string | null | undefined) =>
  [...(name || "").trim()].map((ch) => { const i = FROM.indexOf(ch); return i >= 0 ? TO[i] : ch; }).join("").replace(/\s+/g, " ").toLowerCase();

export const titularName = (r: DinerSource) =>
  `${r.participant_first_name || ""} ${r.participant_last_name || ""}`.trim() || r.recipient_name || r.recipient_email;

export const buildDiners = (r: DinerSource): Diner[] => {
  const t = titularName(r);
  return [
    { key: `t:${nameKey(t)}`, name: t, category: "adult", role: "titular" },
    ...(r.non_cyclist_guests || []).map((g) => ({ key: `nc:${nameKey(g.name)}`, name: g.name.trim(), category: g.category, role: "no_ciclista" as const })),
    ...(r.cyclist_guests || []).filter((g) => g.lunch).map((g) => ({ key: `cy:${nameKey(g.name)}`, name: g.name.trim(), category: "adult" as const, role: "ciclista" as const })),
  ];
};

export const pricesConfirmed = (p: Prices | null | undefined): p is Prices & { adult_price: number; child_4_9_price: number; under_4_price: number } =>
  !!p?.prices_confirmed_at && p.adult_price != null && p.child_4_9_price != null && p.under_4_price != null;

export const priceOf = (p: Prices, c: GuestCategory) => Number(c === "adult" ? p.adult_price : c === "child_4_9" ? p.child_4_9_price : p.under_4_price);

/** null = tarifas sin confirmar (sin conciliar). */
export const expectedFor = (diners: Diner[], prices: Prices | null | undefined): number | null =>
  pricesConfirmed(prices) ? diners.reduce((s, d) => s + priceOf(prices, d.category), 0) : null;

export type Coverage = {
  status: "sin_comprobante" | "parcial" | "monto_no_coincide" | "completo" | "sin_conciliar";
  coveredKeys: Set<string>; uncovered: Diner[]; registered: number; expected: number | null; canVerify: boolean;
};

/** Cobertura de comprobantes vigentes (no anulados), opcionalmente sumando uno en preparación. */
export const evaluateCoverage = (
  diners: Diner[], payments: LunchPayment[], prices: Prices | null | undefined,
  draft?: { keys: string[]; amount: number },
): Coverage => {
  const active = payments.filter((p) => !p.voided_at);
  const coveredKeys = new Set(active.flatMap((p) => p.covered.map((c) => c.key)));
  draft?.keys.forEach((k) => coveredKeys.add(k));
  const registered = active.reduce((s, p) => s + Number(p.amount_ars), 0) + (draft?.amount || 0);
  const expected = expectedFor(diners, prices);
  const uncovered = diners.filter((d) => !coveredKeys.has(d.key));
  let status: Coverage["status"];
  if (expected == null) status = "sin_conciliar";
  else if (!coveredKeys.size && !registered) status = "sin_comprobante";
  else if (uncovered.length) status = "parcial";
  else if (registered !== expected) status = "monto_no_coincide";
  else status = "completo";
  return { status, coveredKeys, uncovered, registered, expected, canVerify: status === "completo" };
};

export const COVERAGE_LABELS: Record<Coverage["status"], string> = {
  sin_comprobante: "Sin comprobante registrado",
  parcial: "Pago parcial · faltan personas",
  monto_no_coincide: "Importe no coincide con la tarifa",
  completo: "Cubre a todos · importe exacto",
  sin_conciliar: "Sin conciliar · tarifas no confirmadas",
};

/** Validación previa del registro de un comprobante (el servidor repite todo). */
export const validatePaymentDraft = (
  diners: Diner[], payments: LunchPayment[], prices: Prices | null | undefined,
  d: { keys: string[]; amount: number; reference: string; comment: string; markVerified: boolean },
): string | null => {
  if (!pricesConfirmed(prices)) return "Confirmá primero las tarifas del restaurante.";
  if (!(d.amount > 0)) return "Ingresá el importe del comprobante en ARS.";
  if (d.reference.trim().length < 3) return "Ingresá la referencia bancaria del comprobante.";
  if (d.comment.trim().length < 3) return "Agregá un comentario de auditoría.";
  if (!d.keys.length) return "Elegí al menos una persona cubierta por este comprobante.";
  if (new Set(d.keys).size !== d.keys.length) return "Hay personas repetidas en la selección.";
  const all = new Set(diners.map((x) => x.key));
  if (d.keys.some((k) => !all.has(k))) return "La selección incluye personas que ya no figuran en la inscripción.";
  const prev = new Set(payments.filter((p) => !p.voided_at).flatMap((p) => p.covered.map((c) => c.key)));
  if (d.keys.some((k) => prev.has(k))) return "Alguna persona elegida ya está cubierta por otro comprobante registrado.";
  if (d.markVerified && !evaluateCoverage(diners, payments, prices, { keys: d.keys, amount: d.amount }).canVerify)
    return "No se puede verificar: los comprobantes deben cubrir a todos los comensales y sumar exactamente la tarifa.";
  return null;
};

export type GuestDraft = { name: string; category: GuestCategory };
export const countsOf = (guests: GuestDraft[], cyclistLunch: number) => ({
  guests_count: guests.length + cyclistLunch,
  adults: 1 + cyclistLunch + guests.filter((g) => g.category === "adult").length,
  children_4_9: guests.filter((g) => g.category === "child_4_9").length,
  under_4: guests.filter((g) => g.category === "under_4").length,
});

/** Validación de la corrección de acompañantes no ciclistas. */
export const validateGuestEdit = (
  r: DinerSource & { lunch_status: string }, guests: GuestDraft[], reason: string, hasActivePayments: boolean,
): string | null => {
  if (r.lunch_status === "pago_verificado") return "El pago ya está verificado. Volvé el estado antes de corregir comensales.";
  if (hasActivePayments) return "Hay comprobantes registrados vigentes: anulalos antes de corregir acompañantes y volvé a registrarlos después.";
  if (reason.trim().length < 3) return "Indicá el motivo de la corrección.";
  const taken = new Set([nameKey(titularName(r)), ...(r.cyclist_guests || []).map((c) => nameKey(c.name))]);
  for (const g of guests) {
    const n = g.name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 100) return "Cada acompañante necesita nombre (2 a 100 caracteres).";
    const k = nameKey(n);
    if (taken.has(k)) return `Nombre duplicado: ${n} ya figura en esta inscripción.`;
    taken.add(k);
  }
  const cyLunch = (r.cyclist_guests || []).filter((c) => c.lunch).length;
  const before = countsOf(r.non_cyclist_guests || [], cyLunch); const after = countsOf(guests, cyLunch);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (changed && r.lunch_status === "comprobante_informado")
    return "El participante informó un comprobante: cambiar cantidad o categoría cambia el importe. Volvé el estado con auditoría antes de corregir.";
  return null;
};

/** Verificación diferida de comprobantes ya registrados (espejo de admin_verify_event_rsvp_lunch_payments). */
export const verifyExistingBlocker = (
  lunchStatus: string, diners: Diner[], payments: LunchPayment[], prices: Prices | null | undefined,
): string | null => {
  if (lunchStatus !== "comprobante_informado") return "Solo se verifican comprobantes en estado «Comprobante recibido».";
  if (!pricesConfirmed(prices)) return "Confirmá primero las tarifas del restaurante.";
  const active = payments.filter((p) => !p.voided_at);
  if (!active.length) return "No hay comprobantes registrados vigentes.";
  if (active.some((p) => !(Number(p.amount_ars) > 0) || p.bank_reference.trim().length < 3)) return "Hay comprobantes sin importe o sin referencia bancaria.";
  const keys = active.flatMap((p) => p.covered.map((c) => c.key));
  if (new Set(keys).size !== keys.length) return "Una persona figura cubierta por más de un comprobante.";
  const all = new Set(diners.map((d) => d.key));
  if (keys.some((k) => !all.has(k))) return "Un comprobante cubre a personas que ya no figuran en la inscripción.";
  const c = evaluateCoverage(diners, active, prices);
  if (c.uncovered.length) return "Faltan comensales sin cubrir por comprobantes.";
  if (!c.canVerify) return "Los comprobantes no suman la tarifa confirmada.";
  return null;
};

/** Con comprobantes vigentes solo se permite «Comprobante recibido» (o verificar por su acción). */
export const allowedManualStatus = (status: string, hasActivePayments: boolean) =>
  status !== "pago_verificado" && (!hasActivePayments || status === "comprobante_informado");
