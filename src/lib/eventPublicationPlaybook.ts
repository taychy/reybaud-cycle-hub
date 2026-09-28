/**
 * Playbook / Estado de publicación para eventos camp/viaje.
 *
 * Lógica pura: recibe datos reales ya cargados y devuelve 6 fases con sus
 * pendientes. Nunca publica ni modifica nada.
 *
 * Reglas clave:
 * - La capacidad comercial sale de los paquetes (cupo) o de events.max_capacity.
 *   Los escenarios del simulador (conservador/esperado/completo) NO son capacidad.
 * - El modelo de rentabilidad elegido en el presupuesto manda: si es honorario
 *   fijo por participante, no se exige ni se evalúa el margen porcentual.
 */

export type PhaseStatus = "completa" | "en_curso" | "bloqueada" | "pendiente";
export type CheckSeverity = "critico" | "recomendado";
export type CheckLink = "editar" | "presupuesto" | "gestion" | "checklist";

export interface PlaybookCheck {
  id: string;
  label: string;
  ok: boolean;
  severity: CheckSeverity;
  hint?: string;
  link?: CheckLink;
  manual?: boolean;
}

export interface PlaybookPhase {
  id: "producto" | "costeo" | "pricing" | "publico" | "qa" | "lanzamiento";
  numero: number;
  titulo: string;
  status: PhaseStatus;
  checks: PlaybookCheck[];
}

export interface PlaybookEventInput {
  date: string | null;
  end_date: string | null;
  same_day?: boolean | null;
  duration_days?: number | null;
  duration_nights?: number | null;
  description?: string | null;
  short_description?: string | null;
  image_url?: string | null;
  location?: string | null;
  level?: string | null;
  incluye?: string[] | null;
  no_incluye?: string[] | null;
  roadbook?: unknown;
  max_capacity?: number | null;
  payment_mode?: string | null;
  metadata?: Record<string, any> | null;
}

export interface PlaybookPackageInput {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number | null;
  cupo: number | null;
  activo: boolean;
  sin_alojamiento?: boolean | null;
  incluye_gastronomia?: boolean | null;
}

export interface PlaybookSimulationInput {
  pct_imprevistos?: number | null;
  pct_margen_objetivo?: number | null;
  rentabilidad_modo?: string | null;
  honorario_por_participante?: number | null;
  noches?: number | null;
  capacidad_total?: number | null;
  resultados?: Record<string, any> | null;
}

export interface PlaybookCostItemInput {
  id: string;
  grupo_costo: string | null;
  categoria: string | null;
  descripcion: string | null;
  detalle?: Record<string, any> | null;
}

export interface PlaybookChecklistState {
  qa?: Record<string, boolean>;
  launch?: Record<string, boolean>;
}

export interface PlaybookInput {
  event: PlaybookEventInput;
  packages: PlaybookPackageInput[];
  rooms: { package_id: string | null; capacidad: number | null }[];
  paymentPlans: { package_id: string; activo: boolean }[];
  simulation: PlaybookSimulationInput | null;
  costItems: PlaybookCostItemInput[];
  checklist: PlaybookChecklistState;
}

export interface PlaybookResult {
  phases: PlaybookPhase[];
  progress: number; // 0..100
  criticalPending: number;
  readyToPublish: boolean;
  capacidadComercial: number | null;
}

export const QA_ITEMS: { id: string; label: string }[] = [
  { id: "compra_doble", label: "Compra de prueba en habitación doble (o paquete compartido)" },
  { id: "compra_individual", label: "Compra de prueba en habitación individual (u otro paquete)" },
  { id: "sena_cuotas", label: "Seña y cuotas: importes y vencimientos correctos" },
  { id: "pago_mp", label: "Pago con Mercado Pago acreditado en la reserva" },
  { id: "pago_transferencia", label: "Transferencia: datos bancarios y comprobante correctos" },
  { id: "emails", label: "Emails de alta, pago y recordatorio recibidos y revisados" },
  { id: "cupos", label: "Cupos: se descuentan y se bloquea al completar" },
  { id: "post_compra", label: "Post-compra: mi reserva, checklist del viaje y roadbook" },
];

export const LAUNCH_ITEMS: { id: string; label: string }[] = [
  { id: "landing_revisada", label: "Landing / ficha pública revisada" },
  { id: "compra_control", label: "Compra de control interno realizada" },
  { id: "comunicacion_lista", label: "Comunicación de lanzamiento lista" },
];

const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const hasList = (v: unknown) =>
  Array.isArray(v) && v.some((x) => typeof x === "string" && x.trim().length > 0);

const hasRoadbook = (rb: unknown, meta: Record<string, any>) => {
  if (hasText(meta.itinerary) || hasList(meta.itinerary)) return true;
  if (rb == null) return false;
  if (Array.isArray(rb)) return rb.length > 0;
  if (typeof rb === "object") {
    const o = rb as Record<string, any>;
    return Object.values(o).some((v) =>
      Array.isArray(v) ? v.length > 0 : hasText(v) || (v && typeof v === "object" && Object.keys(v).length > 0),
    );
  }
  return hasText(rb);
};

/** Diferencia de días entre dos fechas "YYYY-MM-DD" sin desvío de zona horaria. */
export const nightsBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const p = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((p(to) - p(from)) / 86400000);
  return diff >= 0 ? diff : null;
};

const TAX_RE = /tasa|soggiorno|tur[ií]stic|city ?tax|kurtaxe|impuesto/i;
const TRANSPORT_RE = /transfer|traslado|bus|van|combi|tren|transporte/i;
const MEAL_RE = /desayuno|almuerzo|cena|comida|pensi[oó]n|media pensi|picnic|pic nic/i;

/** Capacidad comercial: suma de cupos de paquetes activos; si no hay, max_capacity del evento. */
export const capacidadComercial = (event: PlaybookEventInput, packages: PlaybookPackageInput[]): number | null => {
  const activos = packages.filter((p) => p.activo);
  const conCupo = activos.filter((p) => Number(p.cupo) > 0);
  if (conCupo.length > 0) return conCupo.reduce((s, p) => s + Number(p.cupo), 0);
  return event.max_capacity && event.max_capacity > 0 ? event.max_capacity : null;
};

const autoStatus = (checks: PlaybookCheck[]): PhaseStatus => {
  if (checks.every((c) => c.ok)) return "completa";
  if (checks.some((c) => !c.ok && c.severity === "critico")) return "bloqueada";
  return "en_curso";
};

const manualStatus = (checks: PlaybookCheck[]): PhaseStatus => {
  const done = checks.filter((c) => c.ok).length;
  if (done === checks.length) return "completa";
  if (done === 0) return "pendiente";
  return "en_curso";
};

const fmt = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function evaluatePlaybook(input: PlaybookInput): PlaybookResult {
  const { event, packages, rooms, paymentPlans, simulation, costItems, checklist } = input;
  const meta = event.metadata || {};
  const activos = packages.filter((p) => p.activo);
  const lodgingPkgs = activos.filter((p) => !p.sin_alojamiento);
  const res = (simulation?.resultados || {}) as Record<string, any>;
  const nights = event.same_day ? 0 : nightsBetween(event.date, event.end_date);

  const byGroup = (g: string) => costItems.filter((c) => c.grupo_costo === g);
  const alojLines = byGroup("alojamiento");
  const textOf = (c: PlaybookCostItemInput) => `${c.categoria || ""} ${c.descripcion || ""}`;

  /* ── 1. Producto ── */
  const producto: PlaybookCheck[] = [
    {
      id: "fechas", label: "Fecha de inicio y fin cargadas",
      ok: !!event.date && (!!event.same_day || !!event.end_date),
      severity: "critico", link: "editar",
      hint: !event.end_date && !event.same_day ? "Falta la fecha de fin del viaje." : undefined,
    },
  ];
  if (nights != null && simulation?.noches != null && Number(simulation.noches) > 0) {
    producto.push({
      id: "noches_coherentes", label: "Noches del presupuesto coinciden con las fechas",
      ok: Number(simulation.noches) === nights, severity: "recomendado", link: "presupuesto",
      hint: `Fechas: ${nights} noches · Presupuesto: ${simulation.noches} noches.`,
    });
  }
  producto.push(
    { id: "itinerario", label: "Itinerario / roadbook cargado", ok: hasRoadbook(event.roadbook, meta), severity: "critico", link: "gestion" },
    { id: "incluye", label: "Qué incluye (actividades, servicios)", ok: hasList(event.incluye) || hasText(meta.included_text), severity: "critico", link: "editar" },
    { id: "no_incluye", label: "Qué no incluye", ok: hasList(event.no_incluye) || hasText(meta.not_included_text), severity: "recomendado", link: "editar" },
    {
      id: "comidas", label: "Comidas definidas",
      ok: activos.some((p) => p.incluye_gastronomia) || costItems.some((c) => c.categoria === "comida" && c.grupo_costo !== "staff") || alojLines.some((c) => MEAL_RE.test(c.descripcion || "")),
      severity: "recomendado", link: "presupuesto",
    },
    {
      id: "transporte", label: "Transporte / traslados definidos",
      ok: costItems.some((c) => c.grupo_costo !== "staff" && (c.categoria === "transporte" || TRANSPORT_RE.test(c.descripcion || ""))),
      severity: "recomendado", link: "presupuesto",
    },
    { id: "staff", label: "Staff definido (costos de staff cargados)", ok: byGroup("staff").length > 0, severity: "recomendado", link: "presupuesto" },
  );

  /* ── 2. Costeo ── */
  const costeo: PlaybookCheck[] = [
    { id: "presupuesto", label: "Presupuesto creado", ok: !!simulation, severity: "critico", link: "presupuesto" },
  ];
  if (simulation) {
    const sinLinea = lodgingPkgs.filter((p) => !alojLines.some((c) => c.detalle?.package_id === p.id));
    costeo.push({
      id: "alojamiento_paquetes", label: "Alojamiento costeado para cada paquete con alojamiento",
      ok: lodgingPkgs.length === 0 || sinLinea.length === 0, severity: "critico", link: "presupuesto",
      hint: sinLinea.length ? `Sin costo de alojamiento: ${sinLinea.map((p) => p.nombre).join(", ")}.` : undefined,
    });
    const nochesCero = alojLines.filter((c) => c.detalle && Number(c.detalle.noches || 0) === 0);
    const nochesCeroCritico = nochesCero.filter((c) => c.detalle?.cost_basis !== "persona_estadia");
    if (nochesCero.length) {
      costeo.push({
        id: "alojamiento_noches", label: "Líneas de alojamiento con noches cargadas",
        ok: false, severity: nochesCeroCritico.length ? "critico" : "recomendado", link: "presupuesto",
        hint: nochesCeroCritico.length
          ? `${nochesCeroCritico.length} línea(s) por noche con 0 noches: el costo da 0.`
          : `${nochesCero.length} línea(s) con 0 noches (precio por estadía: no cambia el importe, pero el dato queda mal).`,
      });
    }
    const sinDesc = costItems.filter((c) => !hasText(c.descripcion));
    costeo.push({
      id: "descripciones", label: "Todas las líneas de costo tienen descripción",
      ok: sinDesc.length === 0, severity: "recomendado", link: "presupuesto",
      hint: sinDesc.length ? `${sinDesc.length} línea(s) sin descripción.` : undefined,
    });
    costeo.push(
      { id: "staff_costo", label: "Costos de staff cargados", ok: byGroup("staff").length > 0, severity: "recomendado", link: "presupuesto" },
      {
        id: "imprevistos", label: "Imprevistos / contingencia configurados",
        ok: Number(simulation.pct_imprevistos || 0) > 0, severity: "recomendado", link: "presupuesto",
        hint: `Actual: ${fmt(Number(simulation.pct_imprevistos || 0))} %.`,
      },
      {
        id: "tasas", label: "Tasas / impuestos turísticos definidos",
        ok: costItems.some((c) => TAX_RE.test(textOf(c))) || hasText(meta.tourist_tax_note) || [...(event.incluye || []), ...(event.no_incluye || [])].some((t) => TAX_RE.test(t || "")),
        severity: "recomendado", link: "presupuesto",
        hint: "Cargar el costo o aclarar en Incluye / No incluye si se paga en destino.",
      },
    );
  }

  /* ── 3. Pricing ── */
  const pricing: PlaybookCheck[] = [];
  const conPrecio = activos.filter((p) => Number(p.precio) > 0);
  pricing.push({
    id: "paquetes_precio", label: "Paquetes activos con precio",
    ok: activos.length > 0 && conPrecio.length === activos.length, severity: "critico", link: "gestion",
    hint: activos.length === 0 ? "No hay paquetes activos." : conPrecio.length < activos.length ? "Hay paquetes sin precio." : undefined,
  });
  if (simulation) {
    const modo = simulation.rentabilidad_modo || "margen";
    if (modo === "honorario_participante") {
      pricing.push({
        id: "rentabilidad_modelo", label: "Honorario por participante definido (modelo elegido)",
        ok: Number(simulation.honorario_por_participante || 0) > 0, severity: "critico", link: "presupuesto",
        hint: "Con honorario fijo no se exige margen porcentual.",
      });
    } else {
      pricing.push({
        id: "rentabilidad_modelo", label: "Margen objetivo definido (modelo elegido)",
        ok: Number(simulation.pct_margen_objetivo || 0) > 0, severity: "critico", link: "presupuesto",
      });
    }
    const costoUnit = (res.costo_unitario_por_modalidad || {}) as Record<string, number>;
    const bajoCosto = conPrecio.filter((p) => costoUnit[p.id] != null && Number(p.precio) < Number(costoUnit[p.id]));
    pricing.push({
      id: "precio_sobre_costo", label: "Ningún paquete se vende por debajo de su costo",
      ok: bajoCosto.length === 0, severity: "critico", link: "presupuesto",
      hint: bajoCosto.length ? bajoCosto.map((p) => `${p.nombre}: ${fmt(Number(p.precio))} < costo ${fmt(costoUnit[p.id])}`).join(" · ") : undefined,
    });
    const sugerido = (res.precio_final_por_modalidad || {}) as Record<string, number>;
    const distintos = conPrecio.filter((p) => {
      const s = Number(sugerido[p.id]);
      return s > 0 && Math.abs(Number(p.precio) - s) / s > 0.01;
    });
    pricing.push({
      id: "precio_vs_presupuesto", label: "Precios de paquetes alineados con el presupuesto",
      ok: distintos.length === 0, severity: "recomendado", link: "presupuesto",
      hint: distintos.length ? distintos.map((p) => `${p.nombre}: publicado ${fmt(Number(p.precio))} · sugerido ${fmt(Number(sugerido[p.id]))}`).join(" · ") : undefined,
    });
  }
  if ((event.payment_mode || "cuotas") === "cuotas") {
    const conPlan = new Set(paymentPlans.filter((pp) => pp.activo).map((pp) => pp.package_id));
    const legacy = !!meta.installments_enabled && Array.isArray(meta.installments) && meta.installments.length > 0;
    const faltan = activos.filter((p) => !conPlan.has(p.id));
    pricing.push({
      id: "plan_pago", label: "Seña / plan de cuotas configurado",
      ok: activos.length > 0 && (legacy || faltan.length === 0), severity: "critico", link: "gestion",
      hint: !legacy && faltan.length ? `Sin plan de pago: ${faltan.map((p) => p.nombre).join(", ")}.` : undefined,
    });
  }
  const cap = capacidadComercial(event, packages);
  pricing.push({
    id: "capacidad", label: "Capacidad comercial definida (cupos de paquetes)",
    ok: cap != null, severity: "critico", link: "gestion",
    hint: cap != null ? `Capacidad comercial: ${cap} lugares.` : "Definí el cupo de cada paquete.",
  });
  const desajustes = lodgingPkgs.filter((p) => {
    const plazas = rooms.filter((r) => r.package_id === p.id).reduce((s, r) => s + Number(r.capacidad || 0), 0);
    return plazas > 0 && Number(p.cupo) > 0 && plazas !== Number(p.cupo);
  });
  if (desajustes.length) {
    pricing.push({
      id: "cupo_habitaciones", label: "Cupos coinciden con las habitaciones cargadas",
      ok: false, severity: "recomendado", link: "gestion",
      hint: desajustes.map((p) => {
        const plazas = rooms.filter((r) => r.package_id === p.id).reduce((s, r) => s + Number(r.capacidad || 0), 0);
        return `${p.nombre}: cupo ${p.cupo} · habitaciones ${plazas} plazas`;
      }).join(" · "),
    });
  }
  if (cap != null && simulation?.capacidad_total && Number(simulation.capacidad_total) !== cap) {
    pricing.push({
      id: "capacidad_presupuesto", label: "Capacidad del presupuesto igual a la comercial",
      ok: false, severity: "recomendado", link: "presupuesto",
      hint: `Presupuesto: ${simulation.capacidad_total} · Comercial: ${cap}. Los escenarios del simulador no cambian la capacidad.`,
    });
  }

  /* ── 4. Producto público ── */
  const publico: PlaybookCheck[] = [
    { id: "descripcion", label: "Descripción", ok: hasText(event.description), severity: "critico", link: "editar" },
    { id: "descripcion_corta", label: "Descripción corta", ok: hasText(event.short_description), severity: "recomendado", link: "editar" },
    { id: "fechas_publicas", label: "Fechas visibles", ok: !!event.date && (!!event.same_day || !!event.end_date), severity: "critico", link: "editar" },
    { id: "itinerario_publico", label: "Itinerario disponible", ok: hasRoadbook(event.roadbook, meta), severity: "critico", link: "gestion" },
    { id: "lugar", label: "Destino / lugar", ok: hasText(event.location) || hasText(meta.destination) || hasText(meta.city), severity: "critico", link: "editar" },
    { id: "imagen", label: "Imagen principal", ok: hasText(event.image_url), severity: "critico", link: "editar" },
    { id: "nivel", label: "Nivel recomendado", ok: hasText(event.level) || hasText(meta.recommended_level), severity: "recomendado", link: "editar" },
    {
      id: "hoteleria", label: "Hotelería descripta",
      ok: hasText(meta.lodging_name) || alojLines.some((c) => hasText(c.descripcion)) || lodgingPkgs.length === 0,
      severity: "recomendado", link: "editar",
    },
    { id: "incluye_publico", label: "Incluye / no incluye visibles", ok: (hasList(event.incluye) || hasText(meta.included_text)) && (hasList(event.no_incluye) || hasText(meta.not_included_text)), severity: "critico", link: "editar" },
    {
      id: "paquetes_descripcion", label: "Paquetes con descripción",
      ok: activos.length > 0 && activos.every((p) => hasText(p.descripcion)), severity: "recomendado", link: "gestion",
    },
    { id: "terminos", label: "Términos / condiciones o FAQ", ok: hasText(meta.terms_text) || hasText(meta.faq), severity: "recomendado", link: "editar" },
  ];

  /* ── 5 y 6. Manuales ── */
  const qa: PlaybookCheck[] = QA_ITEMS.map((i) => ({ ...i, ok: !!checklist.qa?.[i.id], severity: "critico", manual: true, link: "checklist" }));
  const launch: PlaybookCheck[] = LAUNCH_ITEMS.map((i) => ({ ...i, ok: !!checklist.launch?.[i.id], severity: "recomendado", manual: true, link: "checklist" }));

  const phases: PlaybookPhase[] = [
    { id: "producto", numero: 1, titulo: "Producto", checks: producto, status: autoStatus(producto) },
    { id: "costeo", numero: 2, titulo: "Costeo", checks: costeo, status: autoStatus(costeo) },
    { id: "pricing", numero: 3, titulo: "Pricing", checks: pricing, status: autoStatus(pricing) },
    { id: "publico", numero: 4, titulo: "Producto público", checks: publico, status: autoStatus(publico) },
    { id: "qa", numero: 5, titulo: "QA de compra", checks: qa, status: manualStatus(qa) },
    { id: "lanzamiento", numero: 6, titulo: "Lanzamiento", checks: launch, status: manualStatus(launch) },
  ];

  const all = phases.flatMap((p) => p.checks);
  const auto = phases.slice(0, 4).flatMap((p) => p.checks);
  const criticalPending = auto.filter((c) => !c.ok && c.severity === "critico").length;
  const qaDone = qa.every((c) => c.ok);

  return {
    phases,
    progress: Math.round((all.filter((c) => c.ok).length / all.length) * 100),
    criticalPending,
    readyToPublish: criticalPending === 0 && qaDone,
    capacidadComercial: cap,
  };
}
