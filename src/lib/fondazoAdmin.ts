// Clasificación, cálculo y exportes del panel admin del Fondazo (sin efectos secundarios).
import { RESTAURANT_ALIAS, hasLunchInterest, type LunchStatus, type ParticipationMode } from "@/lib/eventRsvp";
import { COVERAGE_LABELS, buildDiners, evaluateCoverage, type LunchPayment } from "@/lib/fondazoLunch";

export type GuestCategory = "adult" | "child_4_9" | "under_4";
export type AdminRow = {
  id: string;
  recipient_name: string | null;
  recipient_email: string;
  alumno_id: string | null;
  participant_whatsapp: string | null;
  alumno_telefono?: string | null;
  alumno_grupo?: string | null;
  peloton_override?: Peloton | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  lunch_status: LunchStatus;
  receipt_reference: string | null;
  lunch_status_changed_at: string | null;
  cyclist_guests: { name: string; lunch: boolean }[];
  non_cyclist_guests: { name: string; category: GuestCategory }[];
  participant_first_name?: string | null;
  participant_last_name?: string | null;
  lunch_payments?: LunchPayment[];
};
export type Prices = { adult_price: number | null; child_4_9_price: number | null; under_4_price: number | null; prices_confirmed_at: string | null };

export type Attendance = "fondo_y_almuerzo" | "solo_fondo" | "solo_almuerzo" | "no_voy" | "sin_respuesta";
export type PaymentState = "pago_verificado" | "comprobante_informado" | "pendiente" | "no_aplica";
export type Peloton = "G1" | "G2" | "G3" | "G4" | "iniciacion" | "sin_asignar";
export type HolderType = "alumno" | "externo";

export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  fondo_y_almuerzo: "Fondo + almuerzo", solo_fondo: "Solo fondo", solo_almuerzo: "Solo almuerzo", no_voy: "No voy", sin_respuesta: "Sin respuesta",
};
export const PAYMENT_LABELS: Record<PaymentState, string> = {
  pago_verificado: "Pago verificado", comprobante_informado: "Comprobante informado · a verificar", pendiente: "Pago pendiente", no_aplica: "Sin pago requerido",
};
export const PELOTON_LABELS: Record<Peloton, string> = {
  G1: "G1", G2: "G2", G3: "G3", G4: "G4", iniciacion: "Iniciación", sin_asignar: "Sin asignar",
};
export const PELOTONES = Object.keys(PELOTON_LABELS) as Peloton[];

export const attendanceOf = (r: Pick<AdminRow, "response" | "participation_mode">): Attendance =>
  r.response === "no_voy" ? "no_voy" : r.response === "voy" && r.participation_mode ? r.participation_mode : "sin_respuesta";

/** Solo quien declaró almuerzo debe pagar parrilla; "solo fondo" nunca es deuda. */
export const paymentOf = (r: Pick<AdminRow, "response" | "participation_mode" | "lunch_status" | "receipt_reference">): PaymentState => {
  if (!hasLunchInterest(r.response, r.participation_mode)) return "no_aplica";
  if (r.lunch_status === "pago_verificado" && r.receipt_reference?.trim()) return "pago_verificado";
  if (r.lunch_status === "comprobante_informado") return "comprobante_informado";
  return "pendiente";
};

/** Grupo actual del alumno → pelotón. Grupos sin equivalencia quedan sin asignar. */
export const pelotonFromGroup = (grupo?: string | null): Peloton => {
  if (grupo === "G1" || grupo === "G2" || grupo === "G3" || grupo === "G4") return grupo;
  if (grupo === "Principiante") return "iniciacion";
  return "sin_asignar";
};
export const pelotonOf = (r: Pick<AdminRow, "peloton_override" | "alumno_grupo" | "alumno_id">): Peloton =>
  r.peloton_override ?? (r.alumno_id ? pelotonFromGroup(r.alumno_grupo) : "sin_asignar");
export const holderOf = (r: Pick<AdminRow, "alumno_id">): HolderType => (r.alumno_id ? "alumno" : "externo");

export const diners = (r: Pick<AdminRow, "non_cyclist_guests" | "cyclist_guests">) => {
  const nc = r.non_cyclist_guests || [];
  return {
    adults: 1 + nc.filter((p) => p.category === "adult").length + (r.cyclist_guests || []).filter((p) => p.lunch).length,
    children_4_9: nc.filter((p) => p.category === "child_4_9").length,
    under_4: nc.filter((p) => p.category === "under_4").length,
  };
};

/** Importe de parrilla esperado; null = sin conciliar (tarifas no confirmadas). */
export const expectedLunchAmount = (r: AdminRow, prices: Prices | null | undefined): number | null => {
  if (paymentOf(r) === "no_aplica") return 0;
  if (!prices?.prices_confirmed_at || prices.adult_price == null || prices.child_4_9_price == null || prices.under_4_price == null) return null;
  const d = diners(r);
  return d.adults * Number(prices.adult_price) + d.children_4_9 * Number(prices.child_4_9_price) + d.under_4 * Number(prices.under_4_price);
};

/** Teléfono del titular en formato wa.me (solo dígitos, Argentina normalizada). */
export const holderWhatsApp = (r: Pick<AdminRow, "participant_whatsapp" | "alumno_telefono">): string | null => {
  const raw = (r.participant_whatsapp || r.alumno_telefono || "").trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  d = d.replace(/^0+/, "");
  if (/^549\d{10}$/.test(d)) return d;
  if (/^54\d{10}$/.test(d)) return `549${d.slice(2)}`;
  if (/^\d{10}$/.test(d)) return `549${d}`;
  return null;
};

export const formatArs = (n: number) => `$${n.toLocaleString("es-AR")}`;

export type WhatsAppPayment = { ok: true; url: string; amount: number } | { ok: false; reason: string };
export const paymentWhatsApp = (r: AdminRow, prices: Prices | null | undefined): WhatsAppPayment => {
  const state = paymentOf(r);
  if (state !== "pendiente") return { ok: false, reason: state === "no_aplica" ? "Sin pago de parrilla" : "Ya tiene comprobante o pago verificado" };
  const phone = holderWhatsApp(r);
  if (!phone) return { ok: false, reason: "Falta un WhatsApp válido del titular" };
  const amount = expectedLunchAmount(r, prices);
  if (amount == null || amount <= 0) return { ok: false, reason: "Importe sin conciliar: faltan tarifas confirmadas" };
  const d = diners(r);
  const first = (r.recipient_name || "").trim().split(/\s+/)[0] || "";
  const detail = [`${d.adults} adulto${d.adults === 1 ? "" : "s"}`, d.children_4_9 ? `${d.children_4_9} niño/a(s) de 4 a 9` : "", d.under_4 ? `${d.under_4} menor(es) de 4` : ""].filter(Boolean).join(", ");
  const text = `Hola${first ? ` ${first}` : ""}! Te escribimos de Ciclismo Reybaud por la parrilla del Fondazo del domingo 29/11.\n` +
    `Según tu respuesta, el almuerzo es para ${detail}: total ${formatArs(amount)} (bebidas aparte).\n` +
    (r.cyclist_guests?.some((p) => p.lunch) ? "Incluye a tus invitados ciclistas que almuerzan; vos sos responsable de la gestión.\n" : "") +
    `Para confirmar tu lugar, transferí al alias del Restaurante: ${RESTAURANT_ALIAS}.\n` +
    `Después enviá el comprobante al WhatsApp +54 9 11 7171 1122. ¡Gracias!`;
  return { ok: true, amount, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
};

export type Filters = { q: string; attendance: Attendance[]; payment: PaymentState[]; peloton: Peloton[]; holder: HolderType[] };
export const matchesFilters = (r: AdminRow, f: Filters) => {
  const q = f.q.trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const hay = `${r.recipient_name || ""} ${r.recipient_email}`.toLowerCase();
    const phones = `${r.participant_whatsapp || ""}${r.alumno_telefono || ""}`.replace(/\D/g, "");
    if (!hay.includes(q) && !(digits.length >= 4 && phones.includes(digits))) return false;
  }
  if (f.attendance.length && !f.attendance.includes(attendanceOf(r))) return false;
  if (f.payment.length && !f.payment.includes(paymentOf(r))) return false;
  if (f.peloton.length && !f.peloton.includes(pelotonOf(r))) return false;
  if (f.holder.length && !f.holder.includes(holderOf(r))) return false;
  return true;
};

/**
 * Búsqueda de la pestaña Almuerzo: titular o acompañante.
 * Ignora mayúsculas, acentos y espacios; nunca afecta contadores globales ni pagos.
 */
export type LunchSearchRow = {
  recipient_name: string | null;
  recipient_email: string;
  participant_first_name: string | null;
  participant_last_name: string | null;
  lunch_attendees?: { name: string }[] | null;
  cyclist_guests?: { name: string }[] | null;
  non_cyclist_guests?: { name: string }[] | null;
};

export const normalizeSearch = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");

/** Cada campo se compara por separado para que un espacio borrado no mezcle dos datos distintos. */
const lunchSearchFields = (r: LunchSearchRow): (string | null)[] => {
  const first = r.participant_first_name || "";
  const last = r.participant_last_name || "";
  return [
    r.recipient_name,
    first,
    last,
    first && last ? `${first} ${last}` : "",
    r.recipient_email,
    ...(r.lunch_attendees || []).map((p) => p.name),
    ...(r.non_cyclist_guests || []).map((p) => p.name),
    ...(r.cyclist_guests || []).map((p) => p.name),
  ];
};

export const matchesLunchSearch = (r: LunchSearchRow, query: string) => {
  const q = normalizeSearch(query);
  if (!q) return true;
  return lunchSearchFields(r).some((field) => normalizeSearch(field).includes(q));
};

export const filterLunchRowsBySearch = <T extends LunchSearchRow>(rows: T[], query: string): T[] =>
  rows.filter((row) => matchesLunchSearch(row, query));

/** Celda CSV segura para Excel: comillas escapadas y neutraliza fórmulas. */
export const csvCell = (value: unknown) => {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export const toCsv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");

export const cutoffArt = (now = new Date()) =>
  now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) + " (ART)";

const amountCell = (n: number | null) => (n == null ? "Sin conciliar" : n);
const shortRef = (id: string) => id.slice(0, 8).toUpperCase();

export const internalReport = (rows: AdminRow[], prices: Prices | null, now = new Date()) => {
  const head = ["Titular", "Email", "Tipo", "Modalidad", "Pelotón", "Adultos", "Niños 4-9", "Menores de 4", "Monto previsto ARS", "Estado de pago", "Referencia comprobante", "Fecha estado", "Ref. interna"];
  const body = rows.map((r) => {
    const lunch = paymentOf(r) !== "no_aplica"; const d = diners(r);
    return [r.recipient_name || "", r.recipient_email, holderOf(r) === "alumno" ? "Alumno" : "Invitado externo", ATTENDANCE_LABELS[attendanceOf(r)], PELOTON_LABELS[pelotonOf(r)],
      lunch ? d.adults : 0, lunch ? d.children_4_9 : 0, lunch ? d.under_4 : 0, amountCell(expectedLunchAmount(r, prices)), PAYMENT_LABELS[paymentOf(r)],
      r.receipt_reference || "", r.lunch_status_changed_at ? new Date(r.lunch_status_changed_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "", shortRef(r.id)];
  });
  return toCsv([[`Fondazo 29/11/2026 · Reporte interno · corte ${cutoffArt(now)}`], [], head, ...body]);
};

/** Reporte para restaurante: solo almuerzos, sin emails, teléfonos ni tokens. */
export const restaurantReport = (rows: AdminRow[], prices: Prices | null, now = new Date()) => {
  const lunch = rows.filter((r) => paymentOf(r) !== "no_aplica");
  const t = { a: 0, c: 0, u: 0, expected: 0, verified: 0, unreconciled: 0 };
  const body = lunch.map((r) => {
    const d = diners(r); const amount = expectedLunchAmount(r, prices); const state = paymentOf(r);
    t.a += d.adults; t.c += d.children_4_9; t.u += d.under_4;
    if (amount == null) t.unreconciled++; else { t.expected += amount; if (state === "pago_verificado") t.verified += amount; }
    const list = buildDiners({ ...r, participant_first_name: r.participant_first_name ?? null, participant_last_name: r.participant_last_name ?? null });
    const pays = (r.lunch_payments || []).filter((p) => !p.voided_at);
    const cov = evaluateCoverage(list, pays, prices);
    const coveredNames = list.filter((x) => cov.coveredKeys.has(x.key)).map((x) => x.name).join("; ");
    return [r.recipient_name || "Sin nombre", list.map((x) => x.name).join("; "), d.adults, d.children_4_9, d.under_4, d.adults + d.children_4_9 + d.under_4, amountCell(amount),
      pays.length ? cov.registered : "", coveredNames, pays.length ? COVERAGE_LABELS[cov.status] : "",
      state === "pago_verificado" ? "Pagado (verificado)" : state === "comprobante_informado" ? "Pendiente · comprobante a verificar" : "Pendiente", r.receipt_reference || shortRef(r.id)];
  });
  return toCsv([
    [`La Carreta del Gato · Fondazo Reybaud 29/11/2026 · corte ${cutoffArt(now)}`],
    ["Monto previsto = según tarifas y comensales declarados. Pago verificado = confirmado por administración con comprobante. Un comprobante informado no se cuenta como cobrado."],
    [],
    ["Titular", "Comensales", "Adultos", "Niños 4-9", "Menores de 4", "Total comensales", "Monto previsto ARS", "Monto comprobante registrado ARS (sin verificar salvo Estado)", "Personas cubiertas por comprobante", "Cobertura", "Estado", "Referencia"],
    ...body,
    [],
    ["TOTALES", "", t.a, t.c, t.u, t.a + t.c + t.u, t.expected, "", "", "", `Pago verificado ARS ${t.verified}`, t.unreconciled ? `${t.unreconciled} sin conciliar` : ""],
  ]);
};
