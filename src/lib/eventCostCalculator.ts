/**
 * Pure event cost simulator.
 * Normalizes items to base currency, splits fixed vs per-person costs,
 * applies contingency %, and derives suggested price per modality using
 * target margin.
 */

export type Moneda = "ARS" | "USD" | "EUR";

export type CostBasis = "habitacion_noche" | "persona_noche" | "persona_estadia" | "total";

/** Metadata específica de líneas de alojamiento */
export interface CostItemDetalle {
  package_id?: string | null;
  cost_basis?: CostBasis;
  habitaciones?: number;
  noches?: number;
  personas_por_habitacion?: number;
  tipo_habitacion?: string | null;
  [k: string]: unknown;
}

export interface CostItem {
  id?: string;
  categoria: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  moneda: Moneda | string;
  es_por_persona: boolean;
  /** modality keys this cost applies to (empty = all) */
  aplica_a_modalidades: string[];
  orden?: number;
  /** metadata flexible (alojamiento por paquete, etc.) */
  detalle?: CostItemDetalle | null;
}


export interface Modalidad {
  key: string;
  label: string;
  esperados: number;
}

export interface Supuestos {
  tc_usd: number;
  tc_eur: number;
  pct_imprevistos: number; // 0-100
  pct_margen_objetivo: number; // 0-100
  moneda_base: Moneda | string;
  /**
   * Total de inscriptos del escenario activo. Es el denominador del prorrateo
   * de costos GENERALES (no por paquete). Si no viene, se usa el
   * comportamiento anterior (prorrateo según esperados por paquete).
   */
  participantes_prorrateo?: number;
}

export interface CalculoResult {
  total_costos_base: number;
  total_con_imprevistos: number;
  costos_fijos: number;
  costos_variables: number;
  por_categoria: Record<string, number>;
  costo_por_modalidad: Record<string, number>;
  precio_sugerido_por_modalidad: Record<string, number>;
  margen_estimado: number;
  ingreso_esperado: number;
  punto_equilibrio: number; // participantes necesarios (fijos / margen unitario prom)
  moneda_base: string;
  /** Costos generales (no específicos de un paquete) sujetos a prorrateo */
  costos_generales_prorrateables: number;
  /** Costo general por participante según el escenario activo */
  prorrateo_general_por_persona: number;
}


export const CATEGORIAS_COSTO = [
  "alojamiento",
  "comida",
  "transporte",
  "staff",
  "servicios",
  "marketing",
  "otros",
] as const;

export const CATEGORIA_LABELS: Record<string, string> = {
  alojamiento: "Alojamiento",
  comida: "Comida",
  transporte: "Transporte",
  staff: "Staff",
  servicios: "Servicios",
  marketing: "Marketing",
  otros: "Otros",
};

export function toBase(monto: number, moneda: string, sup: Supuestos): number {
  if (!moneda || moneda === sup.moneda_base) return monto;
  // convert source to ARS first, then to base
  const toArs = (m: number, mo: string) =>
    mo === "ARS" ? m : mo === "USD" ? m * sup.tc_usd : mo === "EUR" ? m * sup.tc_eur : m;
  const arsAmount = toArs(monto, moneda);
  if (sup.moneda_base === "ARS") return arsAmount;
  if (sup.moneda_base === "USD") return arsAmount / (sup.tc_usd || 1);
  if (sup.moneda_base === "EUR") return arsAmount / (sup.tc_eur || 1);
  return arsAmount;
}

export function calcularSimulacion(
  items: CostItem[],
  modalidades: Modalidad[],
  supuestos: Supuestos,
): CalculoResult {
  const por_categoria: Record<string, number> = {};
  const costo_por_modalidad: Record<string, number> = {};
  modalidades.forEach((m) => (costo_por_modalidad[m.key] = 0));

  const totalEsperados = modalidades.reduce((a, m) => a + (Number(m.esperados) || 0), 0);
  let costos_fijos = 0;
  let costos_variables = 0;

  for (const it of items) {
    // ── Alojamiento por paquete (línea especializada) ──
    const det = (it.detalle || {}) as CostItemDetalle;
    if (it.categoria === "alojamiento" && det.package_id && det.cost_basis) {
      const mod = modalidades.find((m) => m.key === det.package_id);
      const unit = toBase(Number(it.precio_unitario || 0), it.moneda, supuestos);
      const noches = Number(det.noches || 0);
      let totalLinea = 0;
      let esVariable = false;

      if (det.cost_basis === "habitacion_noche") {
        totalLinea = Number(det.habitaciones || 0) * noches * unit;
      } else if (det.cost_basis === "persona_noche") {
        totalLinea = (Number(mod?.esperados) || 0) * noches * unit;
        esVariable = true;
      } else if (det.cost_basis === "persona_estadia") {
        // El precio ya cubre toda la estadía por persona: no multiplicar por noches.
        totalLinea = (Number(mod?.esperados) || 0) * unit;
        esVariable = true;
      } else {
        totalLinea = unit * (Number(it.cantidad) > 0 ? Number(it.cantidad) : 1);
      }

      por_categoria[it.categoria] = (por_categoria[it.categoria] || 0) + totalLinea;
      if (esVariable) costos_variables += totalLinea; else costos_fijos += totalLinea;
      // Imputación exclusiva al paquete elegido: nunca se reparte entre modalidades.
      if (mod) costo_por_modalidad[mod.key] += totalLinea;
      continue;
    }

    const totalItem = toBase(
      Number(it.cantidad || 0) * Number(it.precio_unitario || 0),
      it.moneda,
      supuestos,
    );
    por_categoria[it.categoria] = (por_categoria[it.categoria] || 0) + totalItem;

    const applyTo = it.aplica_a_modalidades?.length
      ? modalidades.filter((m) => it.aplica_a_modalidades.includes(m.key))
      : modalidades;


    if (it.es_por_persona) {
      // per person, per modality selected
      let totalVar = 0;
      applyTo.forEach((m) => {
        const cost = totalItem * (Number(m.esperados) || 0);
        costo_por_modalidad[m.key] += cost;
        totalVar += cost;
      });
      costos_variables += totalVar;
      // NOTE: por_categoria already added totalItem — replace with computed variable
      por_categoria[it.categoria] =
        (por_categoria[it.categoria] || 0) - totalItem + totalVar;
    } else {
      // fixed cost, prorated over expected participants of applicable modalities
      costos_fijos += totalItem;
      const applyEsperados = applyTo.reduce((a, m) => a + (Number(m.esperados) || 0), 0);
      if (applyEsperados > 0) {
        applyTo.forEach((m) => {
          const share = (totalItem * (Number(m.esperados) || 0)) / applyEsperados;
          costo_por_modalidad[m.key] += share;
        });
      }
    }
  }

  const total_costos_base = costos_fijos + costos_variables;
  const factorImp = 1 + (Number(supuestos.pct_imprevistos) || 0) / 100;
  const total_con_imprevistos = total_costos_base * factorImp;

  // aplicar imprevistos también al desglose por modalidad
  Object.keys(costo_por_modalidad).forEach((k) => {
    costo_por_modalidad[k] = costo_por_modalidad[k] * factorImp;
  });

  const margen = Math.min(0.9, Math.max(0, (Number(supuestos.pct_margen_objetivo) || 0) / 100));
  const precio_sugerido_por_modalidad: Record<string, number> = {};
  let ingreso_esperado = 0;
  modalidades.forEach((m) => {
    const costoUnit = m.esperados > 0 ? costo_por_modalidad[m.key] / m.esperados : 0;
    const precio = margen < 1 ? costoUnit / (1 - margen) : costoUnit;
    precio_sugerido_por_modalidad[m.key] = precio;
    ingreso_esperado += precio * (Number(m.esperados) || 0);
  });

  const margen_estimado =
    ingreso_esperado > 0 ? (ingreso_esperado - total_con_imprevistos) / ingreso_esperado : 0;

  // punto de equilibrio en participantes promedio: fijos / margen unitario promedio
  const margen_unit_prom =
    totalEsperados > 0 ? (ingreso_esperado - total_con_imprevistos) / totalEsperados : 0;
  const punto_equilibrio =
    margen_unit_prom > 0 ? Math.ceil((costos_fijos * factorImp) / margen_unit_prom) : 0;

  return {
    total_costos_base,
    total_con_imprevistos,
    costos_fijos: costos_fijos * factorImp,
    costos_variables: costos_variables * factorImp,
    por_categoria,
    costo_por_modalidad,
    precio_sugerido_por_modalidad,
    margen_estimado,
    ingreso_esperado,
    punto_equilibrio,
    moneda_base: supuestos.moneda_base,
  };
}
