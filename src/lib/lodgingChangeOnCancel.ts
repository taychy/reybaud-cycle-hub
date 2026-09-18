/**
 * Helpers para resolver el alojamiento de quienes QUEDAN cuando se cancela a
 * un participante que compartía habitación.
 *
 * Regla central de precio: si el que queda cambia de paquete, el precio del
 * paquete destino debe tomarse de la MISMA etapa comercial en la que esa
 * persona compró originalmente. Nunca el precio vigente de hoy y nunca un
 * "precio personalizado" inventado.
 */

export interface StageLike {
  id: string;
  nombre: string;
  precio: number;
  currency: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
}

const ts = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

const norm = (s: string | null | undefined) =>
  (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Etapa vigente en una fecha dada (la de compra del participante).
 * Si varias solapan, gana la de `vigente_desde` más reciente.
 */
export function stageAtDate(stages: StageLike[], date: string | Date): StageLike | null {
  const t = typeof date === "string" ? ts(date) : date.getTime();
  if (t == null) return null;
  let best: StageLike | null = null;
  for (const s of stages || []) {
    const desde = ts(s.vigente_desde);
    const hasta = ts(s.vigente_hasta);
    if (desde == null || desde > t) continue;
    if (hasta != null && hasta <= t) continue;
    if (!best || (ts(best.vigente_desde) ?? 0) < desde) best = s;
  }
  return best;
}

/**
 * Busca en el paquete destino la etapa equivalente a la de origen:
 * 1) mismo nombre de etapa; 2) mismo `vigente_desde`.
 * Si no hay equivalencia, devuelve null (hay que bloquear la confirmación).
 */
export function matchTargetStage(origin: StageLike, targetStages: StageLike[]): StageLike | null {
  const list = targetStages || [];
  const byName = list.find((s) => norm(s.nombre) === norm(origin.nombre));
  if (byName) return byName;
  const od = ts(origin.vigente_desde);
  const byDate = list.find((s) => ts(s.vigente_desde) === od);
  return byDate || null;
}

export type HistoricalPriceResult =
  | { ok: true; precio: number; currency: string; stageNombre: string; stageId: string }
  | { ok: false; reason: "sin_etapas_destino" | "sin_etapa_origen" | "sin_equivalencia"; message: string };

export function resolveHistoricalPrice(args: {
  purchaseDate: string | Date;
  originStages: StageLike[];
  targetStages: StageLike[];
  fallbackCurrency?: string;
}): HistoricalPriceResult {
  const { purchaseDate, originStages, targetStages } = args;
  if (!targetStages || targetStages.length === 0) {
    return {
      ok: false,
      reason: "sin_etapas_destino",
      message: "El paquete destino no tiene etapas de precio cargadas. No se puede tomar el precio histórico.",
    };
  }
  const origin = stageAtDate(originStages || [], purchaseDate);
  if (!origin) {
    return {
      ok: false,
      reason: "sin_etapa_origen",
      message: "No se pudo identificar la etapa en la que compró este participante. Revisá las etapas del paquete actual.",
    };
  }
  const target = matchTargetStage(origin, targetStages);
  if (!target) {
    return {
      ok: false,
      reason: "sin_equivalencia",
      message: `El paquete destino no tiene precio para la etapa "${origin.nombre}". Cargá esa etapa antes de confirmar el cambio.`,
    };
  }
  return {
    ok: true,
    precio: Number(target.precio) || 0,
    currency: target.currency || args.fallbackCurrency || "ARS",
    stageNombre: target.nombre,
    stageId: target.id,
  };
}

/** Recalcula el saldo conservando lo ya abonado. */
export function recalcBalance(newTotal: number, amountPaid: number) {
  const total = Math.max(0, Number(newTotal) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);
  return { total, paid, balance: Math.round((total - paid) * 100) / 100 };
}
