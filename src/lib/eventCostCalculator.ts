/**
 * Pure event cost simulator.
 *
 * Modelo de decisión en 4 grandes grupos (`grupo_costo`):
 *  - alojamiento : lógica especializada por paquete (habitación/persona/estadía).
 *  - participante: costo VARIABLE por participante (cantidad × precio = costo por pax).
 *  - staff       : costo total de la línea, prorrateado por el total de inscriptos del escenario.
 *  - general     : idem staff (costo fijo general prorrateado).
 *
 * `categoria` se conserva como subcategoría/legado.
 */

export type Moneda = "ARS" | "USD" | "EUR";

export type CostBasis = "habitacion_noche" | "persona_noche" | "persona_estadia" | "total";

export type GrupoCosto = "alojamiento" | "participante" | "staff" | "general";

export type RentabilidadModo = "margen" | "honorario_participante";

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
  /** grupo grande de decisión; si falta se infiere (backward compatibility) */
  grupo_costo?: GrupoCosto | string | null;
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
   * de costos GENERALES/STAFF (no por paquete). Si no viene, se usa el
   * comportamiento anterior (prorrateo según esperados por paquete).
   */
  participantes_prorrateo?: number;
  /** Cómo se define el precio: margen objetivo u honorario fijo por participante. */
  rentabilidad_modo?: RentabilidadModo | string;
  /** Honorario por participante en moneda base (modo honorario_participante). */
  honorario_por_participante?: number;
  /** Paquete cuyo alojamiento define el precio base del viaje. */
  paquete_base_id?: string | null;
}

export interface CalculoResult {
  total_costos_base: number;
  total_con_imprevistos: number;
  costos_fijos: number;
  costos_variables: number;
  por_categoria: Record<string, number>;
  /** Totales por grandes grupos de decisión */
  por_grupo: Record<GrupoCosto, number>;
  costo_por_modalidad: Record<string, number>;
  /** Costo por participante de cada modalidad; null si no hay participantes esperados */
  costo_unitario_por_modalidad: Record<string, number | null>;
  precio_sugerido_por_modalidad: Record<string, number>;
  /** Ganancia unitaria = precio sugerido − costo unitario; null si no hay participantes */
  ganancia_unitaria_por_modalidad: Record<string, number | null>;
  margen_estimado: number;
  ingreso_esperado: number;
  ganancia_estimada_total: number;
  ganancia_promedio_por_participante: number;
  /** Aproximado: costos fijos / margen unitario promedio */
  punto_equilibrio: number;
  moneda_base: string;
  /** Costos generales + staff (no específicos de un paquete) sujetos a prorrateo */
  costos_generales_prorrateables: number;
  /** Costo general por participante según el escenario activo */
  prorrateo_general_por_persona: number;
  rentabilidad_modo: RentabilidadModo;

  /* ─── Modelo precio base + suplementos (todos CON imprevistos) ─── */
  /** Inscriptos del escenario activo usados para prorratear staff/generales */
  escenario_inscriptos: number;
  /** Costo directo por participante (grupo Participante) */
  costo_participante_directo_unitario: number;
  costo_staff_total: number;
  costo_staff_por_persona: number;
  costo_general_total: number;
  costo_general_por_persona: number;
  /** Costo de alojamiento por persona de cada modalidad */
  costo_alojamiento_unitario_por_modalidad: Record<string, number>;
  paquete_base_id: string | null;
  costo_alojamiento_base_unitario: number;
  costo_base_unitario: number;
  precio_base_sugerido: number;
  suplemento_costo_por_modalidad: Record<string, number>;
  suplemento_precio_por_modalidad: Record<string, number>;
  precio_final_por_modalidad: Record<string, number>;
  /** true si la distribución por paquetes suma exactamente los inscriptos del escenario */
  distribucion_valida: boolean;
  distribucion_total: number;
  /** Métricas del escenario; null cuando la distribución no es válida */
  escenario_costo_total: number | null;
  escenario_ingreso_total: number | null;
  escenario_ganancia_total: number | null;
  escenario_margen: number | null;
  escenario_ganancia_por_participante: number | null;
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

/** Subcategorías disponibles por grupo (clasificación secundaria, opcional) */
export const SUBCATEGORIAS_POR_GRUPO: Record<Exclude<GrupoCosto, "alojamiento">, string[]> = {
  participante: ["comida", "transporte", "servicios", "otros"],
  staff: ["staff", "transporte", "comida", "otros"],
  general: ["transporte", "servicios", "marketing", "comida", "otros"],
};

export const GRUPO_LABELS: Record<GrupoCosto, string> = {
  alojamiento: "Alojamiento",
  participante: "Participantes",
  staff: "Staff",
  general: "Generales",
};

/** Infiere el grupo grande de una línea cuando el dato no está persistido. */
export function inferGrupoCosto(it: Pick<CostItem, "categoria" | "es_por_persona" | "grupo_costo">): GrupoCosto {
  const g = it.grupo_costo;
  if (g === "alojamiento" || g === "participante" || g === "staff" || g === "general") return g;
  if (it.categoria === "alojamiento") return "alojamiento";
  if (it.categoria === "staff") return "staff";
  if (it.es_por_persona) return "participante";
  return "general";
}

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

/**
 * Costo de alojamiento POR PERSONA de una línea, sin imprevistos.
 * Es independiente de la distribución cuando la cotización ya es por persona.
 */
export function lodgingUnitCost(
  it: CostItem,
  mod: Modalidad | undefined,
  sup: Supuestos,
): number {
  const det = (it.detalle || {}) as CostItemDetalle;
  const unit = toBase(Number(it.precio_unitario || 0), it.moneda, sup);
  const noches = Number(det.noches || 0);
  const pax = Number(mod?.esperados) || 0;
  const capacidad = (Number(det.habitaciones) || 0) * (Number(det.personas_por_habitacion) || 0);

  if (det.cost_basis === "persona_estadia") return unit;
  if (det.cost_basis === "persona_noche") return unit * noches;
  if (det.cost_basis === "habitacion_noche") {
    const porHab = unit * noches;
    const ppp = Number(det.personas_por_habitacion) || 0;
    if (ppp > 0) return porHab / ppp;
    if (pax > 0) return ((Number(det.habitaciones) || 0) * porHab) / pax;
    return porHab;
  }
  // "total" u otras: total contratado repartido entre las plazas conocidas
  const total = unit * (Number(it.cantidad) > 0 ? Number(it.cantidad) : 1);
  const den = pax > 0 ? pax : capacidad;
  return den > 0 ? total / den : total;
}


export function calcularSimulacion(
  items: CostItem[],
  modalidades: Modalidad[],
  supuestos: Supuestos,
): CalculoResult {
  const por_categoria: Record<string, number> = {};
  const por_grupo: Record<GrupoCosto, number> = {
    alojamiento: 0, participante: 0, staff: 0, general: 0,
  };
  const costo_por_modalidad: Record<string, number> = {};
  modalidades.forEach((m) => (costo_por_modalidad[m.key] = 0));

  const totalEsperados = modalidades.reduce((a, m) => a + (Number(m.esperados) || 0), 0);
  const prorrateoBase = Number(supuestos.participantes_prorrateo) > 0
    ? Number(supuestos.participantes_prorrateo)
    : 0;
  let costos_fijos = 0;
  let costos_variables = 0;
  let costos_generales_prorrateables = 0;
  let prorrateo_general_por_persona = 0;

  const addCat = (cat: string, monto: number) => {
    por_categoria[cat] = (por_categoria[cat] || 0) + monto;
  };

  for (const it of items) {
    const grupo = inferGrupoCosto(it);
    const det = (it.detalle || {}) as CostItemDetalle;

    // ── Alojamiento por paquete (línea especializada) ──
    if (grupo === "alojamiento" && det.package_id && det.cost_basis) {
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

      addCat(it.categoria, totalLinea);
      por_grupo.alojamiento += totalLinea;
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

    const applyTo = it.aplica_a_modalidades?.length
      ? modalidades.filter((m) => it.aplica_a_modalidades.includes(m.key))
      : modalidades;

    if (grupo === "participante") {
      // Costo VARIABLE por participante: el total de la fila es el costo por pax.
      // El TOTAL del grupo se calcula sobre el escenario activo (única verdad);
      // el reparto por modalidad sigue la distribución (ocupación).
      let repartoPorModalidad = 0;
      applyTo.forEach((m) => {
        const cost = totalItem * (Number(m.esperados) || 0);
        costo_por_modalidad[m.key] += cost;
        repartoPorModalidad += cost;
      });
      const aplicaATodas = !it.aplica_a_modalidades?.length;
      const totalVar = aplicaATodas && prorrateoBase > 0
        ? totalItem * prorrateoBase
        : repartoPorModalidad;
      costos_variables += totalVar;
      addCat(it.categoria, totalVar);
      por_grupo.participante += totalVar;
      continue;
    }


    // ── staff / general / alojamiento sin detalle: costo fijo general prorrateado ──
    costos_fijos += totalItem;
    costos_generales_prorrateables += totalItem;
    addCat(it.categoria, totalItem);
    por_grupo[grupo === "alojamiento" ? "general" : grupo] += totalItem;

    // Staff y General se reparten SIEMPRE entre todos los paquetes por igual.
    const esGeneral = grupo !== "alojamiento" || !it.aplica_a_modalidades?.length;
    if (esGeneral && prorrateoBase > 0) {
      // El denominador es SIEMPRE el escenario total de inscriptos:
      // todos los paquetes reciben el mismo costo general por persona.
      const porPersona = totalItem / prorrateoBase;
      prorrateo_general_por_persona += porPersona;
      modalidades.forEach((m) => {
        costo_por_modalidad[m.key] += porPersona * (Number(m.esperados) || 0);
      });
    } else {
      // sin escenario definido: comportamiento previo (reparto por esperados)
      const target = grupo === "alojamiento" ? applyTo : modalidades;
      const applyEsperados = target.reduce((a, m) => a + (Number(m.esperados) || 0), 0);
      if (applyEsperados > 0) {
        target.forEach((m) => {
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
  (Object.keys(por_grupo) as GrupoCosto[]).forEach((k) => {
    por_grupo[k] = por_grupo[k] * factorImp;
  });
  // por_categoria queda en la misma base que por_grupo (con imprevistos),
  // para que todo lo que se muestra en resumen sea comparable.
  Object.keys(por_categoria).forEach((k) => {
    por_categoria[k] = por_categoria[k] * factorImp;
  });


  const modo: RentabilidadModo = supuestos.rentabilidad_modo === "honorario_participante"
    ? "honorario_participante"
    : "margen";
  const margen = Math.min(0.9, Math.max(0, (Number(supuestos.pct_margen_objetivo) || 0) / 100));
  const honorario = Number(supuestos.honorario_por_participante) || 0;

  const costo_unitario_por_modalidad: Record<string, number | null> = {};
  const precio_sugerido_por_modalidad: Record<string, number> = {};
  const ganancia_unitaria_por_modalidad: Record<string, number | null> = {};
  let ingreso_esperado = 0;
  modalidades.forEach((m) => {
    const pax = Number(m.esperados) || 0;
    if (pax <= 0) {
      // Sin participantes esperados no hay costo unitario real: no inventar valores.
      costo_unitario_por_modalidad[m.key] = null;
      precio_sugerido_por_modalidad[m.key] = 0;
      ganancia_unitaria_por_modalidad[m.key] = null;
      return;
    }
    const costoUnit = costo_por_modalidad[m.key] / pax;
    const precio = modo === "honorario_participante"
      ? costoUnit + honorario
      : (margen < 1 ? costoUnit / (1 - margen) : costoUnit);
    costo_unitario_por_modalidad[m.key] = costoUnit;
    precio_sugerido_por_modalidad[m.key] = precio;
    ganancia_unitaria_por_modalidad[m.key] = precio - costoUnit;
    ingreso_esperado += precio * pax;
  });

  const ganancia_estimada_total = ingreso_esperado - total_con_imprevistos;
  const ganancia_promedio_por_participante =
    totalEsperados > 0 ? ganancia_estimada_total / totalEsperados : 0;
  const margen_estimado = ingreso_esperado > 0 ? ganancia_estimada_total / ingreso_esperado : 0;

  // punto de equilibrio en participantes promedio: fijos / margen unitario promedio
  const margen_unit_prom = totalEsperados > 0 ? ganancia_estimada_total / totalEsperados : 0;
  const punto_equilibrio =
    margen_unit_prom > 0 ? Math.ceil((costos_fijos * factorImp) / margen_unit_prom) : 0;

  /* ═══ Modelo precio base + suplementos ═══
     El precio del viaje se arma UNA sola vez por persona: alojamiento base +
     participante directo + staff/pax + generales/pax. Cada otra modalidad sólo
     agrega la diferencia de alojamiento como suplemento. Staff y generales
     nunca se duplican por modalidad. */
  const escenario_inscriptos = prorrateoBase > 0 ? prorrateoBase : totalEsperados;

  let participanteDirecto = 0;
  let staffTotalRaw = 0;
  let generalTotalRaw = 0;
  const costo_alojamiento_unitario_por_modalidad: Record<string, number> = {};
  modalidades.forEach((m) => (costo_alojamiento_unitario_por_modalidad[m.key] = 0));

  for (const it of items) {
    const grupo = inferGrupoCosto(it);
    const det = (it.detalle || {}) as CostItemDetalle;
    if (grupo === "alojamiento") {
      if (!det.package_id) continue;
      const mod = modalidades.find((m) => m.key === det.package_id);
      const unit = lodgingUnitCost(it, mod, supuestos) * factorImp;
      costo_alojamiento_unitario_por_modalidad[det.package_id] =
        (costo_alojamiento_unitario_por_modalidad[det.package_id] || 0) + unit;
      continue;
    }
    const totalItem = toBase(
      Number(it.cantidad || 0) * Number(it.precio_unitario || 0),
      it.moneda,
      supuestos,
    );
    if (grupo === "participante") participanteDirecto += totalItem;
    else if (grupo === "staff") staffTotalRaw += totalItem;
    else generalTotalRaw += totalItem;
  }

  const costo_participante_directo_unitario = participanteDirecto * factorImp;
  const costo_staff_total = staffTotalRaw * factorImp;
  const costo_general_total = generalTotalRaw * factorImp;
  const costo_staff_por_persona = escenario_inscriptos > 0 ? costo_staff_total / escenario_inscriptos : 0;
  const costo_general_por_persona = escenario_inscriptos > 0 ? costo_general_total / escenario_inscriptos : 0;

  const paquete_base_id = supuestos.paquete_base_id || null;
  const costo_alojamiento_base_unitario = paquete_base_id
    ? (costo_alojamiento_unitario_por_modalidad[paquete_base_id] || 0)
    : 0;

  const costo_base_unitario = costo_alojamiento_base_unitario
    + costo_participante_directo_unitario
    + costo_staff_por_persona
    + costo_general_por_persona;

  const aPrecio = (costo: number) => modo === "honorario_participante"
    ? costo + honorario
    : (margen < 1 ? costo / (1 - margen) : costo);

  const precio_base_sugerido = paquete_base_id ? aPrecio(costo_base_unitario) : 0;

  const suplemento_costo_por_modalidad: Record<string, number> = {};
  const suplemento_precio_por_modalidad: Record<string, number> = {};
  const precio_final_por_modalidad: Record<string, number> = {};
  modalidades.forEach((m) => {
    const dif = (costo_alojamiento_unitario_por_modalidad[m.key] || 0) - costo_alojamiento_base_unitario;
    const supCosto = m.key === paquete_base_id ? 0 : Math.max(0, dif);
    // El honorario se cobra una sola vez por persona: el suplemento no lo repite.
    const supPrecio = modo === "honorario_participante"
      ? supCosto
      : (margen < 1 ? supCosto / (1 - margen) : supCosto);
    suplemento_costo_por_modalidad[m.key] = supCosto;
    suplemento_precio_por_modalidad[m.key] = supPrecio;
    precio_final_por_modalidad[m.key] = paquete_base_id ? precio_base_sugerido + supPrecio : 0;
  });

  const distribucion_total = totalEsperados;
  const distribucion_valida = escenario_inscriptos > 0 && distribucion_total === escenario_inscriptos;

  let escenario_costo_total: number | null = null;
  let escenario_ingreso_total: number | null = null;
  let escenario_ganancia_total: number | null = null;
  let escenario_margen: number | null = null;
  let escenario_ganancia_por_participante: number | null = null;
  if (distribucion_valida && paquete_base_id) {
    let extraCosto = 0;
    let extraPrecio = 0;
    modalidades.forEach((m) => {
      const pax = Number(m.esperados) || 0;
      extraCosto += pax * (suplemento_costo_por_modalidad[m.key] || 0);
      extraPrecio += pax * (suplemento_precio_por_modalidad[m.key] || 0);
    });
    escenario_costo_total = escenario_inscriptos * costo_base_unitario + extraCosto;
    escenario_ingreso_total = escenario_inscriptos * precio_base_sugerido + extraPrecio;
    escenario_ganancia_total = escenario_ingreso_total - escenario_costo_total;
    escenario_margen = escenario_ingreso_total > 0 ? escenario_ganancia_total / escenario_ingreso_total : 0;
    escenario_ganancia_por_participante = escenario_ganancia_total / escenario_inscriptos;
  }


  return {
    total_costos_base,
    total_con_imprevistos,
    costos_fijos: costos_fijos * factorImp,
    costos_variables: costos_variables * factorImp,
    por_categoria,
    por_grupo,
    costo_por_modalidad,
    costo_unitario_por_modalidad,
    precio_sugerido_por_modalidad,
    ganancia_unitaria_por_modalidad,
    margen_estimado,
    ingreso_esperado,
    ganancia_estimada_total,
    ganancia_promedio_por_participante,
    punto_equilibrio,
    moneda_base: supuestos.moneda_base,
    costos_generales_prorrateables: costos_generales_prorrateables * factorImp,
    prorrateo_general_por_persona: prorrateo_general_por_persona * factorImp,
    rentabilidad_modo: modo,
    escenario_inscriptos,
    costo_participante_directo_unitario,
    costo_staff_total,
    costo_staff_por_persona,
    costo_general_total,
    costo_general_por_persona,
    costo_alojamiento_unitario_por_modalidad,
    paquete_base_id,
    costo_alojamiento_base_unitario,
    costo_base_unitario,
    precio_base_sugerido,
    suplemento_costo_por_modalidad,
    suplemento_precio_por_modalidad,
    precio_final_por_modalidad,
    distribucion_valida,
    distribucion_total,
    escenario_costo_total,
    escenario_ingreso_total,
    escenario_ganancia_total,
    escenario_margen,
    escenario_ganancia_por_participante,
  };
}
