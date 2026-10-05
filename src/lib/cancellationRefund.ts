// Cálculo de devolución sugerida al cancelar una reserva de viaje/evento.
// Fuente: primero la política aceptada (terminos_snapshot.cancellation_rules),
// luego la regla estructurada del evento (events.metadata.cancellation_rules).
// Si solo hay texto libre, nunca se interpreta: queda en "revision_manual".

export type RefundEstado = "no_corresponde" | "pendiente" | "parcial" | "completada" | "revision_manual";

export interface CancellationTramo {
  /** Días mínimos de anticipación al inicio para aplicar este tramo. */
  dias_minimos: number;
  /** Porcentaje a reintegrar (0-100) sobre la base. */
  porcentaje: number;
  /** total = sobre todo lo pagado; excedente_sena = sobre lo pagado por encima de la seña. */
  base: "total" | "excedente_sena";
}
export interface CancellationRules {
  sena_monto?: number | null;
  tramos: CancellationTramo[];
}

export interface RefundSuggestion {
  estado: RefundEstado;
  bruto: number;
  retenido: number;
  sugerido: number;
  regla: string;
  fuente: "snapshot" | "evento" | "sin_pagos" | "texto";
  politicaTexto: string | null;
}

export function parseRules(raw: unknown): CancellationRules | null {
  if (!raw || typeof raw !== "object") return null;
  const t = (raw as any).tramos;
  if (!Array.isArray(t) || t.length === 0) return null;
  const tramos: CancellationTramo[] = [];
  for (const x of t) {
    const d = Number(x?.dias_minimos), p = Number(x?.porcentaje);
    const base = x?.base === "excedente_sena" ? "excedente_sena" : x?.base === "total" ? "total" : null;
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(p) || p < 0 || p > 100 || !base) return null;
    tramos.push({ dias_minimos: d, porcentaje: p, base });
  }
  const sena = (raw as any).sena_monto;
  return { sena_monto: sena == null ? null : Number(sena), tramos: tramos.sort((a, b) => b.dias_minimos - a.dias_minimos) };
}

/** Días corridos entre la cancelación y el inicio (fechas literales, sin desfase horario). */
export function diasAntes(eventDate: string, cancelDate: string): number {
  const p = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(eventDate) - p(cancelDate)) / 86400000);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function suggestRefund(input: {
  bruto: number;
  eventDate: string | null;
  cancelDate: string;
  snapshot: any;
  eventMetadata: any;
  senaFallback?: number | null;
}): RefundSuggestion {
  const bruto = r2(Math.max(0, Number(input.bruto) || 0));
  const texto =
    [input.snapshot?.politica_cancelacion, input.snapshot?.politica_sena].filter(Boolean).join("\n\n") ||
    input.eventMetadata?.politica_cancelacion || null;

  if (bruto <= 0) {
    return { estado: "no_corresponde", bruto: 0, retenido: 0, sugerido: 0, regla: "Sin pagos recibidos: no hay nada para devolver.", fuente: "sin_pagos", politicaTexto: texto };
  }
  const snapRules = parseRules(input.snapshot?.cancellation_rules);
  const evRules = snapRules ? null : parseRules(input.eventMetadata?.cancellation_rules);
  const rules = snapRules ?? evRules;
  if (!rules || !input.eventDate) {
    return {
      estado: "revision_manual", bruto, retenido: 0, sugerido: 0,
      regla: !rules ? "La política está solo en texto: revisala y cargá el monto a devolver." : "El evento no tiene fecha de inicio para aplicar la política.",
      fuente: "texto", politicaTexto: texto,
    };
  }
  const dias = diasAntes(input.eventDate, input.cancelDate);
  const tramo = rules.tramos.find((t) => dias >= t.dias_minimos) ?? null;
  const sena = Math.max(0, Number(rules.sena_monto ?? input.senaFallback ?? 0) || 0);
  let sugerido = 0;
  let regla = `Cancelación ${dias} días antes del inicio: sin tramo con reintegro.`;
  if (tramo) {
    const base = tramo.base === "total" ? bruto : Math.max(0, bruto - sena);
    sugerido = r2((base * tramo.porcentaje) / 100);
    regla = `Cancelación ${dias} días antes (tramo ≥ ${tramo.dias_minimos} días): ${tramo.porcentaje}% de ${tramo.base === "total" ? "lo pagado" : `lo pagado por encima de la seña (${sena})`}.`;
  }
  sugerido = Math.min(sugerido, bruto);
  return {
    estado: sugerido > 0 ? "pendiente" : "no_corresponde",
    bruto, retenido: r2(bruto - sugerido), sugerido, regla,
    fuente: snapRules ? "snapshot" : "evento", politicaTexto: texto,
  };
}

/** Estado según lo devuelto realmente (espejo del trigger SQL). */
export function refundEstado(sugerido: number, devuelto: number, actual: RefundEstado): RefundEstado {
  if (actual === "revision_manual" && !(devuelto > 0)) return "revision_manual";
  if (!(sugerido > 0)) return "no_corresponde";
  if (devuelto + 0.01 >= sugerido) return "completada";
  if (devuelto > 0) return "parcial";
  return "pendiente";
}

export const REFUND_ESTADO_LABEL: Record<RefundEstado, string> = {
  no_corresponde: "No corresponde",
  pendiente: "Pendiente",
  parcial: "Parcial",
  completada: "Completada",
  revision_manual: "Revisión manual",
};
