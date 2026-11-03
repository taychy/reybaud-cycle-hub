/**
 * Encuesta «Comidas adicionales»: las fechas y el estado de cada comida los
 * calcula el servidor (`get_extra_meal_survey`); acá solo hay presentación.
 * Es una solicitud de interés: nunca compra ni cobra.
 */
export const EXTRA_MEAL_STEP_KEY = "encuesta_comidas_extra_san_luis";
export const EXTRA_MEAL_QUERY = "comidas-adicionales";

export type ExtraMealStatus = "ofrecible" | "incluida" | "contratada" | "especial" | "revision";
export type ExtraMealMotivo = "noche_extra_antes" | "noche_extra_despues" | "llegada" | "salida";

export interface ExtraMealSlot {
  tipo: "almuerzo" | "cena";
  fecha: string;
  motivo: ExtraMealMotivo;
  status: ExtraMealStatus;
  detalle?: string | null;
}

export interface ExtraMealAnswer {
  version: 1;
  requested: { fecha: string; tipo: string; motivo: string }[];
  respondido_at?: string;
  actualizado_at?: string;
}

export interface ExtraMealInfo {
  blocked: string | null;
  slots: ExtraMealSlot[];
  warnings?: { code: string; tipo?: string }[];
  pc?: boolean;
  package?: string | null;
  price?: number | null;
  currency?: string;
  answer?: ExtraMealAnswer | null;
}

export const slotKey = (s: { tipo: string; fecha: string }) => `${s.tipo}|${s.fecha}`;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const formatMealDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd} ${d}/${m}`;
};

export const MOTIVO_LABELS: Record<ExtraMealMotivo, string> = {
  noche_extra_antes: "Cena de tu noche extra",
  noche_extra_despues: "Cena de tu noche extra",
  llegada: "Almuerzo del día de llegada",
  salida: "Almuerzo del día de salida",
};

export const BLOCKED_LABELS: Record<string, string> = {
  fechas_no_validadas: "Tus fechas todavía no están confirmadas. Administración las revisará antes de abrir esta encuesta.",
  noche_sin_fecha: "Tu noche extra no tiene fecha definida. Administración la revisará con vos antes de tomar tu respuesta.",
  cantidad_noches_inconsistente: "Necesitamos revisar tus noches extra antes de tomar tu respuesta. Administración se comunicará con vos.",
  fecha_fuera_de_alcance: "Tus fechas quedan fuera del programa de comidas. Administración lo revisará con vos.",
  cancelada: "Esta reserva está cancelada.",
};

export const statusLabel = (s: ExtraMealSlot): string | null => {
  if (s.status === "contratada") return "Ya contratada";
  if (s.status === "incluida") return "Incluida en tu paquete";
  if (s.status === "especial") return `Corresponde a la ${s.detalle ?? "cena especial"}: es un Extra aparte`;
  if (s.status === "revision") return "Tenés una compra de comidas sin fecha: Administración la revisará para no cobrarte dos veces";
  return null;
};

export const referenceTotal = (count: number, price: number | null | undefined) =>
  count * (Number.isFinite(Number(price)) ? Number(price) : 0);

/** Respuestas previas → Sí/No por comida ofrecible (si ya respondió, lo no pedido es «No»). */
export const initialChoices = (info: ExtraMealInfo): Record<string, "si" | "no"> => {
  const out: Record<string, "si" | "no"> = {};
  if (!info.answer) return out;
  const req = new Set((info.answer.requested ?? []).map(slotKey));
  for (const s of info.slots) if (s.status === "ofrecible") out[slotKey(s)] = req.has(slotKey(s)) ? "si" : "no";
  return out;
};

export const requestedFromChoices = (slots: ExtraMealSlot[], choices: Record<string, "si" | "no">) =>
  slots.filter((s) => s.status === "ofrecible" && choices[slotKey(s)] === "si").map((s) => ({ tipo: s.tipo, fecha: s.fecha }));

export const allAnswered = (slots: ExtraMealSlot[], choices: Record<string, "si" | "no">) =>
  slots.filter((s) => s.status === "ofrecible").every((s) => !!choices[slotKey(s)]);
